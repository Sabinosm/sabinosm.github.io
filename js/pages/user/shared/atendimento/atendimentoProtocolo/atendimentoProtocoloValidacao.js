// atendimentoProtocoloValidacao.js
//
// Validação do preenchimento do protocolo no cliente (pura). Espelha
// EscorePonderadoStrategy.validar_respostas + traduzir_booleano do back, para
// dar feedback por campo ANTES do POST. O back continua sendo a autoridade.
//
//  - vazio / null / "" -> AUSENTE (permitido: a execução sai "incompleta")
//  - numerico: aceita vírgula decimal; rejeita NaN/Infinity; faixa min/max se houver
//  - categorico: o valor precisa estar nas opções (se houver opções)
//  - booleano: sim/não, true/false, 1/0 -> boolean de verdade
//  - obrigatório faltando: aviso em `ausentesObrigatorios`; só vira erro com
//    { exigirObrigatorios: true } (o back aceita execução incompleta)
//
// Entrada: campos normalizados (atendimentoProtocoloCampos.normalizarCampo)
//          e respostas cruas { campo: valor } lidas do formulário.

const VERDADEIRO = new Set(["true", "sim", "s", "yes", "y", "1", "verdadeiro"]);
const FALSO = new Set(["false", "nao", "n", "no", "0", "falso"]);

const vazio = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");
const semAcento = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** true / false, ou undefined se não reconhecer (nunca adivinha). */
export function traduzirBooleano(v) {
  if (typeof v === "boolean") return v;
  if (v === 0 || v === 1) return Boolean(v);
  if (typeof v === "string") {
    const t = semAcento(v);
    if (VERDADEIRO.has(t)) return true;
    if (FALSO.has(t)) return false;
  }
  return undefined;
}

/**
 * @returns {{ ok: boolean, erros: Object, validados: Object,
 *             ausentes: string[], ausentesObrigatorios: string[] }}
 */
export function validarRespostas(campos, respostas, { exigirObrigatorios = false } = {}) {
  const porCampo = new Map(campos.map((c) => [c.campo, c]));
  const erros = {};
  const validados = {};
  const ausentes = [];
  const ausentesObrigatorios = [];

  for (const chave of Object.keys(respostas ?? {})) {
    if (!porCampo.has(chave)) erros[chave] = "campo desconhecido para este protocolo";
  }

  for (const c of campos) {
    const bruto = respostas?.[c.campo];

    if (vazio(bruto)) {
      ausentes.push(c.campo);
      if (c.obrigatorio) {
        ausentesObrigatorios.push(c.campo);
        if (exigirObrigatorios) erros[c.campo] = "campo obrigatório";
      }
      continue;
    }

    if (c.tipo === "numerico") {
      if (typeof bruto === "boolean") {
        erros[c.campo] = "valor numérico inválido";
        continue;
      }
      const n = typeof bruto === "string" ? Number(bruto.trim().replace(",", ".")) : Number(bruto);
      if (!Number.isFinite(n)) erros[c.campo] = `'${bruto}' não é um número`;
      else if (c.min != null && n < c.min) erros[c.campo] = `mínimo permitido: ${c.min}`;
      else if (c.max != null && n > c.max) erros[c.campo] = `máximo permitido: ${c.max}`;
      else validados[c.campo] = n;
    } else if (c.tipo === "categorico") {
      const valor = String(bruto);
      if (c.opcoes.length && !c.opcoes.some((o) => o.valor === valor)) {
        erros[c.campo] = `'${valor}' não é uma opção válida`;
      } else {
        validados[c.campo] = valor;
      }
    } else if (c.tipo === "booleano") {
      const b = traduzirBooleano(bruto);
      if (b === undefined) erros[c.campo] = "valor booleano inválido (use sim ou não)";
      else validados[c.campo] = b;
    } else {
      validados[c.campo] = String(bruto).trim();
    }
  }

  return { ok: Object.keys(erros).length === 0, erros, validados, ausentes, ausentesObrigatorios };
}
