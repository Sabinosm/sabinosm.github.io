// webauthn.js
//
// Encapsula o fluxo de segundo fator via WebAuthn (rotas
// /webauthn/2fa/iniciar e /webauthn/2fa/confirmar). Quem chama este
// módulo não precisa conhecer navigator.credentials nem o formato das
// opções — só chama confirmarSegundoFator() e trata o resultado.
//
// Login via Google nunca passa por aqui: só entra em mfa_pendente
// quem loga por senha e já tem WebAuthn cadastrado. Por isso não há
// mais fallback "pular 2FA via Google" -- se o desafio não puder ser
// completado nesta máquina (sem autenticador) ou as tentativas se
// esgotarem, o caminho é voltar para o login e reautenticar por senha
// (reinicia as tentativas) ou por Google (que não exige 2FA).

import { startAuthentication } from "https://cdn.jsdelivr.net/npm/@simplewebauthn/browser@11/dist/bundle/index.js";
import { URL_BASE_API } from "../../config.js";

/**
 * Erro lançado quando o navegador não conseguiu sequer tentar o
 * desafio WebAuthn por falta de autenticador disponível -- típico de
 * máquinas Linux sem PIN/biometria configurados e sem Bluetooth (que
 * impede o QR code cross-device com o celular). Quem chama pode usar
 * `erro instanceof SemAutenticadorDisponivelError` para orientar o
 * usuário a voltar ao login e entrar por senha ou por Google em vez
 * de insistir no WebAuthn.
 */
export class SemAutenticadorDisponivelError extends Error {
  constructor(mensagem, tentativasRestantes) {
    super(mensagem);
    this.name = "SemAutenticadorDisponivelError";
    this.tentativasRestantes = tentativasRestantes;
  }
}

/**
 * Erro lançado quando o backend recusou gerar um novo desafio porque
 * o limite de tentativas desta sessão (MAX_TENTATIVAS_MFA no backend)
 * já foi atingido -- distingue de uma falha pontual de assinatura,
 * onde ainda sobram tentativas. Quem chama deve voltar para o login:
 * reautenticar por senha reinicia o contador, e por Google não exige
 * 2FA de novo.
 */
export class LimiteTentativasExcedidoError extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "LimiteTentativasExcedidoError";
  }
}

/**
 * Erro genérico do WebAuthn (assinatura inválida, PIN incorreto,
 * timeout, cancelamento) que ainda tem tentativas disponíveis --
 * diferente de `SemAutenticadorDisponivelError` (sem hardware) e de
 * `LimiteTentativasExcedidoError` (sem tentativas).
 */
export class TentativaFalhouError extends Error {
  constructor(mensagem, tentativasRestantes) {
    super(mensagem);
    this.name = "TentativaFalhouError";
    this.tentativasRestantes = tentativasRestantes;
  }
}

/**
 * Decide se um erro do navigator.credentials/@simplewebauthn indica
 * que não havia autenticador disponível para completar o desafio,
 * em vez de uma rejeição ativa do usuário ou outra falha.
 *
 * NotAllowedError é o mesmo tipo usado tanto para "usuário cancelou o
 * prompt" quanto para "não havia autenticador para oferecer o prompt"
 * -- o navegador não distingue os dois casos por spec. Por isso essa
 * checagem é uma heurística (nome do erro + timing), não uma certeza
 * absoluta. Erros que disparam quase instantaneamente (usuário não
 * teve nem tempo de ver ou cancelar um prompt) são o sinal mais
 * confiável de que nenhum autenticador chegou a ficar disponível.
 */
function pareceFaltaDeAutenticador(erro, duracaoMs) {
  const semAutenticador =
    erro?.name === "NotAllowedError" || erro?.name === "NotSupportedError";
  return semAutenticador && duracaoMs < 800;
}

/**
 * Executa o desafio WebAuthn de segundo fator: pede as opções ao
 * servidor, solicita a assinatura ao autenticador do usuário e envia
 * a resposta para confirmação.
 *
 * Pressupõe que a sessão já está em estado `mfa_pendente` (ou seja,
 * chamado depois de login por senha para um usuário com WebAuthn já
 * cadastrado -- login via Google nunca entra nesse estado).
 *
 * Cada chamada aqui consome uma das `MAX_TENTATIVAS_MFA` tentativas
 * da sessão (contadas no backend, em /webauthn/2fa/iniciar) -- não
 * importa se a falha foi por falta de autenticador, PIN errado,
 * timeout ou cancelamento. Quem chama deve usar `tentativasRestantes`
 * dos erros abaixo para decidir se vale oferecer "tentar de novo" ou
 * já mandar o usuário de volta ao login.
 *
 * @returns {Promise<{id_usuario: number, email: string, id_empresa: number}>}
 *   Dados da sessão confirmada.
 * @throws {LimiteTentativasExcedidoError} Se as tentativas desta
 *   sessão já se esgotaram -- não adianta chamar de novo, o usuário
 *   precisa voltar ao login e reautenticar (por senha ou Google).
 * @throws {SemAutenticadorDisponivelError} Se o navegador não achou
 *   nenhum autenticador para completar o desafio (sem PIN/biometria
 *   local, sem Bluetooth para QR code), mas ainda há tentativas.
 * @throws {TentativaFalhouError} Outra falha na assinatura (PIN
 *   incorreto, timeout, cancelamento), com tentativas ainda
 *   disponíveis.
 * @throws {Error} Se o usuário não tiver credencial cadastrada ou
 *   outro erro inesperado do backend.
 */
export async function confirmarSegundoFator() {
  const resp = await fetch(`${URL_BASE_API}/webauthn/2fa/iniciar`, {
    method: "POST",
    credentials: "include",
  });

  if (resp.status === 429) {
    throw new LimiteTentativasExcedidoError(
      "Limite de tentativas de confirmação atingido."
    );
  }

  if (!resp.ok) {
    const erroDados = await resp.json().catch(() => ({}));
    throw new Error(erroDados.erro || "Não foi possível iniciar a confirmação de identidade.");
  }

  const options = await resp.json();
  const tentativasRestantes = options.tentativas_restantes;

  let credencial;
  const inicio = performance.now();
  try {
    credencial = await startAuthentication({ optionsJSON: options });
  } catch (erro) {
    const duracaoMs = performance.now() - inicio;
    if (pareceFaltaDeAutenticador(erro, duracaoMs)) {
      throw new SemAutenticadorDisponivelError(
        "Nenhum método de confirmação disponível neste dispositivo.",
        tentativasRestantes
      );
    }
    throw new TentativaFalhouError(
      erro?.message || "Não foi possível completar a confirmação de identidade.",
      tentativasRestantes
    );
  }

  const confirmResp = await fetch(`${URL_BASE_API}/webauthn/2fa/confirmar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(credencial),
  });

  if (!confirmResp.ok) {
    const erroDados = await confirmResp.json().catch(() => ({}));
    throw new TentativaFalhouError(
      erroDados.erro || "Falha na confirmação de identidade.",
      tentativasRestantes
    );
  }

  return confirmResp.json();
}