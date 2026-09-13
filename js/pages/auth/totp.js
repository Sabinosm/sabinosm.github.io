// totp.js
//
// Encapsula o fluxo de segundo fator via TOTP (código de 6 dígitos de
// app autenticador) -- rotas /totp/2fa/iniciar e /totp/2fa/confirmar
// (login), /totp/2fa/stepup/iniciar e /totp/2fa/stepup/confirmar
// (step-up), além do cadastro em /totp/registrar/*.
//
// Espelha webauthn.js na forma, mas é um módulo próprio -- TOTP não
// usa navigator.credentials, então não há nada em comum na mecânica,
// só no formato dos erros e no papel que cada arquivo cumpre.
//
// TOTP só é oferecido como segundo degrau, depois que WebAuthn esgota
// tentativas (ver afterLogin.js e stepUp.js) -- este módulo não decide
// quando é chamado, só executa o fluxo quando chamado.

import { URL_BASE_API } from "../../sharedConfig/urlConfig.js";

/**
 * Erro lançado quando o backend recusa continuar tentando TOTP porque
 * o limite de tentativas desta sessão já foi atingido.
 *
 * No LOGIN: quem chama deve voltar para o login geral (Google
 * continua disponível, ver afterLogin.js).
 *
 * No STEP-UP: quem chama deve tratar como FIM DA LINHA -- não há
 * fallback aqui (ver stepUp.js). A ação deve ficar bloqueada, com
 * orientação para contatar o administrador.
 */
export class LimiteTentativasTotpExcedidoError extends Error {
  constructor(mensagem = "Limite de tentativas de código atingido.") {
    super(mensagem);
    this.name = "LimiteTentativasTotpExcedidoError";
  }
}

/**
 * Erro genérico de código incorreto, com tentativas ainda disponíveis
 * -- diferente de LimiteTentativasTotpExcedidoError.
 */
export class CodigoTotpInvalidoError extends Error {
  constructor(mensagem, tentativasRestantes) {
    super(mensagem);
    this.name = "CodigoTotpInvalidoError";
    this.tentativasRestantes = tentativasRestantes;
  }
}

/**
 * Lançado se o backend indicar que este usuário não tem TOTP
 * cadastrado -- não deveria ocorrer se a UI só oferece TOTP depois de
 * confirmar disponibilidade via /totp/2fa/iniciar, mas é tratado
 * explicitamente para não mascarar como erro genérico.
 */
export class TotpNaoCadastradoError extends Error {
  constructor(mensagem = "Nenhum autenticador TOTP cadastrado.") {
    super(mensagem);
    this.name = "TotpNaoCadastradoError";
  }
}

// ============================================
// Segundo fator -- LOGIN
// ============================================

/**
 * Confirma que o usuário tem TOTP disponível como método (chamar
 * antes de mostrar o campo de código) e reseta o contador de
 * tentativas desta sessão.
 *
 * @returns {Promise<{tentativasRestantes: number}>}
 * @throws {TotpNaoCadastradoError}
 */
export async function iniciarSegundoFatorTOTP() {
  const resp = await fetch(`${URL_BASE_API}/totp/2fa/iniciar`, {
    method: "POST",
    credentials: "include",
  });

  const dados = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    if (dados.erro === "totp_nao_cadastrado") {
      throw new TotpNaoCadastradoError();
    }
    throw new Error(dados.erro || "Não foi possível iniciar a confirmação por código.");
  }

  return { tentativasRestantes: dados.tentativas_restantes };
}

/**
 * Envia o código digitado pelo usuário para confirmar o segundo fator
 * de login.
 *
 * @param {string} codigo Código de 6 dígitos do app autenticador.
 * @returns {Promise<{id_usuario: number, email: string, id_empresa: number}>}
 * @throws {LimiteTentativasTotpExcedidoError}
 * @throws {CodigoTotpInvalidoError}
 */
export async function confirmarSegundoFatorTOTP(codigo) {
  const resp = await fetch(`${URL_BASE_API}/totp/2fa/confirmar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ codigo }),
  });

  if (resp.status === 429) {
    throw new LimiteTentativasTotpExcedidoError();
  }

  const dados = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new CodigoTotpInvalidoError(
      dados.erro === "codigo_invalido" ? "Código incorreto." : (dados.erro || "Não foi possível confirmar o código."),
      dados.tentativas_restantes
    );
  }

  return dados;
}

// ============================================
// Segundo fator -- STEP-UP
// ============================================

/**
 * Confirma TOTP disponível para o step-up de `acao` e reseta o
 * contador de tentativas deste fluxo específico.
 *
 * @param {string} acao
 * @returns {Promise<{tentativasRestantes: number}>}
 * @throws {TotpNaoCadastradoError}
 */
export async function iniciarStepUpTOTP(acao) {
  const resp = await fetch(`${URL_BASE_API}/totp/2fa/stepup/iniciar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ acao }),
  });

  const dados = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    if (dados.erro === "totp_nao_cadastrado") {
      throw new TotpNaoCadastradoError();
    }
    throw new Error(dados.erro || "Não foi possível iniciar a confirmação por código.");
  }

  return { tentativasRestantes: dados.tentativas_restantes };
}

/**
 * Envia o código digitado pelo usuário para confirmar o step-up de
 * `acao` via TOTP.
 *
 * @param {string} acao
 * @param {string} codigo
 * @returns {Promise<string>} O token_confirmacao (mesmo formato do
 *   fluxo WebAuthn de step-up -- ver stepUp.js).
 * @throws {LimiteTentativasTotpExcedidoError} FIM DA LINHA no
 *   step-up -- sem fallback, ver docstring do módulo.
 * @throws {CodigoTotpInvalidoError}
 */
export async function confirmarStepUpTOTP(acao, codigo) {
  const resp = await fetch(`${URL_BASE_API}/totp/2fa/stepup/confirmar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ acao, codigo }),
  });

  if (resp.status === 429) {
    throw new LimiteTentativasTotpExcedidoError();
  }

  const dados = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new CodigoTotpInvalidoError(
      dados.erro === "codigo_invalido" ? "Código incorreto." : (dados.erro || "Não foi possível confirmar o código."),
      dados.tentativas_restantes
    );
  }

  return dados.token_confirmacao;
}

// ============================================
// Cadastro (tela de configurações -- sessão completa, @requer_login)
// ============================================

export class ErroCadastroTOTP extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroCadastroTOTP";
  }
}

/**
 * Inicia o cadastro de TOTP: gera um novo secret e devolve a URI
 * otpauth:// (para renderizar como QR code) e o texto do secret (para
 * digitação manual como alternativa ao QR).
 *
 * @returns {Promise<{otpauth_uri: string, secret_texto: string}>}
 * @throws {ErroCadastroTOTP}
 */
export async function iniciarCadastroTOTP() {
  const resp = await fetch(`${URL_BASE_API}/totp/registrar/iniciar`, {
    method: "POST",
    credentials: "include",
  });

  if (!resp.ok) {
    const dados = await resp.json().catch(() => ({}));
    throw new ErroCadastroTOTP(dados.erro || "Não foi possível iniciar o cadastro do autenticador.");
  }

  return resp.json();
}

/**
 * Confirma o cadastro de TOTP enviando o primeiro código gerado pelo
 * app -- só depois disso o TOTP passa a valer como segundo fator.
 *
 * @param {string} codigo
 * @returns {Promise<{totp: {id_credencial: number, confirmado: boolean, criado_em: string}}>}
 * @throws {ErroCadastroTOTP}
 */
export async function confirmarCadastroTOTP(codigo) {
  const resp = await fetch(`${URL_BASE_API}/totp/registrar/confirmar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ codigo }),
  });

  if (!resp.ok) {
    const dados = await resp.json().catch(() => ({}));
    throw new ErroCadastroTOTP(
      dados.erro === "codigo_invalido" ? "Código incorreto. Confira o app e tente de novo." : (dados.erro || "Não foi possível confirmar o cadastro.")
    );
  }

  return resp.json();
}

/**
 * Remove o TOTP cadastrado do usuário logado.
 *
 * @returns {Promise<void>}
 * @throws {ErroCadastroTOTP}
 */
export async function removerTOTP() {
  const resp = await fetch(`${URL_BASE_API}/totp/remover`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!resp.ok) {
    const dados = await resp.json().catch(() => ({}));
    throw new ErroCadastroTOTP(dados.erro || "Não foi possível remover o autenticador.");
  }
}