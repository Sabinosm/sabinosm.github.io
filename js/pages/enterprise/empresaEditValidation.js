import { validarAtualizacaoEmpresa, checarFormatosUi } from "../../sharedConfig/validacoes/empresaValidation.js";
import {
  setError, clearError, pintarErros, pintarMensagemBackend, ligarCampo,
} from "../../sharedConfig/validacoes/domErros.js";

// campo do schema -> id do DOM ("nome_fantasia" -> "empresa-nome-fantasia")
const ID = (campo) => `empresa-${campo.replace(/_/g, "-")}`;
const CAMPOS_SCHEMA = ["nome_fantasia", "cep", "bairro", "numero", "complemento"];
// cnes ainda existe na tela, mas NÃO está em AtualizacaoEmpresaSchema (ver nota
// no fim): fica fora do schema e é checado só pelo formato.
const CAMPOS = [...CAMPOS_SCHEMA, "cnes"];
const IDS = CAMPOS.map(ID);
const CAMPO_DE_ID = Object.fromEntries(CAMPOS.map((c) => [ID(c), c]));

// { idDoDom: mensagem }
function avaliar() {
  const dados = {};
  for (const campo of CAMPOS_SCHEMA) {
    const v = document.getElementById(ID(campo))?.value.trim();
    if (v) dados[campo] = v;
  }
  const { erros } = validarAtualizacaoEmpresa(dados);
  checarFormatosUi(dados, erros);

  const cnes = document.getElementById(ID("cnes"))?.value.trim();
  if (cnes && !/^\d{7}$/.test(cnes)) erros.cnes = "CNES deve conter 7 dígitos.";

  return Object.fromEntries(Object.entries(erros).map(([c, m]) => [ID(c), m]));
}

function validarUm(id) {
  const erros = avaliar();
  if (erros[id]) setError(id, erros[id]);
  else clearError(id);
  return !erros[id];
}

export function ligarValidacaoEmTempoReal() {
  ["nome_fantasia", "cnes", "bairro", "numero", "complemento"]
    .forEach((campo) => ligarCampo(ID(campo), validarUm));
  document.getElementById(ID("cep"))?.addEventListener("blur", () => validarUm(ID("cep")));
}

export function validarFormularioEdicaoEmpresa() {
  const erros = avaliar();
  IDS.forEach((id) => (erros[id] ? setError(id, erros[id]) : clearError(id)));
  return Object.keys(erros).length === 0;
}

export function limparErros() {
  IDS.forEach(clearError);
}

// Erros do back: texto "campo: msg; ..." (plano B) ou objeto { campo: msg }.
export function aplicarErrosBackend(mensagem) {
  return pintarMensagemBackend(mensagem, (c) => ID(c), IDS);
}
export function aplicarErrosPorCampo(erros) {
  return pintarErros(erros, (c) => ID(c), IDS);
}

// NOTA: se o PUT enviar `cnes`, o AtualizacaoEmpresaSchema (extra="forbid")
// responde "cnes: ..." como campo não permitido. CAMPO_DE_ID fica exportado
// só para depuração.
export { CAMPO_DE_ID };