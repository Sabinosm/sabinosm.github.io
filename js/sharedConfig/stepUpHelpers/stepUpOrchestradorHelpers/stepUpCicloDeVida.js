// stepUpOrchestratorHelpers/stepUpCicloDeVida.js
//
// Ciclo de vida de UMA abertura do modal: encerrar (limpeza total),
// cancelamento (usuário desistiu) e resolução com token. Tudo o que
// marca `finalizado` e dá resolve/reject mora aqui.

import { ConfirmacaoCanceladaError } from "../stepUpErros.js";

/**
 * Fecha o modal e limpa TUDO o que esta abertura registrou. Idempotente
 * por causa de ctx.finalizado -- pode ser chamado mais de uma vez
 * (ex: token resolvido e, na sequência, o poll do popup detectar a
 * janela fechada) sem efeito colateral.
 *
 * ALTERADO na divisão: os listeners não são mais removidos um a um
 * com removeEventListener -- todos foram registrados com
 * { signal: ctx.signal } (ver montarCtx e o orquestrador), então um
 * único abort() os remove todos. Equivalente ao comportamento
 * anterior, sem precisar das referências nomeadas de cada handler.
 */
export function encerrar(ctx) {
  if (ctx.finalizado) return;
  ctx.finalizado = true;
  if (ctx.popupPollId !== null) clearInterval(ctx.popupPollId);
  if (ctx.popupRef && !ctx.popupRef.closed) ctx.popupRef.close();
  ctx.abortController.abort(); // remove listeners de form/overlay/keydown/message
  ctx.refs.overlay.classList.remove("stepup-overlay--visible");
  document.body.classList.remove("no-scroll");
}

export function onCancelar(ctx) {
  encerrar(ctx);
  ctx.reject(new ConfirmacaoCanceladaError());
}

export function onClickOverlay(ctx, e) {
  if (e.target === ctx.refs.overlay) onCancelar(ctx);
}

export function onKeydown(ctx, e) {
  if (e.key === "Escape") onCancelar(ctx);
}

export function resolverComToken(ctx, token) {
  encerrar(ctx);
  ctx.resolve(token);
}