// atendimentoApi.js
//
// Camada de acesso à API de Atendimento (Bloco 2). Só fetch: nenhuma
// regra de tela aqui. Mesmo padrão de consultaApi.js (ApiError,
// json_success/json_error, credentials: "include").
//
//   GET  /atendimentos/consulta/<uuid>                         -> atendimentos da consulta
//   GET  /atendimentos/<uuid>                                  -> detalhe (precisa de realizado_por no to_dict)
//   POST /atendimentos/consulta/<uuid>/abrir-triagem           -> 201 (409: consentimento/consulta)
//   POST /atendimentos/consulta/<uuid>/abrir-avaliacao-medica  -> 201 (403: só médico)
//   POST /atendimentos/<uuid>/finalizar                        -> {observacoes?}; só o dono (403), exige binário completo (409)
//   POST /atendimentos/<uuid>/cancelar                         -> {motivo_cancelamento?}; não exige binário
//   GET  /atendimentos/<uuid>/binario                          -> estado + pré-preenchimento
//   GET  /atendimentos/<uuid>/binario/do-paciente              -> binário montado dos registros ativos do paciente (pré-preenchimento)
//   POST /atendimentos/<uuid_at>/pacientes/<uuid_pac>/binario            -> conferir as 4 seções
//   POST /atendimentos/<uuid_at>/pacientes/<uuid_pac>/binario/<secao>    -> conferir 1 seção
//   POST .../sinais-vitais                                   -> {"sinais": [...]}
//   POST .../coleta-clinica                                  -> exige binário completo (409)
//   POST .../coleta-clinica/<uuid_coleta>/input-protocolo    -> exige binário completo (409)
//   POST .../condutas-enfermagem                             -> {descricao_conduta, uuid_protocolo_catalogo?}
//   GET  /atendimentos/<uuid>/condutas-enfermagem            -> condutas do atendimento
//   GET  /atendimentos/consulta/<uuid>/condutas-enfermagem   -> condutas da consulta

import { URL_BASE_API } from "../../../../sharedConfig/urlConfig.js";

const BASE = `${URL_BASE_API}/atendimentos`;

export class ApiError extends Error {
  constructor(message, status, erros = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.erros = erros;
  }
}

async function requisitar(path, options = {}) {
  const headers = options.body ? { "Content-Type": "application/json" } : {};

  let resposta;
  try {
    resposta = await fetch(`${BASE}${path}`, { credentials: "include", headers, ...options });
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

const get = (path) => requisitar(path, { method: "GET" });
const post = (path, payload) =>
  requisitar(path, { method: "POST", body: JSON.stringify(payload ?? {}) });

const enc = encodeURIComponent;

/**
 * GET de COLEÇÃO onde "ainda não há nada" é situação normal (condutas, dado
 * de atendimento anterior...). 404 vira resposta vazia e a tela simplesmente
 * não mostra nada; qualquer outro erro (403, 500, rede) continua subindo.
 * Rede de segurança: o certo é o back responder 200 + lista vazia (ver notas).
 */
async function getOuVazio(path, vazio) {
  try {
    return await get(path);
  } catch (erro) {
    if (erro instanceof ApiError && erro.status === 404) {
      return { status: "success", data: vazio, vazio: true };
    }
    throw erro;
  }
}

// ------------------------------------------------------- ciclo de vida

/** GET /atendimentos/consulta/<uuid> — lista os atendimentos da consulta (cronológica). */
export const listarAtendimentosDaConsulta = (uuidConsulta) => get(`/consulta/${enc(uuidConsulta)}`);

/** GET /atendimentos/<uuid> — detalhe. DEPENDE de realizado_por no to_dict (ajuste de back). */
export const buscarAtendimento = (uuid) => get(`/${enc(uuid)}`);

/** POST .../abrir-triagem — 201; 409 se consentimento pendente ou consulta encerrada. */
export const abrirTriagem = (uuidConsulta) => post(`/consulta/${enc(uuidConsulta)}/abrir-triagem`);

/** POST .../abrir-avaliacao-medica — 201; 403 para não-médico (o front já esconde o botão). */
export const abrirAvaliacaoMedica = (uuidConsulta) => post(`/consulta/${enc(uuidConsulta)}/abrir-avaliacao-medica`);

/** POST /atendimentos/<uuid>/finalizar — {observacoes?}. 403 não-dono; 409 binário incompleto. */
export const finalizarAtendimento = (uuid, payload) => post(`/${enc(uuid)}/finalizar`, payload);

/** POST /atendimentos/<uuid>/cancelar — {motivo_cancelamento?}. Não exige binário. */
export const cancelarAtendimento = (uuid, payload) => post(`/${enc(uuid)}/cancelar`, payload);

// ---------------------------------------------------------------- binário

/** GET /atendimentos/<uuid>/binario — estado das 4 seções + pré-preenchimento. */
export const estadoBinario = (uuidAtendimento) => get(`/${enc(uuidAtendimento)}/binario`);

/**
 * GET /atendimentos/<uuid>/binario/do-paciente — binário montado a partir dos
 * registros ATIVOS do paciente (formato do BinarioIn). Só leitura.
 * Resposta: { binario, confirmacao, pendentes, completo }.
 */
export const binarioDoPaciente = (uuidAtendimento) =>
  get(`/${enc(uuidAtendimento)}/binario/do-paciente`);

/** POST .../binario — conferir as 4 seções (agregado). 409 em seção já conferida manualmente. */
export const conferirBinario = (uuidAt, uuidPac, payload) =>
  post(`/${enc(uuidAt)}/pacientes/${enc(uuidPac)}/binario`, payload);

/** POST .../binario/<secao> — conferir 1 seção (granular). */
export const conferirSecao = (uuidAt, uuidPac, secao, payload) =>
  post(`/${enc(uuidAt)}/pacientes/${enc(uuidPac)}/binario/${enc(secao)}`, payload);

// --------------------------------------------------------- dados clínicos

/** POST .../sinais-vitais — {"sinais": [...]}, 1 a 50, tudo ou nada (não exige binário). */
export const registrarSinaisVitais = (uuidAt, uuidPac, payload) =>
  post(`/${enc(uuidAt)}/pacientes/${enc(uuidPac)}/sinais-vitais`, payload);

/** POST .../coleta-clinica — exige binário completo (409). */
export const registrarColeta = (uuidAt, uuidPac, payload) =>
  post(`/${enc(uuidAt)}/pacientes/${enc(uuidPac)}/coleta-clinica`, payload);

/** POST .../coleta-clinica/<uuid_coleta>/input-protocolo — input aponta para coleta DO atendimento. */
export const registrarInputProtocolo = (uuidAt, uuidPac, uuidColeta, payload) =>
  post(`/${enc(uuidAt)}/pacientes/${enc(uuidPac)}/coleta-clinica/${enc(uuidColeta)}/input-protocolo`, payload);

// --------------------------------------------------------------- conduta

/** POST .../condutas-enfermagem — {descricao_conduta, uuid_protocolo_catalogo?} (insert-only). */
export const registrarConduta = (uuidAt, uuidPac, payload) =>
  post(`/${enc(uuidAt)}/pacientes/${enc(uuidPac)}/condutas-enfermagem`, payload);

/** GET /atendimentos/<uuid>/condutas-enfermagem — condutas do atendimento. */
export const listarCondutasDoAtendimento = (uuidAt) =>
  getOuVazio(`/${enc(uuidAt)}/condutas-enfermagem`, []);

/** GET /atendimentos/consulta/<uuid>/condutas-enfermagem — condutas de todos os atendimentos. */
export const listarCondutasDaConsulta = (uuidConsulta) =>
  getOuVazio(`/consulta/${enc(uuidConsulta)}/condutas-enfermagem`, []);

/** GET .../protocolos-disponiveis — ativo, escopo compatível e liberado pela empresa. */
export const listarProtocolosDisponiveis = (uuidAt, uuidPac) =>
  get(`/${enc(uuidAt)}/pacientes/${enc(uuidPac)}/protocolos-disponiveis`);

/** GET .../protocolos/<uuid>/estrutura — campos esperados (para montar o formulário). */
export const estruturaProtocolo = (uuidAt, uuidPac, uuidProt) =>
  get(`/${enc(uuidAt)}/pacientes/${enc(uuidPac)}/protocolos/${enc(uuidProt)}/estrutura`);

/** POST .../protocolos/<uuid>/executar — sobre o input vigente (409 se repetido no mesmo input). */
export const executarProtocolo = (uuidAt, uuidPac, uuidProt) =>
  post(`/${enc(uuidAt)}/pacientes/${enc(uuidPac)}/protocolos/${enc(uuidProt)}/executar`);