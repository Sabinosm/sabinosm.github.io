// adminCatalogosApi.js
//
// Camada de acesso à API de protocolos (blueprint Flask "protocolo").
// Espelha as rotas usadas pela página de catálogo:
//
//   GET  /catalogo/filtrar?tipo_protocolo=&escopo_populacao=&escopo_uso=&apenas_liberados=&pagina=
//        -> listarProtocolos({ pagina, tipo_protocolo, escopo_populacao, escopo_uso, apenas_liberados })
//   GET  /<uuid>          -> buscarProtocolo(uuid)
//
// Resposta do backend (json_success / json_error):
//   sucesso: { status: "success", message: "...", data: {...} | [...] }
//   erro:    { status: "error",   message: "..." }
//
// Mesmas convenções de adminProfissionaisApi.js:
//   - autenticação por sessão/cookie (credentials: "include");
//   - URL_BASE_API já inclui o prefixo /v1/api (urlConfig.js) -- aqui
//     só concatenamos o path do blueprint;
//   - TODO: se um CSRF token ou outro header for definido depois,
//     adicionar em `headersPadrao` abaixo, centralizado.
//
// IMPORTANTE — prefixo do blueprint: registrado como "protocolo"
// (bp_protocolo em protocolo_catalogo_controller.py), então a URL
// final é <URL_BASE_API>/protocolos... Se o registro no app usar
// outro prefixo (ex: /protocolo sem o "s"), ajustar BASE_URL abaixo.

import { URL_BASE_API } from "../../../../sharedConfig/urlConfig.js";

// TODO: confirmar o prefixo real de registro do blueprint no app.py.
const BASE_URL = `${URL_BASE_API}/protocolos`;

function headersPadrao() {
  return { 'Content-Type': 'application/json' };
}

/**
 * Executa o fetch e normaliza a resposta no formato do backend.
 * Lança ApiError em caso de erro de rede ou de negócio.
 */
async function requisitar(path, options = {}) {
  let resposta;
  try {
    resposta = await fetch(`${BASE_URL}${path}`, {
      credentials: "include",
      headers: headersPadrao(),
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
 * GET /catalogo/filtrar — lista os protocolos com status de liberação
 * para a empresa da sessão.
 *
 * Cada item (DTO montado por ProtocoloCatalogoService._montar_resumo):
 *   { uuid, nome_protocolo, sigla, tipo_protocolo, escopo_populacao,
 *     escopo_uso, liberado_pela_empresa, politica }
 *
 * Paginação: o back usa `pagina` como NÚMERO DA PÁGINA (0, 1, 2...)
 * e multiplica por 20 internamente para o offset. Tamanho de página
 * FIXO em 20 (POR_PAGINA no módulo de lista) -- o servidor não
 * devolve total nem flag "tem próxima".
 *
 * @param {object} [opcoes]
 * @param {number} [opcoes.pagina=0]
 * @param {string} [opcoes.tipo_protocolo]
 * @param {string} [opcoes.escopo_populacao]
 * @param {string} [opcoes.escopo_uso]
 * @param {boolean} [opcoes.apenas_liberados]
 */
export function listarProtocolos({
  pagina = 0,
  tipo_protocolo,
  escopo_populacao,
  escopo_uso,
  apenas_liberados = false,
} = {}) {
  const params = new URLSearchParams();
  params.set('pagina', String(pagina));
  if (tipo_protocolo) params.set('tipo_protocolo', tipo_protocolo);
  if (escopo_populacao) params.set('escopo_populacao', escopo_populacao);
  if (escopo_uso) params.set('escopo_uso', escopo_uso);
  if (apenas_liberados) params.set('apenas_liberados', 'true');

  return requisitar(`/catalogo/filtrar?${params.toString()}`, { method: 'GET' });
}

/**
 * GET /<uuid> — detalhe completo (ProtocoloCatalogo.to_dict):
 *   { uuid, nome_protocolo, sigla, tipo_resultado, escopo_populacao,
 *     escopo_uso, versao_vigente, status, explicacao }
 * onde `explicacao` é o objeto validado por ExplicacaoProtocolo
 * (Caminho A / seed -- nunca muda em runtime):
 *   { o_que_e, quando_usar, como_interpretar }
 */
export function buscarProtocolo(uuid) {
  return requisitar(`/${uuid}`, { method: 'GET' });
}