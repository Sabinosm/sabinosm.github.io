// adminCatalogosApi.js
//
// Camada de acesso à API de protocolos (blueprint Flask "protocolo") e
// às duas camadas de configuração que a página aciona (preferência
// pessoal e liberação institucional -- ver as seções ao final).
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

// Preferência pessoal do profissional (favoritos e padrão pessoal) --
// blueprint "configuracao" (main.py: /v1/api/configuracoes).
const BASE_CONFIG = `${URL_BASE_API}/configuracoes/protocolos`;

// Liberação institucional (admin) -- blueprint "empresa_protocolo"
// (main.py: /v1/api/liberacao-protocolos).
const BASE_LIBERACAO = `${URL_BASE_API}/liberacao-protocolos`;

function headersPadrao() {
  return { 'Content-Type': 'application/json' };
}

/**
 * Executa o fetch e normaliza a resposta no formato do backend.
 * Lança ApiError em caso de erro de rede ou de negócio.
 */
async function requisitar(base, path, options = {}) {
  let resposta;
  try {
    resposta = await fetch(`${base}${path}`, {
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

  return requisitar(BASE_URL, `/catalogo/filtrar?${params.toString()}`, { method: 'GET' });
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
  return requisitar(BASE_URL, `/${encodeURIComponent(uuid)}`, { method: 'GET' });
}

// ============================================
// Preferência pessoal (médico/enfermeiro)
// Todas devolvem ConfiguracaoProtocolo.to_dict():
//   { id, id_protocolo, uuid, sigla, nome, tipo, em_uso, escopo_default, ... }
// Erros de regra chegam como ApiError (409 obrigatório / padrão da
// instituição, 400 não liberado, etc.) com mensagem pronta em português.
// ============================================

/** PUT /habilitar -- adiciona aos favoritos (só se liberado pela instituição). */
export function habilitarProtocolo(uuid) {
  return requisitar(BASE_CONFIG, `/${encodeURIComponent(uuid)}/habilitar`, { method: 'PUT' });
}

/** PUT /desabilitar -- pausa o favorito (recusado se obrigatório ou padrão da instituição). */
export function desabilitarProtocolo(uuid) {
  return requisitar(BASE_CONFIG, `/${encodeURIComponent(uuid)}/desabilitar`, { method: 'PUT' });
}

/** PUT /default { escopo } -- define o padrão pessoal do escopo. */
export function definirDefaultPessoal(uuid, escopo) {
  return requisitar(BASE_CONFIG, `/${encodeURIComponent(uuid)}/default`, {
    method: 'PUT',
    body: JSON.stringify({ escopo }),
  });
}

/** DELETE /default -- volta ao padrão da instituição naquele escopo. */
export function removerDefaultPessoal(uuid) {
  return requisitar(BASE_CONFIG, `/${encodeURIComponent(uuid)}/default`, { method: 'DELETE' });
}

// ============================================
// Liberação institucional (admin)
// Devolvem EmpresaProtocolo.to_dict() + uuid_protocolo:
//   { ativo, politica, escopo_default_institucional, aprovado_por, ... }
// ============================================

/**
 * PUT /<uuid>/status { ativo, politica? } -- libera/desativa e/ou muda a política.
 * `politica` omitida = não altera. Desativar um 'obrigatorio' exige mandar
 * politica: 'opcional' junto (o back recusa caso contrário).
 */
export function alterarStatusProtocolo(uuid, { ativo, politica } = {}) {
  const corpo = { ativo: Boolean(ativo) };
  if (politica !== undefined) corpo.politica = politica;
  return requisitar(BASE_LIBERACAO, `/${encodeURIComponent(uuid)}/status`, {
    method: 'PUT',
    body: JSON.stringify(corpo),
  });
}

/** PUT /<uuid>/default { escopo } -- define o padrão da instituição do escopo. */
export function definirPadraoInstitucional(uuid, escopo) {
  return requisitar(BASE_LIBERACAO, `/${encodeURIComponent(uuid)}/default`, {
    method: 'PUT',
    body: JSON.stringify({ escopo }),
  });
}


// ============================================
// Página de detalhe (adminCatalogosDetalhe.html) -- só leitura, qualquer
// usuário logado, liberado ou não: ver não é usar.
// ============================================

/**
 * GET /catalogo/<uuid> -- tudo que a página precisa para carregar sozinha:
 *   { protocolo, resumo, versao_ativa }
 *   protocolo: detalhe do catálogo (explicacao {o_que_e, quando_usar,
 *     como_interpretar}, orgao_emissor, referencia_bibliografica,
 *     data_vigencia, versao_vigente, tipo_resultado...)
 *   resumo: o MESMO DTO dos cards (liberado_pela_empresa, politica,
 *     padrao_institucional, favorito, default_pessoal...)
 *   versao_ativa: { numero_versao, vigente_desde, status } | null
 */
export function buscarDetalheCatalogo(uuid) {
  return requisitar(BASE_URL, `/catalogo/${encodeURIComponent(uuid)}`, { method: 'GET' });
}

/** GET /news2/<uuid>/campos -- [{ campo, texto, tipo_campo, opcoes }] (só o NEWS2). */
export function buscarCamposNews2(uuid) {
  return requisitar(BASE_URL, `/news2/${encodeURIComponent(uuid)}/campos`, { method: 'GET' });
}

/**
 * GET /protocolo-composto/<uuid>/composicao -- estrutura do composto:
 *   { versao, agregacao, regra_gatilho, modulos: [{ papel, grupo_agregacao, ordem,
 *     modulo: { nome_modulo, sigla, tipo_modulo, familia_calculo, tipo_saida,
 *               descricao, referencia_bibliografica },
 *     numero_versao, explicacao,
 *     campos: [{ codigo, nome, tipo_dado, unidade, opcoes, valor_min, valor_max,
 *                obrigatorio, ordem }] }] }
 */
export function buscarComposicao(uuid) {
  return requisitar(BASE_URL, `/protocolo-composto/${encodeURIComponent(uuid)}/composicao`, { method: 'GET' });
}