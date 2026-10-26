// requisitar.js
//
// Camada HTTP comum às telas clínicas de consulta (medicamentos e exames).
// Os arquivos *Api.js só declaram as chamadas; a parte de fetch, erro de
// rede e formato de resposta do backend fica aqui, em um lugar só.
//
// Resposta do backend (json_success / json_error):
//   sucesso: { status: "success", message: "...", data: ... }
//   erro:    { status: "error",   message: "..." }
//
// requisitar() devolve direto o campo `data` e lança ApiError nos erros
// de rede e de negócio. Autenticação por cookie de sessão
// (credentials: "include"), como em profissionaisApi.js.

import { URL_BASE_API } from "../../../../sharedConfig/urlConfig.js";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * @param {string} recurso  prefixo do blueprint, ex: "/medicamentos"
 * @param {string} [caminho] resto do caminho + query, ex: "/<uuid>" ou "/?q=x"
 * @param {object} [opcoes]  opções do fetch (method, body...)
 */
export async function requisitar(recurso, caminho = "", opcoes = {}) {
  let resposta;
  try {
    resposta = await fetch(`${URL_BASE_API}${recurso}${caminho}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...opcoes,
    });
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
  return corpo.data;
}

/**
 * Monta a query string ("?a=1&b=2"), ou "" se não houver nada.
 * Ignora undefined, null e "". Arrays viram parâmetro repetido
 * (?x=a&x=b). Booleanos viram "true"/"false".
 */
export function montarQuery(params = {}) {
  const qs = new URLSearchParams();
  const vazio = (v) => v === undefined || v === null || v === "";
  for (const [chave, valor] of Object.entries(params)) {
    if (Array.isArray(valor)) {
      valor.filter((v) => !vazio(v)).forEach((v) => qs.append(chave, String(v)));
    } else if (!vazio(valor)) {
      qs.append(chave, String(valor));
    }
  }
  const texto = qs.toString();
  return texto ? `?${texto}` : "";
}