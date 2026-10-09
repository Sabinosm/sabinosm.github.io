/**
 * generalValidation.js
 * Espelho de src/core/validacoes.py + erros_pydantic.py.
 * O BACKEND é a verdade; aqui é só feedback rápido na UI.
 *
 * Contrato de toda validação específica:
 *   { ok: boolean, dados: objeto-normalizado | null, erros: { campo: mensagem } }
 * Erros sem campo (regra cruzada) vão em erros._geral, igual ao back.
 */

export const CAMPO_GERAL = "_geral";

export const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

// ---------------------------------------------------------------- helpers

export function limparDigitos(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor).replace(/\D/g, "");
}

/** Comprimento por code point (igual ao len() do Python). */
export const tam = (s) => [...s].length;

/** Equivalente a str_strip_whitespace: só mexe em string. */
export const strip = (v) => (typeof v === "string" ? v.trim() : v);

/** Só o primeiro erro de cada campo é mantido (como erros_pydantic_por_campo). */
export function setErro(erros, campo, msg) {
  if (!(campo in erros)) erros[campo] = msg;
}

export function resultado(dados, erros) {
  const ok = Object.keys(erros).length === 0;
  return { ok, dados: ok ? dados : null, erros };
}

/** extra = "forbid": campo desconhecido no payload vira erro naquele campo. */
export function checarCamposExtras(payload, permitidos, erros) {
  for (const campo of Object.keys(payload)) {
    if (!permitidos.has(campo)) setErro(erros, campo, "Campo não permitido.");
  }
}

/** Valida tamanho (min/max) de string já "strippada". */
export function checarTamanho(erros, campo, v, { min, max }) {
  if (typeof v !== "string") return;
  const n = tam(v);
  if (min !== undefined && n < min) setErro(erros, campo, `Deve ter ao menos ${min} caracteres.`);
  else if (max !== undefined && n > max) setErro(erros, campo, `Deve ter no máximo ${max} caracteres.`);
}

export const vazio = (v) => v === undefined || v === null || v === "";

// ------------------------------------------------------------ documentos

export function validarCpf(cpf) {
  const c = limparDigitos(cpf);
  if (c.length !== 11) return false;
  if (c === c[0].repeat(11)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(c[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if ((resto < 10 ? resto : 0) !== Number(c[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(c[i]) * (11 - i);
  resto = (soma * 10) % 11;
  return (resto < 10 ? resto : 0) === Number(c[10]);
}

export function validarCnpj(cnpj) {
  const c = limparDigitos(cnpj);
  if (c.length !== 14) return false;
  if (c === c[0].repeat(14)) return false;

  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let soma = p1.reduce((acc, p, i) => acc + Number(c[i]) * p, 0);
  let resto = soma % 11;
  if ((resto < 2 ? 0 : 11 - resto) !== Number(c[12])) return false;

  soma = p2.reduce((acc, p, i) => acc + Number(c[i]) * p, 0);
  resto = soma % 11;
  return (resto < 2 ? 0 : 11 - resto) === Number(c[13]);
}

export function validarCpfOuCnpj(doc) {
  const d = limparDigitos(doc);
  if (d.length === 11) return validarCpf(d);
  if (d.length === 14) return validarCnpj(d);
  return false;
}

// -------------------------------------------------------- contato/endereço

export function validarTelefoneBr(telefone) {
  const t = limparDigitos(telefone);
  if (t.length !== 10 && t.length !== 11) return false;
  if (!DDDS_VALIDOS.has(Number(t.slice(0, 2)))) return false;
  if (t.length === 11 && t[2] !== "9") return false;
  if (t.length === 10 && !"2345".includes(t[2])) return false;
  const numero = t.slice(2);
  return numero !== numero[0].repeat(numero.length);
}

export function validarCep(cep) {
  const c = limparDigitos(cep);
  return c.length === 8 && c !== c[0].repeat(8);
}

export function validarEmail(email) {
  // Mais permissivo que o EmailStr do back; o back decide o caso final.
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ------------------------------------------------------------------ senha

// Delegado ao utilitário compartilhado do front (espelha validar_senha do back).
// Retorna { valida: boolean, mensagem: string }. Ajuste o caminho conforme seu projeto.
export { validarSenha } from "../passwordManagement/passwordValidation.js";

// ------------------------------------------------------------- cep / datas

/** Porte de validar_e_devolver_cep: só dígitos se válido, senão null. */
export function validarEDevolverCep(cep) {
  const limpo = limparDigitos(cep);
  return validarCep(limpo) ? limpo : null;
}

/** "AAAA-MM-DD" e data real do calendário (rejeita 2024-02-31). */
export function dataIsoValida(v) {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Hoje (fuso local do navegador) em "AAAA-MM-DD". */
export function hojeIso() {
  const t = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

/** Equivalente a `v > date.today()` do back (data ISO já validada). */
export const dataFutura = (v) => v > hojeIso();