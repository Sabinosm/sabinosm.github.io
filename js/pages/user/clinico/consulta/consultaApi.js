// consultaApi.js
//
// Camada de acesso à API de consultas (blueprint "consulta") e à busca
// de pacientes usada no modal de nova consulta. Só fetch: nenhuma
// regra de tela aqui.
//
//   GET  /consultas/?abertas=true          -> listarConsultas({ abertas })
//   GET  /consultas/<uuid>                 -> buscarConsulta(uuid)
//   POST /consultas/                       -> abrirConsulta(payload)
//   POST /consultas/<uuid>/encerrar        -> encerrarConsulta(uuid, payload)
//   POST /consultas/<uuid>/evadir          -> evadirConsulta(uuid, payload)
//   GET  /consultas/<uuid>/consentimento   -> situacaoConsentimento(uuid)
//   POST /consultas/<uuid>/consentimento/dispensar -> dispensarConsentimento(uuid, payload)
//   GET  /pacientes/pessoal/resumo         -> listarPacientesResumo({ q, pagina })
//
// Resposta do backend (json_success / json_error):
//   sucesso: { status: "success", message, data }
//   erro:    { status: "error",   message, erros?: { campo: mensagem } }
//   `erros` (opcional) traz o erro por campo; a chave "_geral" é erro
//   sem campo definido. Fica em ApiError.erros.
//
// Encerrar e evadir usam acesso_auditado no back: só registram a ação,
// não exigem step-up (nada de X-Stepup-Token aqui).
//
// IMPORTANTE: assume o blueprint de consultas registrado em
// "/consultas" e o de pacientes em "/pacientes/pessoal" (URL_BASE_API
// já inclui /v1/api). Se app.py usar outro prefixo, ajustar abaixo.

import { URL_BASE_API } from "../../../../sharedConfig/urlConfig.js";

const BASE_CONSULTAS = `${URL_BASE_API}/consultas`;
const BASE_PACIENTES = `${URL_BASE_API}/pacientes/pessoal`;

export class ApiError extends Error {
  constructor(message, status, erros = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.erros = erros;
  }
}

/** Executa o fetch e normaliza a resposta. Lança ApiError em erro de rede ou de negócio. */
async function requisitar(base, path, options = {}) {
  const headers = options.body ? { "Content-Type": "application/json" } : {};

  let resposta;
  try {
    resposta = await fetch(`${base}${path}`, {
      credentials: "include",
      headers,
      ...options,
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

  return corpo; // { status: "success", message, data }
}

/**
 * GET /consultas/ — consultas da empresa da sessão (array, sem paginação).
 * @param {object} [opcoes]
 * @param {boolean} [opcoes.abertas] — true = só as não encerradas
 */
export function listarConsultas({ abertas = false } = {}) {
  const query = abertas ? "?abertas=true" : "";
  return requisitar(BASE_CONSULTAS, `/${query}`, { method: "GET" });
}

/** GET /consultas/<uuid> — detalhe de uma consulta (404 igual para "não existe" e "outra empresa"). */
export function buscarConsulta(uuid) {
  return requisitar(BASE_CONSULTAS, `/${encodeURIComponent(uuid)}`, { method: "GET" });
}

/**
 * POST /consultas/ — abre uma consulta. O corpo tem EXATAMENTE UMA destas formas
 * (validado por validarAberturaConsulta antes de chamar):
 *   { uuid_paciente }
 *   { paciente: {...} }
 *   { paciente_nao_identificado: true, motivo_emergencia, sexo_biologico? }
 * Opcional em todas: origem_encaminhamento.
 *
 * 201 -> data = Consulta.to_dict(). 409 = paciente já tem consulta aberta
 * (o uuid da aberta vem só na mensagem).
 */
export function abrirConsulta(payload) {
  return requisitar(BASE_CONSULTAS, "/", { method: "POST", body: JSON.stringify(payload) });
}

/**
 * POST /consultas/<uuid>/encerrar — encerra com desfecho.
 * Corpo: { desfecho_final, justificativa? }. 409 se há Atendimento em
 * andamento (finalize-o antes) ou se a consulta já está encerrada.
 */
export function encerrarConsulta(uuid, payload) {
  return requisitar(BASE_CONSULTAS, `/${encodeURIComponent(uuid)}/encerrar`, { method: "POST", body: JSON.stringify(payload) });
}

/**
 * POST /consultas/<uuid>/evadir — evasão: cancela os Atendimentos em
 * andamento e encerra com desfecho "evasao". Corpo: { justificativa? }.
 */
export function evadirConsulta(uuid, payload = {}) {
  return requisitar(BASE_CONSULTAS, `/${encodeURIComponent(uuid)}/evadir`, { method: "POST", body: JSON.stringify(payload) });
}

/** GET /consultas/<uuid>/consentimento — data: { valido: boolean, situacao: "ativo" | "dispensado_emergencia" | null }. */
export function situacaoConsentimento(uuid) {
  return requisitar(BASE_CONSULTAS, `/${encodeURIComponent(uuid)}/consentimento`, { method: "GET" });
}

/** POST /consultas/<uuid>/consentimento/dispensar — dispensa por emergência. Corpo: { motivo }. */
export function dispensarConsentimento(uuid, payload) {
  return requisitar(BASE_CONSULTAS, `/${encodeURIComponent(uuid)}/consentimento/dispensar`, { method: "POST", body: JSON.stringify(payload) });
}

/**
 * GET /pacientes/pessoal/resumo — listagem enxuta para busca/seleção
 * (Paciente.to_dict_few: uuid, nome_completo, cpf_inicio, nao_identificado...).
 *
 * `pagina` é número da página (0, 1, 2...), 8 por página.
 * `q` (nome ou CPF) AINDA NÃO existe no backend: precisa ser adicionado
 * em PacientePessoalController.lista_resumo; enquanto isso, o parâmetro
 * é enviado mas ignorado pelo servidor.
 */
export function listarPacientesResumo({ q, pagina = 0 } = {}) {
  const params = new URLSearchParams();
  params.set("pagina", String(pagina));
  if (q) params.set("q", q);
  return requisitar(BASE_PACIENTES, `/resumo?${params.toString()}`, { method: "GET" });
}