// ============================================
// B-íon — Modal de Configurações: feedback (mensagem de sucesso/erro)
// ============================================

import { exibirMensagem } from '../../shared/feedback.js';

const FEEDBACK_SUCESSO_DURACAO_MS = 2500;
let feedbackTimeoutId = null;

// exibirMensagem faz feedback.className = tipo, sobrescrevendo TODA a
// classe do elemento (não só adicionando) -- isso apagaria a classe
// base "feedback-mensagem" do CSS. Como esse comportamento é
// compartilhado com login/onboarding e não queremos mexer nele aqui,
// reforçamos a classe base logo em seguida, só neste módulo.

export function exibirFeedbackConfiguracoes(texto, tipo) {
  if (feedbackTimeoutId !== null) {
    clearTimeout(feedbackTimeoutId);
    feedbackTimeoutId = null;
  }
  exibirMensagem(texto, tipo);
  const el = document.getElementById('mensagemFeedback');
  if (el) el.classList.add('feedback-mensagem');
}

export function limparFeedbackConfiguracoes() {
  const el = document.getElementById('mensagemFeedback');
  if (!el) return;
  if (feedbackTimeoutId !== null) {
    clearTimeout(feedbackTimeoutId);
    feedbackTimeoutId = null;
  }
  el.textContent = '';
  el.className = 'feedback-mensagem';
}

/**
 * Mostra o feedback de sucesso e some sozinho depois de um tempo --
 * erro fica até o usuário agir (corrigir e salvar de novo, ou sair).
 */
export function exibirFeedbackSucessoTemporario(texto) {
  exibirFeedbackConfiguracoes(texto, 'sucesso');
  if (feedbackTimeoutId !== null) clearTimeout(feedbackTimeoutId);
  feedbackTimeoutId = setTimeout(() => {
    feedbackTimeoutId = null;
    limparFeedbackConfiguracoes();
  }, FEEDBACK_SUCESSO_DURACAO_MS);
}