// stepUp.js
//
// Reconfirmação de identidade antes de ações sensíveis (excluir
// prontuário, alterar prescrição, conceder acesso admin), mesmo com a
// sessão já totalmente autenticada. Espelha o backend em
// src/domains/auth/step_up.py -- ver aquele arquivo para o fluxo
// completo do lado servidor.
//
// Uso:
//   import { pedirConfirmacao, ConfirmacaoCanceladaError } from "../../../shared/stepUp.js";
//
//   async function excluirProntuario(id) {
//     let token;
//     try {
//       token = await pedirConfirmacao("excluir_prontuario");
//     } catch (erro) {
//       if (erro instanceof ConfirmacaoCanceladaError) return; // usuário desistiu, sem erro pra mostrar
//       exibirMensagem(erro.message, "erro");
//       return;
//     }
//
//     const resp = await fetch(`${URL_BASE_API}/prontuarios/${id}`, {
//       method: "DELETE",
//       credentials: "include",
//       headers: { "X-Stepup-Token": token },
//     });
//     // Se o backend responder 403 confirmacao_requerida mesmo assim
//     // (ex: token expirou entre a confirmação e o clique), é seguro
//     // chamar pedirConfirmacao() de novo -- ela sempre inicia do zero.
//   }
//
// O QUE ESTE MÓDULO NUNCA FAZ (de propósito, por segurança):
// - Nunca guarda o token em localStorage/sessionStorage -- só na
//   variável local da própria chamada, descartada ao retornar.
// - Nunca reutiliza um token entre chamadas de pedirConfirmacao(),
//   mesmo para a mesma `acao` -- cada ação sensível precisa de uma
//   reconfirmação própria. Cache de token aqui recriaria o bypass que
//   o step-up existe para evitar.
// - Nunca decide sozinho que uma ação "não precisa mais" de
//   confirmação -- essa decisão é 100% do backend
//   (requer_confirmacao_recente); este módulo só executa o fluxo
//   quando chamado.

import { startAuthentication } from "https://cdn.jsdelivr.net/npm/@simplewebauthn/browser@11/dist/bundle/index.js";
import { URL_BASE_API, FRONT_ORIGIN } from "../../config.js";

// Origin exata do frontend em produção -- usada para travar tanto o
// postMessage recebido do popup quanto o window.open, evitando que
// qualquer outra origin consiga mandar um token falso para esta
// janela. Preencher com a URL real (ex: "https://app.bion.com") antes
// de subir para produção; localhost é aceito automaticamente em dev.
const FRONTEND_ORIGIN = FRONT_ORIGIN;

function origemEhConfiavel(origin) {
  return origin === FRONTEND_ORIGIN || origin === window.location.origin;
}

/**
 * Lançado quando o usuário fecha o modal ou o popup sem concluir a
 * confirmação. Quem chama deve tratar isso como "desistiu", não como
 * uma falha a ser exibida em vermelho.
 */
export class ConfirmacaoCanceladaError extends Error {
  constructor(mensagem = "Confirmação cancelada.") {
    super(mensagem);
    this.name = "ConfirmacaoCanceladaError";
  }
}

/**
 * Lançado quando o navegador bloqueou o popup do Google (bloqueador
 * de pop-up ativo). Quem chama deve orientar o usuário a permitir
 * pop-ups para este site, já que não há como contornar isso via JS.
 */
export class PopupBloqueadoError extends Error {
  constructor(mensagem = "O navegador bloqueou a janela de confirmação. Permita pop-ups para este site e tente novamente.") {
    super(mensagem);
    this.name = "PopupBloqueadoError";
  }
}

/**
 * Pede reconfirmação de identidade para `acao` e resolve com o token
 * de step-up (para enviar em `X-Stepup-Token`).
 *
 * Abre um modal próprio (injetado sob demanda, ver
 * garantirModalCarregado()) que:
 *  - descreve a ação em texto claro, para o usuário saber o que está
 *    prestes a confirmar;
 *  - usa WebAuthn diretamente se o usuário tiver credencial cadastrada
 *    (sem popup -- é local, via navigator.credentials);
 *  - ou pede a senha atual e abre um popup para o Google, se não
 *    tiver WebAuthn (fallback).
 *
 * @param {string} acao Identificador da ação sensível (mesmo valor
 *   usado no decorator @requer_confirmacao_recente do backend).
 * @returns {Promise<string>} O token de confirmação, de uso único e
 *   curta duração -- envie imediatamente, nunca armazene.
 * @throws {ConfirmacaoCanceladaError} Se o usuário desistir.
 * @throws {PopupBloqueadoError} Se o navegador bloquear o popup do
 *   fallback Google.
 * @throws {Error} Falha de rede ou erro inesperado do backend.
 */
export async function pedirConfirmacao(acao) {
  await garantirModalCarregado();
  return abrirModalConfirmacao(acao);
}

// ============================================
// Carregamento sob demanda do partial do modal
// (mesmo padrão de settingsLoader.js: HTML injetado uma vez, cacheado
// via módulo -- chamadas repetidas a pedirConfirmacao() reusam o
// mesmo modal já no DOM).
// ============================================

const PARTIAL_PATH = "../../../html/user/stepupModal.html";
let modalCarregadoPromise = null;

function garantirModalCarregado() {
  if (modalCarregadoPromise) return modalCarregadoPromise;

  modalCarregadoPromise = (async () => {
    const resposta = await fetch(PARTIAL_PATH);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status} ao carregar stepUpModal.html`);
    const html = await resposta.text();
    document.body.insertAdjacentHTML("beforeend", html);
  })();

  return modalCarregadoPromise;
}

// ============================================
// Orquestração do modal
// ============================================

function abrirModalConfirmacao(acao) {
  return new Promise((resolve, reject) => {
    const overlay = document.getElementById("stepup-overlay");
    const tituloAcao = document.getElementById("stepup-acao-nome");
    const btnFechar = document.getElementById("stepup-fechar");
    const btnCancelar = document.getElementById("stepup-cancelar");
    const painelCarregando = document.getElementById("stepup-painel-carregando");
    const painelWebauthn = document.getElementById("stepup-painel-webauthn");
    const painelSenha = document.getElementById("stepup-painel-senha");
    const formSenha = document.getElementById("stepup-form-senha");
    const inputSenha = document.getElementById("stepup-senha");
    const feedback = document.getElementById("stepup-feedback");
    const btnTentarWebauthnNovamente = document.getElementById("stepup-tentar-novamente");

    let finalizado = false;
    let popupRef = null;
    let popupPollId = null;

    function limparEstadoVisual() {
      [painelCarregando, painelWebauthn, painelSenha].forEach(p => p.hidden = true);
      feedback.textContent = "";
      feedback.className = "stepup-feedback";
    }

    function mostrarErro(mensagem) {
      feedback.textContent = mensagem;
      feedback.className = "stepup-feedback erro";
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
        painelSenha.hidden = false;
        inputSenha.value = "";
        inputSenha.focus();
      }
    }

    // ---- Caminho WebAuthn: sem popup, local ao navegador ----
    async function executarWebauthn(options) {
      let credencial;
      try {
        credencial = await startAuthentication({ optionsJSON: options });
      } catch (erro) {
        mostrarErro("Não foi possível confirmar via chave de segurança. Você pode tentar de novo.");
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
    btnFechar.addEventListener("click", onCancelar);
    btnCancelar.addEventListener("click", onCancelar);
    overlay.addEventListener("click", onClickOverlay);
    document.addEventListener("keydown", onKeydown);
    btnTentarWebauthnNovamente?.addEventListener("click", onTentarWebauthnNovamente);

    iniciar();
  });
}

function mensagemParaErroCallback(codigo) {
  switch (codigo) {
    case "reautenticacao_expirada":
      return "O tempo para confirmar expirou. Tente novamente.";
    case "conta_google_nao_corresponde":
      return "A conta Google usada não corresponde à sua conta.";
    case "falha_google":
      return "Não foi possível confirmar com o Google. Tente novamente.";
    default:
      return "Não foi possível concluir a confirmação. Tente novamente.";
  }
}