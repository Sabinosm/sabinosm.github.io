// ============================================
// B-íon — Modal de Configurações: feedback (mensagem de sucesso/erro)
// ============================================
//
// Agora é só uma camada fina sobre o toast compartilhado
// (shared/feedback.js): não depende mais de nenhum elemento no HTML, não
// tem timer próprio e não mexe em classes. Os três nomes exportados
// continuam existindo para os módulos de configurações que já os importam.

import { exibirMensagem } from '../../shared/feedback.js';

const FEEDBACK_SUCESSO_DURACAO_MS = 2500;
// Antes o erro ficava até o usuário agir; no toast ele precisa de mais
// tempo para dar para ler e corrigir.
const FEEDBACK_ERRO_DURACAO_MS = 5000;

export function exibirFeedbackConfiguracoes(texto, tipo) {
  const duracao = tipo === 'erro' ? FEEDBACK_ERRO_DURACAO_MS : undefined;
  exibirMensagem(texto, tipo, duracao);
}

/** O toast some sozinho, então não há o que limpar. Mantida por compatibilidade. */
export function limparFeedbackConfiguracoes() {}

export function exibirFeedbackSucessoTemporario(texto) {
  exibirMensagem(texto, 'sucesso', FEEDBACK_SUCESSO_DURACAO_MS);
}