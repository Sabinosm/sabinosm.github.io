// stepUpOrchestratorHelpers/stepUpCaminhoFallback.js
//
// Caminho 3 (fallback, sempre disponível) -- senha atual + popup do
// Google. O step-up NUNCA fica sem saída: mesmo quem tem WebAuthn
// e/ou TOTP mas esgotou os dois chega aqui (ver docstring de
// step_up.py para o racional).

import { URL_BASE_API, FRONT_ORIGIN } from "../../urlConfig.js";
import { PopupBloqueadoError, mensagemParaErroCallback } from "../stepUpErros.js";
import { mostrarErro } from "./stepUpUi.js";
import { resolverComToken } from "./stepUpCicloDeVida.js";

// Origin exata do frontend em produção -- usada para travar tanto o
// postMessage recebido do popup quanto o window.open, evitando que
// qualquer outra origin consiga mandar um token falso para esta
// janela. Preencher com a URL real (ex: "https://app.bion.com") antes
// de subir para produção; localhost é aceito automaticamente em dev.
const FRONTEND_ORIGIN = FRONT_ORIGIN;

function origemEhConfiavel(origin) {
  return origin === FRONTEND_ORIGIN || origin === window.location.origin;
}

export async function onSubmitSenha(ctx, e) {
  e.preventDefault();
  const { inputSenha, feedback } = ctx.refs;
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
      body: JSON.stringify({ acao: ctx.acao, senha }),
    });
    dados = await resp.json();
    if (!resp.ok) throw new Error(dados.erro || "Senha incorreta.");
  } catch (erro) {
    mostrarErro(ctx, erro.message || "Não foi possível confirmar a senha.");
    return;
  }

  abrirPopupGoogle(ctx, dados.redirect_url);
}

function abrirPopupGoogle(ctx, redirectUrl) {
  const { feedback } = ctx.refs;

  const largura = 480;
  const altura = 640;
  const esquerda = window.screenX + (window.outerWidth - largura) / 2;
  const topo = window.screenY + (window.outerHeight - altura) / 2;

  ctx.popupRef = window.open(
    redirectUrl,
    "stepup-google",
    `width=${largura},height=${altura},left=${esquerda},top=${topo}`
  );

  if (!ctx.popupRef) {
    mostrarErro(ctx, new PopupBloqueadoError().message);
    return;
  }

  feedback.textContent = "Complete a confirmação na janela que abrimos.";
  feedback.className = "stepup-feedback info";

  // Registrado com { signal: ctx.signal } -- encerrar() remove via
  // abort(), como todos os outros listeners do modal.
  window.addEventListener("message", (event) => ouvirMensagemPopup(ctx, event), { signal: ctx.signal });

  // Se o usuário fechar o popup manualmente sem completar, avisa
  // e deixa o modal principal aberto (pode tentar de novo, sem
  // precisar redigitar a senha -- a etapa 1 do backend já ficou
  // confirmada por DURACAO_REAUTENTICACAO_SEGUNDOS).
  ctx.popupPollId = setInterval(() => {
    if (ctx.popupRef.closed) {
      clearInterval(ctx.popupPollId);
      ctx.popupPollId = null;
      if (!ctx.finalizado) {
        mostrarErro(ctx, "Janela fechada antes de concluir. Tente novamente.");
      }
    }
  }, 500);
}

function ouvirMensagemPopup(ctx, event) {
  if (!origemEhConfiavel(event.origin)) return; // ignora qualquer origin não confiável
  if (!event.data || event.data.tipo !== "stepup-resultado") return;

  const { token, acao: acaoRecebida, erro } = event.data;

  if (erro) {
    mostrarErro(ctx, mensagemParaErroCallback(erro));
    return;
  }

  if (acaoRecebida !== ctx.acao) {
    // Nunca deveria acontecer (o backend vincula o token à ação
    // desde /stepup/iniciar), mas não aceita silenciosamente algo
    // que não bate com o que este modal pediu.
    mostrarErro(ctx, "A confirmação recebida não corresponde a esta ação.");
    return;
  }

  resolverComToken(ctx, token);
}