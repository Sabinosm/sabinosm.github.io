/**
 * medicamentoEmUsoValidation.js
 * Espelho de schema_medicamento_em_uso.py.
 *
 * Não existe "atualizar no lugar": dose/frequência mudam via
 * /substituir (fecha o antigo e cria o novo), e o registro fecha via
 * /encerrar. Espelhe SEMPRE isso aqui — se um dia existir um PUT
 * direto, o histórico do paciente perde o sentido.
 *
 * NOTA DE INCONSISTÊNCIA DO BACK (MedicamentoEmUsoSubstituirSchema):
 * o model_validator diz "ao menos um de descricao/dose/frequencia",
 * mas o field_validator de `descricao` rejeita None — ou seja,
 * descricao é de fato OBRIGATÓRIA em /substituir. Corrigir um dos
 * dois no back; até lá, esta validação trata descricao como obrigatória.
 */
import { setErro, resultado, tam, vazio, dataIsoValida, dataFutura } from "./generalValidation.js";
import { validarMotivoRemocao } from "./validacaoRemocao.js";

export const STATUS_ENCERRAMENTO_MEDICAMENTO = Object.freeze(['interrompido', 'concluido']);

const REGEX_UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function textoOpcional(src, campo, erros, max) {
  const v = src[campo];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || tam(v) > max) {
    setErro(erros, campo, `Texto inválido (máx. ${max} caracteres).`);
    return undefined;
  }
  return v.trim() || null;
}

function dataOpcionalNaoFutura(src, campo, erros) {
  const v = src[campo];
  if (v === undefined || v === null || v === '') return null;
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

/**
 * POST: registra medicamento ativo.
 *  - uuid_catalogo OU descricao livre (obrigatória sem catálogo);
 *  - com uuid_catalogo, descricao vazia é preenchida pelo back com o
 *    princípio ativo do catálogo.
 */
export function validarCriarMedicamentoEmUso(payload) {
  const erros = {};
  const out = {};
  const src = payload ?? {};

  if (!vazio(src.uuid_catalogo)) {
    if (typeof src.uuid_catalogo !== 'string' || !REGEX_UUID.test(src.uuid_catalogo.trim())) {
      setErro(erros, 'uuid_catalogo', 'UUID inválido.');
    } else {
      out.uuid_catalogo = src.uuid_catalogo.trim();
    }
  }

  const descricao = textoOpcional(src, 'descricao', erros, 2000);
  if (descricao !== undefined) {
    if (descricao === null && !out.uuid_catalogo) {
      setErro(erros, 'descricao', 'Obrigatória quando o medicamento não está vinculado ao catálogo.');
    } else if (descricao !== null) {
      out.descricao = descricao;
    }
  }

  const dose = textoOpcional(src, 'dose', erros, 100);
  if (dose !== undefined && dose !== null) out.dose = dose;

  const frequencia = textoOpcional(src, 'frequencia', erros, 100);
  if (frequencia !== undefined && frequencia !== null) out.frequencia = frequencia;

  const desde = dataOpcionalNaoFutura(src, 'desde', erros);
  if (desde !== undefined) out.desde = desde;

  return resultado(out, erros);
}

/**
 * POST /substituir: troca dose/frequência/descrição (fecha o antigo,
 * cria o novo). descricao é obrigatória aqui — ver nota de
 * inconsistência no topo do arquivo.
 */
export function validarSubstituirMedicamentoEmUso(payload) {
  const erros = {};
  const out = {};
  const src = payload ?? {};

  const descricao = textoOpcional(src, 'descricao', erros, 2000);
  if (descricao === null || descricao === undefined) {
    if (!('descricao' in src) || vazio(src.descricao)) {
      setErro(erros, 'descricao', 'Informe a descrição do medicamento.');
    }
  } else {
    out.descricao = descricao;
  }

  const dose = textoOpcional(src, 'dose', erros, 100);
  if (dose !== undefined) out.dose = dose;

  const frequencia = textoOpcional(src, 'frequencia', erros, 100);
  if (frequencia !== undefined) out.frequencia = frequencia;

  const dataMudanca = dataOpcionalNaoFutura(src, 'data_mudanca', erros);
  if (dataMudanca !== undefined) out.data_mudanca = dataMudanca;

  return resultado(out, erros);
}

/** POST /encerrar: fecha o registro como interrompido ou concluído. */
export function validarEncerrarMedicamentoEmUso(payload) {
  const erros = {};
  const out = {};
  const src = payload ?? {};

  if (!STATUS_ENCERRAMENTO_MEDICAMENTO.includes(src.status_uso)) {
    setErro(erros, 'status_uso', `Deve ser um de: ${STATUS_ENCERRAMENTO_MEDICAMENTO.join(', ')}.`);
  } else {
    out.status_uso = src.status_uso;
  }

  const ate = dataOpcionalNaoFutura(src, 'ate', erros);
  if (ate !== undefined) out.ate = ate; // omitido = hoje (back assume)

  return resultado(out, erros);
}

/** DELETE: mesmo contrato de remoção compartilhado. */
export function validarRemoverMedicamentoEmUso(payload) {
  return validarMotivoRemocao(payload);
}