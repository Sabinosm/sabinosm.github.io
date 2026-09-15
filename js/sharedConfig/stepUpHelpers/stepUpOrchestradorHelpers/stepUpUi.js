// stepUpOrchestratorHelpers/stepUpUi.js
//
// Ajudantes visuais do modal: alternância de painéis e feedback.
// Só tocam o DOM via ctx.refs -- nenhum estado, nenhuma chamada de
// rede. (Eram limparEstadoVisual/mostrarErro/mostrarPainelSenha na
// closure original.)

export function limparEstadoVisual(ctx) {
  const { painelCarregando, painelWebauthn, painelTotp, painelSenha, feedback } = ctx.refs;
  [painelCarregando, painelWebauthn, painelTotp, painelSenha].forEach(p => p.hidden = true);
  feedback.textContent = "";
  feedback.className = "stepup-feedback";
}

export function mostrarErro(ctx, mensagem) {
  const { feedback } = ctx.refs;
  feedback.textContent = mensagem;
  feedback.className = "stepup-feedback erro";
}

export function mostrarPainelSenha(ctx) {
  const { painelSenha, inputSenha } = ctx.refs;
  painelSenha.hidden = false;
  inputSenha.value = "";
  inputSenha.focus();
}