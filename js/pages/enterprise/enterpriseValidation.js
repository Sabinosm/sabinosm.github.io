import { validarCadastroEmpresa, checarFormatosUi } from "../../sharedConfig/validacoes/empresaValidation.js";
import { validarCnpj, setErro, vazio, strip } from "../../sharedConfig/validacoes/generalValidation.js";
import {
  setError, clearError, pintarErros, pintarMensagemBackend, ligarCampo,
} from "../../sharedConfig/validacoes/domErros.js";

const CAMPOS = ["cnpj", "cnes", "nome_fantasia", "razao_social", "cep", "bairro", "numero", "complemento"];

// Obrigatórios só no formulário (no back são opcionais).
const EXIGIDOS = { cep: "Informe o CEP", bairro: "Informe o bairro", numero: "Informe o número" };

function ler() {
  const v = (id) => document.getElementById(id)?.value ?? "";
  return {
    cnpj: v("cnpj") || null,
    cnes: v("cnes").trim() || null,
    nome_fantasia: v("nome_fantasia"),
    razao_social: v("razao_social") || null,
    cep: v("cep"),
    bairro: v("bairro"),
    numero: v("numero"),
    complemento: v("complemento") || null,
  };
}

// { idDoDom: mensagem }
function avaliar() {
  const dados = ler();
  const { erros } = validarCadastroEmpresa(dados);

  for (const [campo, msg] of Object.entries(EXIGIDOS)) {
    if (vazio(strip(dados[campo]))) setErro(erros, campo, msg);
  }
  checarFormatosUi(dados, erros);

  // A única regra sem campo é "CNPJ ou CNES": aparece no input do CNPJ.
  if (erros._geral) {
    setErro(erros, "cnpj", erros._geral.replace(/\.$/, ""));
    delete erros._geral;
  }
  return erros;
}

function validarUm(id) {
  const erros = avaliar();
  if (erros[id]) setError(id, erros[id]);
  else clearError(id);
  return !erros[id];
}

export function validarFormularioEmpresa() {
  const erros = avaliar();
  CAMPOS.forEach((id) => (erros[id] ? setError(id, erros[id]) : clearError(id)));
  const planoOk = !!document.querySelector('input[name="plano"]:checked');
  return Object.keys(erros).length === 0 && planoOk;
}

export function ligarValidacaoEmTempoReal() {
  ["cnes", "nome_fantasia", "razao_social", "bairro", "numero", "complemento"]
    .forEach((id) => ligarCampo(id, validarUm));

  const cnpjInput = document.getElementById("cnpj");
  const cnesInput = document.getElementById("cnes");
  const cepInput = document.getElementById("cep");

  // Quem pulou o CNPJ para preencher o CNES não deve ver erro no blur.
  cnpjInput?.addEventListener("blur", () => {
    if (cnpjInput.value.trim()) validarUm("cnpj");
  });
  // Preencher o CNES resolve "informe o CNPJ ou o CNES".
  cnesInput?.addEventListener("input", () => {
    if (cnesInput.value.trim() && cnpjInput && !cnpjInput.value.trim()) clearError("cnpj");
  });
  cepInput?.addEventListener("blur", () => validarUm("cep"));
}

// Erros do back: texto "campo: msg; ..." (plano B) ou objeto { campo: msg }.
export function aplicarErrosBackend(mensagem) {
  return pintarMensagemBackend(mensagem, (c) => c, CAMPOS);
}
export function aplicarErrosPorCampo(erros) {
  return pintarErros(erros, (c) => c, CAMPOS);
}

export { validarCnpj as isValidCNPJ, setError, clearError };