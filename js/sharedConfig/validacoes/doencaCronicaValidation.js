/**
 * doencaCronicaValidation.js
 * Espelho de schema_doenca_cronica.py.
 *
 * REGRA DE OURO do domínio: mudança de status/CID/desde NUNCA é PUT.
 * São fatos clínicos com histórico e mudam por POST .../revisar
 * (fecha a linha vigente e cria uma nova). O PUT só corrige
 * `observacoes` (texto livre, sem significado clínico).
 */
import { setErro, resultado, tam, vazio, dataIsoValida, dataFutura } from "./generalValidation.js";
import { validarMotivoRemocao } from "./validacaoRemocao.js";

export const STATUS_DOENCA_CRONICA = Object.freeze(['ativa', 'em-remissao']);

// Espelha _REGEX_CID10 do back: letra + 2 dígitos + opcional .x ou .xx
const REGEX_CID10 = /^[A-Z]\d{2}(\.\d{1,2})?$/;

const CAMPOS_CLINICOS = Object.freeze(['codigo_cid10', 'descricao_cid10', 'desde', 'status']);

/** CID-10: trim + uppercase; valida formato. Devolve undefined se inválido. */
function lerCid10(src, campo, erros, { obrigatorio = false } = {}) {
  const v = src[campo];
  if (vazio(v)) {
    if (obrigatorio) setErro(erros, campo, 'Informe o CID-10.');
    return undefined;
  }
  if (typeof v !== 'string') {
    setErro(erros, campo, 'Deve ser um texto.');
    return undefined;
  }
  const normalizado = v.trim().toUpperCase();
  if (!normalizado) {
    if (obrigatorio) setErro(erros, campo, 'não pode ser vazio ou só espaços');
    return undefined;
  }
  if (!REGEX_CID10.test(normalizado)) {
    setErro(erros, campo, "Formato inválido para CID-10 (ex.: 'E11' ou 'E11.9').");
    return undefined;
  }
  return normalizado;
}

/** Texto obrigatório sem só-espaços (com max). Devolve undefined se inválido. */
function lerTextoObrigatorio(src, campo, erros, max) {
  const v = src[campo];
  if (vazio(v)) {
    setErro(erros, campo, `Informe ${campo === 'descricao_cid10' ? 'a descrição do CID' : 'o campo'}.`);
    return undefined;
  }
  if (typeof v !== 'string' || tam(v) > max) {
    setErro(erros, campo, `Texto inválido (máx. ${max} caracteres).`);
    return undefined;
  }
  const t = v.trim();
  if (!t) {
    setErro(erros, campo, 'não pode ser vazio ou só espaços');
    return undefined;
  }
  return t;
}

function lerDataObrigatoriaNaoFutura(src, campo, erros) {
  const v = src[campo];
  if (vazio(v)) {
    setErro(erros, campo, 'Informe a data.');
    return undefined;
  }
  if (!dataIsoValida(v)) {
    setErro(erros, campo, 'Data inválida (use AAAA-MM-DD).');
    return undefined;
  }
  if (dataFutura(v)) {
    setErro(erros, campo, 'não pode ser uma data futura');
    return undefined;
  }
  return v;
}

function lerStatus(src, erros) {
  if (!STATUS_DOENCA_CRONICA.includes(src.status)) {
    setErro(erros, 'status', `Deve ser um de: ${STATUS_DOENCA_CRONICA.join(', ')}.`);
    return undefined;
  }
  return src.status;
}

function lerObservacoesOpcional(src, erros) {
  const v = src.observacoes;
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || tam(v) > 2000) {
    setErro(erros, 'observacoes', 'Texto inválido (máx. 2000 caracteres).');
    return undefined;
  }
  return v.trim() || null;
}

/** POST: nova doença crônica (nasce vigente). Todos clínicos obrigatórios. */
export function validarCriarDoencaCronica(payload) {
  const erros = {};
  const out = {};
  const src = payload ?? {};

  const cid = lerCid10(src, 'codigo_cid10', erros, { obrigatorio: true });
  if (cid !== undefined) out.codigo_cid10 = cid;

  const descricao = lerTextoObrigatorio(src, 'descricao_cid10', erros, 255);
  if (descricao !== undefined) out.descricao_cid10 = descricao;

  const desde = lerDataObrigatoriaNaoFutura(src, 'desde', erros);
  if (desde !== undefined) out.desde = desde;

  const status = lerStatus(src, erros);
  if (status !== undefined) out.status = status;

  const obs = lerObservacoesOpcional(src, erros);
  if (obs !== undefined && obs !== null) out.observacoes = obs;

  return resultado(out, erros);
}

/**
 * PUT: SÓ `observacoes`. Se vier qualquer campo clínico, é erro com
 * orientação para usar a revisão (espelha o model_validator "before"
 * do back). `observacoes` precisa estar presente no payload (corpo
 * vazio não é atualização).
 */
export function validarAtualizarDoencaCronica(payload) {
  const erros = {};
  const out = {};
  const src = payload ?? {};

  const enviados = CAMPOS_CLINICOS.filter(c => src[c] !== undefined);
  if (enviados.length > 0) {
    setErro(
      erros,
      enviados[0],
      `${enviados.join(', ')} não podem ser editados no lugar; use a revisão, que preserva o histórico.`,
    );
  }

  if (!('observacoes' in src)) {
    setErro(erros, 'observacoes', "Informe 'observacoes'.");
  } else {
    const obs = lerObservacoesOpcional(src, erros);
    if (obs !== undefined) out.observacoes = obs; // null limpa o texto
  }

  return resultado(out, erros);
}

/**
 * POST /revisar: fecha a linha vigente e cria a nova.
 *  - ao menos um campo clínico (cid+descrição juntos contam como um);
 *  - codigo_cid10 e descricao_cid10 SEMPRE juntos;
 *  - o que não vier é copiado da vigente pelo service;
 *  - observacoes: omitida = copia; null = limpa; texto = novo valor.
 */
export function validarRevisarDoencaCronica(payload) {
  const erros = {};
  const out = {};
  const src = payload ?? {};

  const temCid = !vazio(src.codigo_cid10);
  const temDescricao = !vazio(src.descricao_cid10);
  if (temCid !== temDescricao) {
    setErro(erros, 'codigo_cid10', 'codigo_cid10 e descricao_cid10 devem ser informados juntos.');
  }

  if (temCid) {
    const cid = lerCid10(src, 'codigo_cid10', erros);
    if (cid !== undefined) out.codigo_cid10 = cid;
    const descricao = lerTextoObrigatorio(src, 'descricao_cid10', erros, 255);
    if (descricao !== undefined) out.descricao_cid10 = descricao;
  }

  if (!vazio(src.desde)) {
    if (!dataIsoValida(src.desde)) setErro(erros, 'desde', 'Data inválida (use AAAA-MM-DD).');
    else if (dataFutura(src.desde)) setErro(erros, 'desde', 'não pode ser uma data futura');
    else out.desde = src.desde;
  }

  if (src.status !== undefined && src.status !== null && src.status !== '') {
    const status = lerStatus(src, erros);
    if (status !== undefined) out.status = status;
  }

  if ('observacoes' in src) {
    const obs = lerObservacoesOpcional(src, erros);
    if (obs !== undefined) out.observacoes = obs;
  }

  const algumClinico = temCid || !vazio(src.desde) || (src.status !== undefined && src.status !== null && src.status !== '');
  if (!algumClinico) {
    setErro(erros, 'status', 'Informe ao menos um de: CID (com descrição), desde, status.');
  }

  return resultado(out, erros);
}

/** DELETE: mesmo contrato de remoção compartilhado. */
export function validarRemoverDoencaCronica(payload) {
  return validarMotivoRemocao(payload);
}