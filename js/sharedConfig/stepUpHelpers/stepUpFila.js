// stepUpHelpers/stepUpFila.js
//
// ponto de entrada pedirConfirmacao() e a serialização de chamadas
// concorrentes. O modal é um único overlay compartilhado no DOM
// (ver stepUpModalLoader.js) -- não seria seguro abrir duas
// confirmações ao mesmo tempo sobre os mesmos elementos (o segundo
// `iniciar()` pisaria no estado visual e nos listeners do primeiro).
// Por isso, chamadas a pedirConfirmacao() são automaticamente
// SERIALIZADAS: se já existe uma confirmação em andamento, a próxima
// espera a anterior terminar (resolver ou rejeitar) antes de abrir o
// modal para a nova ação. Quem chama não precisa se preocupar com
// isso -- ex: dois `pedirConfirmacao(...)` disparados "ao mesmo
// tempo" (sem await entre eles) resultam em duas confirmações em
// sequência, uma de cada vez, cada uma com seu próprio token.

import { garantirModalCarregado } from "./stepUpModalLoader.js";
import { abrirModalConfirmacao } from "./stepUpOrchestrador.js";

/**
 * Pede reconfirmação de identidade para `acao` e resolve com o token
 * de step-up (para enviar em `X-Stepup-Token`).
 *
 * Abre um modal próprio (injetado sob demanda, ver
 * garantirModalCarregado()) que:
 *  - descreve a ação em texto claro, para o usuário saber o que está
 *    prestes a confirmar;
 *  - usa WebAuthn diretamente se o usuário tiver credencial
 *    cadastrada (ver step_up.py), sem popup, via
 *    navigator.credentials;
 *  - se o WebAuthn falhar (qualquer motivo), tenta TOTP como segundo
 *    método, se o usuário tiver -- ver tentarProximoMetodoTotp/
 *    onSubmitTotp;
 *  - se TOTP também esgotar as tentativas (ou o usuário não tiver
 *    nenhum dos dois, desde o início), cai no fallback: pede a senha
 *    atual e abre um popup para o Google. ALTERADO: diferente de uma
 *    versão anterior deste fluxo, o step-up NUNCA fica sem saída --
 *    esse fallback está sempre disponível como último recurso,
 *    mesmo para quem tem WebAuthn e/ou TOTP cadastrados mas não
 *    conseguiu completar nenhum dos dois desta vez (ver docstring de
 *    step_up.py para o racional dessa diferença em relação ao
 *    login, onde esgotar os métodos É bloqueio total).
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
export function pedirConfirmacao(acao) {
  // Encadeia esta chamada depois da anterior, sucesso ou falha -- o
  // .catch(() => {}) no elo interno da fila garante que uma rejeição
  // (ex: ConfirmacaoCanceladaError) não trave a fila para quem vier
  // depois; o erro real ainda é propagado normalmente pela Promise
  // retornada aqui, só não pela fila interna.
  const executarAgora = () => garantirModalCarregado().then(() => abrirModalConfirmacao(acao));
  const resultado = filaConfirmacao.then(executarAgora, executarAgora);
  filaConfirmacao = resultado.catch(() => {});
  return resultado;
}

// Fila interna que serializa chamadas concorrentes a
// pedirConfirmacao() -- ver comentário acima. Começa resolvida (não
// há nenhuma confirmação em andamento ainda).
let filaConfirmacao = Promise.resolve();