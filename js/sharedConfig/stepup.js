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
// O QUE ESTE FLUXO NUNCA FAZ (de propósito, por segurança):
// - Nunca guarda o token em localStorage/sessionStorage -- só na
//   variável local da própria chamada, descartada ao retornar.
// - Nunca reutiliza um token entre chamadas de pedirConfirmacao(),
//   mesmo para a mesma `acao` -- cada ação sensível precisa de uma
//   reconfirmação própria. Cache de token aqui recriaria o bypass que
//   o step-up existe para evitar.
// - Nunca decide sozinho que uma ação "não precisa mais" de
//   confirmação -- essa decisão é 100% do backend
//   (requer_confirmacao_recente); este fluxo só executa quando
//   chamado.
//
// Divisão em módulos (ver ./stepUpHelpers/):
//   stepUpFila.js         -- pedirConfirmacao() e a serialização de
//                            chamadas concorrentes;
//   stepUpOrchestrador.js -- abrirModalConfirmacao(), a closure que
//                            orquestra o modal e os três caminhos
//                            (WebAuthn, TOTP, fallback senha+Google);
//   stepUpModalLoader.js  -- injeção sob demanda do partial HTML;
//   stepUpErros.js        -- classes de erro e mensagens do callback.
//
// Este arquivo é só a API pública: re-exporta os símbolos que quem
// chama precisa, mantendo o path do import inalterado para todo o
// resto do front.

export { pedirConfirmacao } from "./stepUpHelpers/stepUpFila.js";
export { ConfirmacaoCanceladaError, PopupBloqueadoError } from "./stepUpHelpers/stepUpErros.js";