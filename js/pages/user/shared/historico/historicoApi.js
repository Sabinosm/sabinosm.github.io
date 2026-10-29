// historicoApi.js
//
// Chamadas da página de Histórico de consultas. Só fetch; mesmo ApiError de consultaApi.js.
//
//   GET /consultas/historico   paginado: { itens, tem_mais, limit, offset, proximo_offset }
//        filtros: status, desfecho, abertas=true, data_inicio, data_fim (AAAA-MM-DD, fuso da empresa)
//        cada item = Consulta + paciente + continuidade (pode_continuar, proxima_acao,
//        acoes_disponiveis, atendimento_em_andamento, motivo_bloqueio)
//   GET /atendimentos/consulta/<uuid>   linha do tempo em ordem cronológica, cada item com `profissional`

import { URL_BASE_API } from "../../../../sharedConfig/urlConfig.js";
import { ApiError } from "../../clinico/consulta/consultaApi.js";

export { ApiError };

const enc = encodeURIComponent;

async function requisitar(path) {
  let resposta;
  try {
    resposta = await fetch(`${URL_BASE_API}${path}`, { credentials: "include", cache: "no-store" });
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
  return corpo;
}

/** Query do histórico: só entra o que foi preenchido. */
export function montarQueryHistorico({ limit, offset, status, desfecho, abertas, dataInicio, dataFim } = {}) {
  const p = new URLSearchParams();
  if (limit) p.set("limit", String(limit));
  if (offset) p.set("offset", String(offset));
  if (status) p.set("status", status);
  if (desfecho) p.set("desfecho", desfecho);
  if (abertas) p.set("abertas", "true");
  if (dataInicio) p.set("data_inicio", dataInicio);
  if (dataFim) p.set("data_fim", dataFim);
  const texto = p.toString();
  return texto ? `?${texto}` : "";
}

export const listarHistorico = (filtros) => requisitar(`/consultas/historico${montarQueryHistorico(filtros)}`);

export const listarAtendimentosDaConsulta = (uuidConsulta) =>
  requisitar(`/atendimentos/consulta/${enc(uuidConsulta)}`);