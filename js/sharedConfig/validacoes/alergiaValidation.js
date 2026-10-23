/**
 * validacaoRemocao.js
 * Contrato de soft delete COMPARTILHADO pelos blocos clínicos
 * (alergia, doença crônica, medicamento em uso). Os três schemas
 * Pydantic de remoção (AlergiaRemoverSchema, DoencaCronicaRemoverSchema,
 * MedicamentoEmUsoRemoverSchema) têm exatamente o mesmo contrato:
 *   - motivo_delete: enum de 5 valores (obrigatório);
 *   - observacoes_delete: opcional, MAS obrigatória (não vazia) quando
 *     motivo_delete === 'outro'.
 *
 * Um único helper = uma única fonte de verdade quando o contrato
 * mudar (é editado em mais de uma localidade, como você pediu).
 */
import { setErro, resultado, tam } from "./generalValidation.js";

export const MOTIVOS_DELETE = Object.freeze([
  'erro-digitacao',
  'registro-duplicado',
  'diagnostico-incorreto',
  'solicitacao-paciente',
  'outro',
]);

/**
 * @param {{motivo_delete?: string, observacoes_delete?: string|null}} payload
 * @returns {{dados: object, erros: object}} dados só sai limpo se erros for vazio.
 */
export function validarMotivoRemocao(payload) {
  const erros = {};
  const out = {};
  const src = (payload && typeof payload === 'object') ? payload : {};

  if (!MOTIVOS_DELETE.includes(src.motivo_delete)) {
    setErro(erros, 'motivo_delete', 'Selecione o motivo da remoção.');
  } else {
    out.motivo_delete = src.motivo_delete;
  }

  if (src.observacoes_delete !== undefined && src.observacoes_delete !== null) {
    if (typeof src.observacoes_delete !== 'string' || tam(src.observacoes_delete) > 2000) {
      setErro(erros, 'observacoes_delete', 'Texto inválido (máx. 2000 caracteres).');
    } else {
      const texto = src.observacoes_delete.trim();
      out.observacoes_delete = texto || null;
    }
  }

  if (out.motivo_delete === 'outro' && !out.observacoes_delete) {
    setErro(erros, 'observacoes_delete', 'Descreva o motivo ao selecionar "outro".');
  }

  return resultado(out, erros);
}