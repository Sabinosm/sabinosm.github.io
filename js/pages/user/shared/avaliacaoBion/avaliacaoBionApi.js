// avaliacaoBionApi.js
//
// Camada de acesso à API da avaliação por IA (Bion). Só fetch: nenhuma regra de
// tela aqui. Mesmo padrão de atendimentoApi.js (json_success/json_error,
// credentials: "include") e MESMO ApiError, para o `instanceof` valer em todo o front.
//
//   POST /atendimento/<uuid_atendimento>/avaliacao-bion        -> 202 {uuid_output, status}
//        Sem dado clínico no corpo: o back monta o input a partir do banco.
//        403: só o médico dono · 409: sem consentimento / sem input de protocolo / já em andamento
//   GET  /atendimento/<uuid_atendimento>/avaliacao-bion/ultima -> estado da mais recente, ou data null
//   GET  /avaliacao-bion/<uuid_output>/status                   -> só o estado (polling, sem auditoria)
//   GET  /avaliacao-bion/<uuid_output>                          -> conteúdo (output_front); leitura AUDITADA
//
// Prefixo (main.py): bp_bion é registrado em /v1/api/bion, ou seja, URL_BASE_API + "/bion".
// Ex.: POST /v1/api/bion/atendimento/<uuid>/avaliacao-bion. Único ponto a ajustar: BASE.

import { URL_BASE_API } from "../../../../sharedConfig/urlConfig.js";
import { ApiError } from "../atendimento/atendimentoApi.js";

export { ApiError };

const BASE = `${URL_BASE_API}/bion`;
const enc = encodeURIComponent;

async function requisitar(path, { method = "GET", signal } = {}) {
  // POST leva "{}" (mesmo formato dos demais POSTs); GET não leva corpo.
  const init = { method, credentials: "include", cache: "no-store", signal };
  if (method === "POST") {
    init.headers = { "Content-Type": "application/json" };
    init.body = "{}";
  }

  let resposta;
  try {
    resposta = await fetch(`${BASE}${path}`, init);
  } catch (erro) {
    if (erro?.name === "AbortError") throw erro; // cancelamento é do chamador, não é erro de rede
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

/** Pede a avaliação. Resposta: { data: { uuid_output, status } }. */
export const iniciarAvaliacao = (uuidAtendimento) =>
  requisitar(`/atendimento/${enc(uuidAtendimento)}/avaliacao-bion`, { method: "POST" });

/** Avaliação mais recente do atendimento. `data` é null quando nunca houve. */
export const ultimaAvaliacao = (uuidAtendimento, opcoes) =>
  requisitar(`/atendimento/${enc(uuidAtendimento)}/avaliacao-bion/ultima`, opcoes);

/** Só o estado: { uuid_output, status, erro_codigo, criado_em }. É a rota do polling. */
export const statusAvaliacao = (uuidOutput, opcoes) =>
  requisitar(`/avaliacao-bion/${enc(uuidOutput)}/status`, opcoes);

/** Conteúdo clínico (conduta, perguntas, explicação, qualidade). Gera 1 linha de auditoria: chame uma vez. */
export const lerAvaliacao = (uuidOutput, opcoes) =>
  requisitar(`/avaliacao-bion/${enc(uuidOutput)}`, opcoes);