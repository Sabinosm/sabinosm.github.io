// atendimentoDetalheApi.js
//
// GET /atendimentos/<uuid>/detalhe  ->  resumo completo de como foi (ou é) o atendimento.
// Mesma fonte do PDF detalhado: os textos já vêm formatados (rótulos, datas no fuso da empresa).
// Leitura AUDITADA no back: uma chamada por abertura da página. Mesmo ApiError de consultaApi.js.

import { URL_BASE_API } from "../../../../../sharedConfig/urlConfig.js";
import { ApiError } from "../../../clinico/consulta/consultaApi.js";

export { ApiError };

export async function buscarDetalheAtendimento(uuidAtendimento) {
  let resposta;
  try {
    resposta = await fetch(`${URL_BASE_API}/atendimentos/${encodeURIComponent(uuidAtendimento)}/detalhe`, {
      credentials: "include", cache: "no-store",
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
    throw new ApiError(corpo.message || "Ocorreu um erro inesperado.", resposta.status, corpo.erros ?? null);
  }
  return corpo.data;
}