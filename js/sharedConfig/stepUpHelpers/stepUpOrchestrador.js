// stepUpHelpers/stepUpOrchestrador.js
//
// Orquestração do modal de step-up: abre o overlay, pergunta ao
// backend qual método usar e conduz os três caminhos possíveis --
// WebAuthn (sem popup), TOTP (segundo método) e fallback senha +
// popup do Google (sempre disponível como último recurso).
//
// Esta é uma closure de propósito: as funções internas compartilham
// o estado local (finalizado, popupRef, encerrar, resolve/reject),
// e quebrar isso em módulos separados espalharia esse estado por
// parâmetros sem ganho real. O que era separável (fila, loader,
// erros) já foi para os seus próprios módulos.

import { startAuthentication } from "https://cdn.jsdelivr.net/npm/@simplewebauthn/browser@11/dist/bundle/index.js";
import { URL_BASE_API, FRONT_ORIGIN } from "../../urlConfig.js";
import { iniciarStepUpTOTP, confirmarStepUpTOTP, TotpNaoCadastradoError, LimiteTentativasTotpExcedidoError, CodigoTotpInvalidoError } from "../../pages/auth/totp.js";
import { ConfirmacaoCanceladaError, PopupBloqueadoError, mensagemParaErroCallback } from "./stepUpErros.js";

// Origin exata do frontend em produção -- usada para travar tanto o
// postMessage recebido do popup quanto o window.open, evitando que
// qualquer outra origin consiga mandar um token falso para esta
// janela. Preencher com a URL real (ex: "https://app.bion.com") antes
// de subir para produção; localhost é aceito automaticamente em dev.
const FRONTEND_ORIGIN = FRONT_ORIGIN;

function origemEhConfiavel(origin) {
  return origin === FRONTEND_ORIGIN || origin === window.location.origin;
}

export function abrirModalConfirmacao(acao) {
  return new Promise((resolve, reject) => {
    const overlay = document.getElementById("stepup-overlay");
    const tituloAcao = document.getElementById("stepup-acao-nome");
    const btnFechar = document.getElementById("stepup-fechar");
    const btnCancelar = document.getElementById("stepup-cancelar");
    const painelCarregando = document.getElementById("stepup-painel-carregando");
    const painelWebauthn = document.getElementById("stepup-painel-webauthn");
    const painelTotp = document.getElementById("stepup-painel-totp");
    const painelSenha = document.getElementById("stepup-painel-senha");
    const formSenha = document.getElementById("stepup-form-senha");
    const formTotp = document.getElementById("stepup-form-totp");
    const inputTotp = document.getElementById("stepup-totp-codigo");
    const inputSenha = document.getElementById("stepup-senha");
    const feedback = document.getElementById("stepup-feedback");
    const btnTentarWebauthnNovamente = document.getElementById("stepup-tentar-novamente");

    let finalizado = false;
    let popupRef = null;
    let popupPollId = null;

    function limparEstadoVisual() {
      [painelCarregando, painelWebauthn, painelTotp, painelSenha].forEach(p => p.hidden = true);
      feedback.textContent = "";
      feedback.className = "stepup-feedback";
    }

    function mostrarErro(mensagem) {
      feedback.textContent = mensagem;
      feedback.className = "stepup-feedback erro";
    }

    function mostrarPainelSenha() {
      painelSenha.hidden = false;
      inputSenha.value = "";
      inputSenha.focus();
    }

    function encerrar() {
      if (finalizado) return;
      finalizado = true;
      if (popupPollId !== null) clearInterval(popupPollId);
      if (popupRef && !popupRef.closed) popupRef.close();
      window.removeEventListener("message", ouvirMensagemPopup);
      overlay.classList.remove("stepup-overlay--visible");
      document.body.classList.remove("no-scroll");
      formSenha.removeEventListener("submit", onSubmitSenha);
      formTotp.removeEventListener("submit", onSubmitTotp);
      btnFechar.removeEventListener("click", onCancelar);
      btnCancelar.removeEventListener("click", onCancelar);
      overlay.removeEventListener("click", onClickOverlay);
      document.removeEventListener("keydown", onKeydown);
      btnTentarWebauthnNovamente?.removeEventListener("click", onTentarWebauthnNovamente);
    }

    function onCancelar() {
      encerrar();
      reject(new ConfirmacaoCanceladaError());
    }

    function onClickOverlay(e) {
      if (e.target === overlay) onCancelar();
    }

    function onKeydown(e) {
      if (e.key === "Escape") onCancelar();
    }

    function resolverComToken(token) {
      encerrar();
      resolve(token);
    }

    // ---- Etapa 1: perguntar ao backend qual método usar ----
    async function iniciar() {
      limparEstadoVisual();
      tituloAcao.textContent = acao;
      overlay.classList.add("stepup-overlay--visible");
      document.body.classList.add("no-scroll");
      painelCarregando.hidden = false;

      let dados;
      try {
        const resp = await fetch(`${URL_BASE_API}/stepup/iniciar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ acao }),
        });
        dados = await resp.json();
        if (!resp.ok) throw new Error(dados.erro || "Não foi possível iniciar a confirmação.");
      } catch (erro) {
        encerrar();
        reject(erro instanceof Error ? erro : new Error("Não foi possível iniciar a confirmação."));
        return;
      }

      painelCarregando.hidden = true;

      if (dados.metodo === "webauthn") {
        painelWebauthn.hidden = false;
        executarWebauthn(dados);
      } else {
        mostrarPainelSenha();
      }
    }

    // ---- Caminho WebAuthn: sem popup, local ao navegador ----
    // ALTERADO: ao falhar (qualquer motivo -- cancelamento, timeout,
    // sem autenticador, assinatura inválida), não oferece mais só
    // "tentar de novo" no mesmo WebAuthn -- tenta TOTP como próximo
    // método. Se o usuário quiser insistir no WebAuthn mesmo assim,
    // o botão "Tentar novamente" continua disponível no painel
    // WebAuthn (btnTentarWebauthnNovamente) para esse caso.
    async function executarWebauthn(options) {
      let credencial;
      try {
        credencial = await startAuthentication({ optionsJSON: options });
      } catch (erro) {
        mostrarErro("Não foi possível confirmar via chave de segurança.");
        await tentarProximoMetodoTotp();
        return;
      }

      try {
        const resp = await fetch(`${URL_BASE_API}/stepup/confirmar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ acao, credencial }),
        });
        const dados = await resp.json();
        if (!resp.ok) throw new Error(dados.erro || "Confirmação recusada.");
        resolverComToken(dados.token_confirmacao);
      } catch (erro) {
        mostrarErro(erro.message || "Não foi possível confirmar sua identidade.");
        await tentarProximoMetodoTotp();
      }
    }

    // ---- Caminho TOTP: segundo método, só depois do WebAuthn falhar ----
    async function tentarProximoMetodoTotp() {
      try {
        await iniciarStepUpTOTP(acao);
        painelWebauthn.hidden = true;
        painelTotp.hidden = false;
        feedback.textContent = "";
        feedback.className = "stepup-feedback";
        inputTotp.value = "";
        inputTotp.focus();
      } catch (erroTotp) {
        if (erroTotp instanceof TotpNaoCadastradoError) {
          // Usuário não tem TOTP -- ALTERADO: em vez de manter só o
          // painel WebAuthn (que acabou de falhar), oferece o
          // fallback senha+Google diretamente. Mesmo racional de
          // step_up.py: o step-up sempre mantém uma saída disponível.
          painelWebauthn.hidden = true;
          mostrarPainelSenha();
          return;
        }
        console.error("stepUp: falha ao iniciar TOTP", erroTotp);
        mostrarErro("Não foi possível verificar o método de confirmação por código.");
      }
    }

    async function onSubmitTotp(e) {
      e.preventDefault();
      const codigo = inputTotp.value.trim();
      if (!codigo) return;

      const botaoSubmit = formTotp.querySelector("button[type=submit]");
      botaoSubmit.disabled = true;

      try {
        const token = await confirmarStepUpTOTP(acao, codigo);
        resolverComToken(token);
      } catch (erroTotp) {
        botaoSubmit.disabled = false;

        if (erroTotp instanceof LimiteTentativasTotpExcedidoError) {
          // ALTERADO: diferente da versão anterior deste módulo, isso
          // NÃO é mais fim de linha -- cai no fallback senha+Google,
          // igual a quando o usuário não tem WebAuthn nem TOTP (ver
          // docstring de step_up.py: o step-up sempre mantém uma
          // saída, diferente do login).
          painelTotp.hidden = true;
          mostrarErro("Não foi possível confirmar pelo aplicativo autenticador.");
          mostrarPainelSenha();
          return;
        }

        if (erroTotp instanceof CodigoTotpInvalidoError) {
          mostrarErro(
            `${erroTotp.message}${erroTotp.tentativasRestantes != null ? ` (${erroTotp.tentativasRestantes} tentativa(s) restante(s))` : ""}`
          );
          inputTotp.value = "";
          inputTotp.focus();
          return;
        }

        mostrarErro(erroTotp.message || "Não foi possível confirmar o código.");
      }
    }

    function onTentarWebauthnNovamente() {
      feedback.textContent = "";
      feedback.className = "stepup-feedback";
      iniciar();
    }

    // ---- Caminho fallback: senha + popup do Google ----
    async function onSubmitSenha(e) {
      e.preventDefault();
      const senha = inputSenha.value;
      if (!senha) return;

      feedback.textContent = "";
      feedback.className = "stepup-feedback";

      let dados;
      try {
        const resp = await fetch(`${URL_BASE_API}/stepup/senha/confirmar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ acao, senha }),
        });
        dados = await resp.json();
        if (!resp.ok) throw new Error(dados.erro || "Senha incorreta.");
      } catch (erro) {
        mostrarErro(erro.message || "Não foi possível confirmar a senha.");
        return;
      }

      abrirPopupGoogle(dados.redirect_url);
    }

    function abrirPopupGoogle(redirectUrl) {
      const largura = 480;
      const altura = 640;
      const esquerda = window.screenX + (window.outerWidth - largura) / 2;
      const topo = window.screenY + (window.outerHeight - altura) / 2;

      popupRef = window.open(
        redirectUrl,
        "stepup-google",
        `width=${largura},height=${altura},left=${esquerda},top=${topo}`
      );

      if (!popupRef) {
        mostrarErro(new PopupBloqueadoError().message);
        return;
      }

      feedback.textContent = "Complete a confirmação na janela que abrimos.";
      feedback.className = "stepup-feedback info";

      window.addEventListener("message", ouvirMensagemPopup);

      // Se o usuário fechar o popup manualmente sem completar, avisa
      // e deixa o modal principal aberto (pode tentar de novo, sem
      // precisar redigitar a senha -- a etapa 1 do backend já ficou
      // confirmada por DURACAO_REAUTENTICACAO_SEGUNDOS).
      popupPollId = setInterval(() => {
        if (popupRef.closed) {
          clearInterval(popupPollId);
          popupPollId = null;
          if (!finalizado) {
            mostrarErro("Janela fechada antes de concluir. Tente novamente.");
          }
        }
      }, 500);
    }

    function ouvirMensagemPopup(event) {
      if (!origemEhConfiavel(event.origin)) return; // ignora qualquer origin não confiável
      if (!event.data || event.data.tipo !== "stepup-resultado") return;

      const { token, acao: acaoRecebida, erro } = event.data;

      if (erro) {
        mostrarErro(mensagemParaErroCallback(erro));
        return;
      }

      if (acaoRecebida !== acao) {
        // Nunca deveria acontecer (o backend vincula o token à ação
        // desde /stepup/iniciar), mas não aceita silenciosamente algo
        // que não bate com o que este modal pediu.
        mostrarErro("A confirmação recebida não corresponde a esta ação.");
        return;
      }

      resolverComToken(token);
    }

    formSenha.addEventListener("submit", onSubmitSenha);
    formTotp.addEventListener("submit", onSubmitTotp);
    btnFechar.addEventListener("click", onCancelar);
    btnCancelar.addEventListener("click", onCancelar);
    overlay.addEventListener("click", onClickOverlay);
    document.addEventListener("keydown", onKeydown);
    btnTentarWebauthnNovamente?.addEventListener("click", onTentarWebauthnNovamente);

    iniciar();
  });
}