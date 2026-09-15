// stepUpOrchestratorHelpers/stepUpCtx.js
//
// Contexto compartilhado da closure do modal. Antes da divisão, cada
// função interna de abrirModalConfirmacao acessava as variáveis da
// closure diretamente (finalizado, popupRef, refs do DOM, resolve/
// reject...). Agora elas recebem esse `ctx` como primeiro parâmetro
// -- é o mesmo estado, só que explícito no lugar de implícito.

/**
 * Captura os elementos do DOM e o estado mutável de UMA abertura do
 * modal. Cada chamada a abrirModalConfirmacao() monta seu próprio
 * ctx -- nada persiste entre confirmações.
 */
export function montarCtx(acao, resolve, reject) {
  // Um AbortController para toda a vida do modal: todos os
  // addEventListener (overlay, forms, keydown, message do popup) são
  // registrados com { signal }, e encerrar() os remove todos de uma
  // vez com abort() -- sem precisar manter referência nomeada de cada
  // listener (ver stepUpCicloDeVida.js).
  const abortController = new AbortController();

  return {
    acao,
    resolve,
    reject,

    // Estado mutável (era `let` na closure original).
    finalizado: false,
    popupRef: null,
    popupPollId: null,

    abortController,
    signal: abortController.signal,

    // Refs do DOM -- resolvidas uma vez, reusadas por todas as
    // funções. Era o bloco de getElementById no topo da closure.
    refs: {
      overlay: document.getElementById("stepup-overlay"),
      tituloAcao: document.getElementById("stepup-acao-nome"),
      btnFechar: document.getElementById("stepup-fechar"),
      btnCancelar: document.getElementById("stepup-cancelar"),
      painelCarregando: document.getElementById("stepup-painel-carregando"),
      painelWebauthn: document.getElementById("stepup-painel-webauthn"),
      painelTotp: document.getElementById("stepup-painel-totp"),
      painelSenha: document.getElementById("stepup-painel-senha"),
      formSenha: document.getElementById("stepup-form-senha"),
      formTotp: document.getElementById("stepup-form-totp"),
      inputTotp: document.getElementById("stepup-totp-codigo"),
      inputSenha: document.getElementById("stepup-senha"),
      feedback: document.getElementById("stepup-feedback"),
      btnTentarWebauthnNovamente: document.getElementById("stepup-tentar-novamente"),
    },
  };
}