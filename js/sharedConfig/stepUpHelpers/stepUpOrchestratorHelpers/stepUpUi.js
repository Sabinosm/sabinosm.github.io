// stepUpOrchestratorHelpers/stepUpUi.js
//
// Ajudantes visuais do modal: alternância de painéis e feedback.
// Só tocam o DOM via ctx.refs -- nenhum estado, nenhuma chamada de
// rede. (Eram limparEstadoVisual/mostrarErro/mostrarPainelSenha na
// closure original.)
//
// O feedback de erro não vive mais dentro do modal: usa o toast
// compartilhado (shared/feedback.js), então não há elemento
// #stepup-feedback para procurar nem limpar.

import { exibirMensagem } from "../../../shared/feedback.js";

const DURACAO_ERRO_MS = 4000; // erro de confirmação merece mais tempo que os 2s padrão

export function limparEstadoVisual(ctx) {
  const { painelCarregando, painelWebauthn, painelTotp, painelSenha } = ctx.refs;
  [painelCarregando, painelWebauthn, painelTotp, painelSenha].forEach(p => p.hidden = true);
}

export function mostrarErro(ctx, mensagem) {
  exibirMensagem(mensagem, "erro", DURACAO_ERRO_MS);
}

export function mostrarPainelSenha(ctx) {
  const { painelSenha, inputSenha } = ctx.refs;
  painelSenha.hidden = false;
  inputSenha.value = "";
  inputSenha.focus();
}