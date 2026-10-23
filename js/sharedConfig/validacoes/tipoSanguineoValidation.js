/**
 * tipoSanguineoValidation.js
 * Espelho de schema_tipo_sanguineo.py (ObservacaoTipoSanguineoCreateSchema).
 *
 * O back normaliza a caixa ANTES de validar: "a+", " A+ " -> "A+";
 * "desconhecido" (único valor que não é sigla) permanece minúsculo.
 * Espelhamos a mesma normalização aqui para o front e o back
 * validarem exatamente a mesma coisa.
 */
import { setErro, resultado } from "./generalValidation.js";

export const TIPOS_SANGUINEOS = Object.freeze([
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'desconhecido',
]);

// Espelha _MAPA_NORMALIZACAO do back.
const MAPA_NORMALIZACAO = Object.freeze({
  'A+': 'A+', 'A-': 'A-', 'B+': 'B+', 'B-': 'B-',
  'AB+': 'AB+', 'AB-': 'AB-', 'O+': 'O+', 'O-': 'O-',
  'DESCONHECIDO': 'desconhecido',
});

/**
 * POST observação de tipo sanguíneo. Sempre cria registro novo
 * (append-only); "editar" tipo sanguíneo = registrar nova observação.
 *
 * @param {{tipo_sanguineo?: string}} payload
 */
export function validarRegistrarTipoSanguineo(payload) {
  const erros = {};
  const out = {};
  const src = payload ?? {};

  const bruto = typeof src.tipo_sanguineo === 'string' ? src.tipo_sanguineo.trim() : '';
  const normalizado = MAPA_NORMALIZACAO[bruto.toUpperCase()];

  if (!normalizado) {
    setErro(erros, 'tipo_sanguineo', `Deve ser um de: ${TIPOS_SANGUINEOS.join(', ')}.`);
  } else {
    out.tipo_sanguineo = normalizado;
  }

  return resultado(out, erros);
}