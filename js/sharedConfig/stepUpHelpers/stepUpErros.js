// stepUpHelpers/stepUpErros.js
//
// Erros públicos do step-up e tradução dos códigos de erro que vêm
// do popup do Google (postMessage) em mensagens amigáveis.

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

export function mensagemParaErroCallback(codigo) {
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