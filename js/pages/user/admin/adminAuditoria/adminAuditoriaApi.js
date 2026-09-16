// adminAuditoriaApi.js
//
// Camada de acesso à API de auditoria (blueprint Flask "auditoria").
// Espelha as rotas GET do controller.py:
//
//   GET /profissionais/resumo            -> listarResumoProfissionais(...)
//   GET /profissionais/<uuid>/detalhe    -> detalheProfissional(uuid, ...)
//
// A API é SOMENTE LEITURA e restrita a admin (ver controller.py) --
// por isso não existe nenhuma chamada de escrita e nenhum step-up
// aqui (step-up só se aplica a ações sensíveis; consultar log não é).
//
// Resposta do backend (json_success / json_error):
//   sucesso: { status: "success", message: "...", data: {...} }
//   erro:    { status: "error",   message: "..." }
//
// Duas formas de paginação convivem (decisão documentada no
// controller.py):
//   - offset/limit (`page` + `limit`, PAGE 1-INDEXADO, default 1) no
//     resumo. Diferente da rota de usuários (`pagina`, 0-indexado) --
//     não confundir. O backend devolve `paginacao: {total, page,
//     limit}`, então aqui o front numera páginas de verdade, sem a
//     heurística de "página cheia" usada em adminProfissionaisLista.js.
//   - cursor por data no detalhe (keyset pagination): o backend devolve
//     `proximo_cursor: {cursor_data, cursor_uuid}` por bloco
//     (acessos/alteracoes) e o front devolve esse par intacto na
//     chamada seguinte para "carregar mais". O cursor NUNCA é montado
//     na mão a partir de campos do item -- isso evita o client ter que
//     saber qual campo de data de cada log faz parte do cursor.
//
// IMPORTANTE: assume-se o blueprint registrado com
// url_prefix="/auditoria" (URL_BASE_API já inclui /v1/api -- ver
// urlConfig.js). Se o registro em app.py usar outro prefixo, ajustar
// BASE_URL abaixo.

import { URL_BASE_API } from "../../../../sharedConfig/urlConfig.js";

const BASE_URL = `${URL_BASE_API}/auditoria`;

/**
 * Executa o fetch e normaliza a resposta no formato do backend.
 * Lança ApiError em erro de rede ou de negócio (status: "error").
 * Sem Content-Type padrão: todas as rotas deste módulo são GET sem
 * body, então não enviamos header de conteúdo desnecessariamente.
 */
async function requisitar(path, options = {}) {
  let resposta;
  try {
    resposta = await fetch(`${BASE_URL}${path}`, {
      credentials: "include",
      ...options,
    });
  } catch (erroRede) {
    throw new ApiError("Não foi possível conectar ao servidor. Verifique sua internet.", 0);
  }

  let corpo;
  try {
    corpo = await resposta.json();
  } catch {
    throw new ApiError('Resposta inesperada do servidor.', resposta.status);
  }

  if (!resposta.ok || corpo.status === 'error') {
    throw new ApiError(corpo.message || 'Ocorreu um erro inesperado.', resposta.status);
  }

  return corpo; // { status: "success", message, data }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * GET /profissionais/resumo — uma página de profissionais (ordem
 * alfabética) com último acesso e última alteração de cada um.
 *
 * Item devolvido (service.listar_resumo_por_profissional):
 *   { uuid_usuario, nome,
 *     ultimo_acesso?:    { uuid, frase_acao, data_hora },
 *     ultima_alteracao?: { uuid, frase_acao, data_hora } }
 * (os dois últimos SÓ existem se o profissional tem log daquele tipo)
 *
 * @param {object} [opcoes]
 * @param {string} [opcoes.nome]          — filtro ilike por nome (server-side)
 * @param {string} [opcoes.funcaoClinica] — "medico" | "enfermeiro"
 * @param {boolean|null} [opcoes.isAdmin] — true | false | null (null = sem filtro)
 * @param {string} [opcoes.acao]          — texto livre (ex: "editar_paciente")
 * @param {number} [opcoes.page=1]        — 1-indexado
 * @param {number} [opcoes.limit=10]      — máx. 50 (travado no backend)
 */
export function listarResumoProfissionais({ nome, funcaoClinica, isAdmin, acao, page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams();
  if (nome) params.set('nome', nome);
  if (funcaoClinica) params.set('funcao_clinica', funcaoClinica);
  if (isAdmin !== null && isAdmin !== undefined) params.set('is_admin', String(isAdmin));
  if (acao) params.set('acao', acao);
  params.set('page', String(page));
  params.set('limit', String(limit));

  return requisitar(`/profissionais/resumo?${params.toString()}`, { method: 'GET' });
}

/**
 * GET /profissionais/<uuid>/detalhe — histórico completo de um
 * profissional, dois blocos independentes (acessos/alteracoes), cada
 * um paginado por cursor de data.
 *
 * Resposta (data):
 *   { acessos:    { itens, tem_mais, proximo_cursor },
 *     alteracoes: { itens, tem_mais, proximo_cursor } }
 *
 * Item de acesso (LogAcesso.to_dict):
 *   { uuid, recurso_acessado, operacao, data_hora, resultado,
 *     motivo_negacao }  -- motivo_negacao só é preenchido quando
 *   resultado != "sucesso" (null nos demais casos)
 * Item de alteração (LogAlteracao.to_dict):
 *   { uuid, acao, tabela_origem, operacao, campo_alterado,
 *     valor_anterior, valor_novo, justificativa, alterado_em }
 *
 * @param {string} uuid — uuid_usuario (nunca id interno)
 * @param {object} [opcoes]
 * @param {string} [opcoes.acao]           — texto livre; no bloco de
 *   alterações bate em LogAlteracao.acao (e, quando é categoria de
 *   negócio válida, também na operação SQL traduzida -- regra do
 *   repository). No bloco de acessos o backend aplica como operacao.
 * @param {string} [opcoes.operacaoAcesso] — "leitura" | "escrita" |
 *   "exclusao-logica" | "exportacao"; filtro EXTRA que só vale para o
 *   bloco de acessos.
 * @param {string} [opcoes.dataInicio]     — "YYYY-MM-DD"
 * @param {string} [opcoes.dataFim]        — "YYYY-MM-DD"
 * @param {number} [opcoes.limit=10]       — máx. 50
 * @param {object|null} [opcoes.cursorAcessos]    — {cursor_data, cursor_uuid}
 * @param {object|null} [opcoes.cursorAlteracoes] — {cursor_data, cursor_uuid}
 *
 * Datas são enviadas como "YYYY-MM-DD" mesmo: o backend faz
 * datetime.fromisoformat(), que aceita esse formato (vira meia-noite
 * do dia). A janela máxima de 7 dias é validada no backend
 * (JANELA_MAXIMA_DIAS) -- o front também valida antes de chamar
 * (ver validarJanelaDias em adminAuditoriaHelpers.js).
 */
export function detalheProfissional(uuid, { acao, operacaoAcesso, dataInicio, dataFim, limit = 10, cursorAcessos, cursorAlteracoes } = {}) {
  const params = new URLSearchParams();
  if (acao) params.set('acao', acao);
  if (operacaoAcesso) params.set('operacao_acesso', operacaoAcesso);
  if (dataInicio) params.set('data_inicio', dataInicio);
  if (dataFim) params.set('data_fim', dataFim);
  params.set('limit', String(limit));

  if (cursorAcessos?.cursor_data) {
    params.set('cursor_acessos_data', cursorAcessos.cursor_data);
    if (cursorAcessos.cursor_uuid) params.set('cursor_acessos_uuid', cursorAcessos.cursor_uuid);
  }
  if (cursorAlteracoes?.cursor_data) {
    params.set('cursor_alteracoes_data', cursorAlteracoes.cursor_data);
    if (cursorAlteracoes.cursor_uuid) params.set('cursor_alteracoes_uuid', cursorAlteracoes.cursor_uuid);
  }

  return requisitar(`/profissionais/${encodeURIComponent(uuid)}/detalhe?${params.toString()}`, { method: 'GET' });
}