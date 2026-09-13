// webauthn.js
//
// Encapsula o fluxo de segundo fator via WebAuthn (rotas
// /webauthn/2fa/iniciar e /webauthn/2fa/confirmar). Quem chama este
// módulo não precisa conhecer navigator.credentials nem o formato das
// opções — só chama confirmarSegundoFator() e trata o resultado.
//
// ALTERADO (2FA sempre obrigatório -- ver mfa.py/login.py/oauth.py no
// backend): login via Google agora TAMBÉM passa por este módulo --
// diferente da versão anterior deste comentário, que dizia o
// contrário. Todo login (por senha ou por Google) exige 2FA sempre;
// não existe mais nenhum caminho de login sem confirmação.
//
// Se o desafio WebAuthn não puder ser completado nesta máquina (sem
// autenticador) ou as tentativas se esgotarem, o próximo passo é
// tentar TOTP (ver totp.js) -- não mais "voltar ao login e entrar por
// Google", que não pede mais 2FA nenhum. Se TOTP também esgotar (ou o
// usuário não tiver), não sobra mais nenhum método -- ver
// afterLogin.js, estado de bloqueio.

import { startAuthentication, startRegistration } from "https://cdn.jsdelivr.net/npm/@simplewebauthn/browser@11/dist/bundle/index.js";
import { URL_BASE_API } from "../../sharedConfig/urlConfig.js";

/**
 * Erro lançado quando o navegador não conseguiu sequer tentar o
 * desafio WebAuthn por falta de autenticador disponível -- típico de
 * máquinas Linux sem PIN/biometria configurados e sem Bluetooth (que
 * impede o QR code cross-device com o celular). Quem chama pode usar
 * `erro instanceof SemAutenticadorDisponivelError` para tentar TOTP
 * em seguida (ver totp.js) -- não há mais fallback de login sem 2FA
 * (nem por senha, nem por Google).
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
 * onde ainda sobram tentativas. Quem chama deve tentar TOTP em
 * seguida (ver totp.js) -- não há mais fallback de login sem 2FA.
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

/**
 * Erro do fluxo de CADASTRO de um novo dispositivo WebAuthn (rotas
 * /webauthn/registrar/iniciar e /webauthn/registrar/confirmar) --
 * distinto dos erros de `confirmarSegundoFator()` acima, que tratam
 * do fluxo de autenticação de uma credencial já existente.
 */
export class ErroRegistroDispositivo extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroRegistroDispositivo";
  }
}

/**
 * Cadastra um novo dispositivo (credencial WebAuthn) para o usuário
 * já logado. Diferente de `confirmarSegundoFator()`, pressupõe sessão
 * COMPLETA (sem mfa_pendente) -- só faz sentido adicionar um segundo
 * fator para quem já está autenticado.
 *
 * @param {string} apelido Nome de exibição escolhido pelo usuário
 *   para este dispositivo (ex.: "Notebook do trabalho").
 * @param {string} tipo Um de "mobile" | "usb" | "desktop" -- usado só
 *   para escolher o ícone em preencherPerfil.js.
 * @returns {Promise<{webauthn: {credenciais: object[]}}>} Lista
 *   atualizada de credenciais do usuário, já no formato de /me.
 * @throws {ErroRegistroDispositivo} Se o backend recusar o desafio,
 *   o autenticador falhar/for cancelado, ou a confirmação falhar.
 */
export async function registrarNovoDispositivo(apelido, tipo) {
  const iniciarResp = await fetch(`${URL_BASE_API}/webauthn/registrar/iniciar`, {
    method: "POST",
    credentials: "include",
  });

  if (!iniciarResp.ok) {
    const erroDados = await iniciarResp.json().catch(() => ({}));
    throw new ErroRegistroDispositivo(
      erroDados.erro || "Não foi possível iniciar o cadastro do dispositivo."
    );
  }

  const options = await iniciarResp.json();

  let credencial;
  try {
    credencial = await startRegistration({ optionsJSON: options });
  } catch (erro) {
    throw new ErroRegistroDispositivo(
      erro?.message || "Não foi possível concluir o cadastro no autenticador."
    );
  }

  const confirmResp = await fetch(`${URL_BASE_API}/webauthn/registrar/confirmar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ apelido, tipo, credencial }),
  });

  if (!confirmResp.ok) {
    const erroDados = await confirmResp.json().catch(() => ({}));
    throw new ErroRegistroDispositivo(
      erroDados.erro || "Falha ao confirmar o cadastro do dispositivo."
    );
  }

  return confirmResp.json();
}

/**
 * Erro do fluxo de REMOÇÃO de um dispositivo WebAuthn (rota
 * DELETE /webauthn/credenciais/<id_credencial>).
 *
 * `codigo` carrega o campo `erro` bruto devolvido pelo backend
 * ("credencial_nao_encontrada", "ultima_credencial_nao_pode_ser_removida")
 * para quem chama poder decidir a mensagem/UI sem precisar fazer
 * string-matching em cima de `.message`.
 */
export class ErroRemocaoDispositivo extends Error {
  constructor(mensagem, codigo) {
    super(mensagem);
    this.name = "ErroRemocaoDispositivo";
    this.codigo = codigo;
  }
}

/**
 * Remove um dispositivo (credencial WebAuthn) do usuário já logado.
 *
 * Não pede reautenticação nem confirmação extra aqui -- isso é
 * responsabilidade de quem chama (ver preencherPerfil.js, que confirma
 * com o usuário antes de disparar isto). O backend recusa (409) se
 * esta for a última credencial do usuário, já que o WebAuthn é
 * obrigatório como 2FA no sistema; ver `ErroRemocaoDispositivo.codigo`
 * para distinguir esse caso de um erro genérico.
 *
 * @param {number|string} idCredencial `id_credencial` da linha em
 *   CredencialWebAuthn (não o `credential_id` do autenticador).
 * @returns {Promise<{webauthn: {credenciais: object[]}}>} Lista
 *   atualizada de credenciais do usuário, já no formato de /me.
 * @throws {ErroRemocaoDispositivo}
 */
export async function removerDispositivoWebAuthn(idCredencial) {
  const resp = await fetch(`${URL_BASE_API}/webauthn/credenciais/${idCredencial}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!resp.ok) {
    const erroDados = await resp.json().catch(() => ({}));
    const codigo = erroDados.erro;

    const mensagens = {
      ultima_credencial_nao_pode_ser_removida:
        "Este é seu único dispositivo cadastrado. Cadastre outro antes de remover este.",
      credencial_nao_encontrada: "Dispositivo não encontrado.",
    };

    throw new ErroRemocaoDispositivo(
      mensagens[codigo] || "Não foi possível remover o dispositivo.",
      codigo
    );
  }

  return resp.json();
}