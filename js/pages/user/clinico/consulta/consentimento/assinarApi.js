// assinarApi.js
//
// Camada de acesso à API PÚBLICA de assinatura do termo LGPD (paciente no
// celular). Não há login: o token do link é a autenticação, então nenhuma
// chamada daqui envia cookies (credentials: "omit").
//
//   GET  /pacientes/lgpd/assinar/<token>                 -> obterDadosAssinatura(token)
//   POST /pacientes/lgpd/assinar/<token>                 -> enviarAssinatura(token, payload)
//   GET  /pacientes/lgpd/assinar/<token>/termo.pdf       -> urlTermoPdf(token)
//   GET  /pacientes/lgpd/assinar/<token>/comprovante.pdf -> urlComprovante(token)
//
// Resposta do backend (json_success / json_error):
//   sucesso: { status: "success", message, data }
//   erro:    { status: "error",   message, erros? }
//
// Este módulo é independente das telas logadas (não importa nada de
// consulta*.js): a página do paciente não carrega sessão nem sidebar.

import { URL_BASE_API } from "../../../../../sharedConfig/urlConfig.js";

const BASE_ASSINAR = `${URL_BASE_API}/pacientes/lgpd/assinar`;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function requisitar(path, options = {}) {
  const headers = options.body ? { "Content-Type": "application/json" } : {};

  let resposta;
  try {
    resposta = await fetch(`${BASE_ASSINAR}${path}`, { credentials: "omit", headers, ...options });
  } catch {
    throw new ApiError("Não foi possível conectar ao servidor. Verifique sua internet.", 0);
  }

  let corpo;
  try {
    corpo = await resposta.json();
  } catch {
    throw new ApiError("Resposta inesperada do servidor.", resposta.status);
  }

  if (!resposta.ok || corpo.status === "error") {
    throw new ApiError(corpo.message || "Ocorreu um erro inesperado.", resposta.status);
  }
  return corpo;
}

/**
 * Dados para montar a tela. data: { token, paciente_nome, paciente_cpf (mascarado),
 * escopos_disponiveis: [{codigo, descricao}], versao_termo, texto_termo,
 * hash_pdf_original, termo_pdf_url, expira_em, unidade_id }.
 * 404 = link inválido; 409 = já usado; 400 = expirado.
 */
export function obterDadosAssinatura(token) {
  return requisitar(`/${encodeURIComponent(token)}`, { method: "GET" });
}

/**
 * Registra a assinatura. Corpo (AssinaturaDigitalSchema):
 *   { confirmo_identidade: true, declaro_consentimento: true,
 *     assinatura_canvas: "data:image/png;base64,...", hash_pdf_original,
 *     escopos_selecionados: [...] }
 * 201 -> data: { consentimento_uuid, hash_pdf_final, data_consentimento,
 *                download_url, copia_valida_ate }
 */
export function enviarAssinatura(token, payload) {
  return requisitar(`/${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify(payload) });
}

/** Endereços montados a partir de URL_BASE_API (não do que o servidor devolve), para seguir a mesma base do resto do front. */
export const urlTermoPdf = (token) => `${BASE_ASSINAR}/${encodeURIComponent(token)}/termo.pdf`;
export const urlComprovante = (token) => `${BASE_ASSINAR}/${encodeURIComponent(token)}/comprovante.pdf`;