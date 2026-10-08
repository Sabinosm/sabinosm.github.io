/**
 * empresa_validation.js
 * Espelho de schema_empresa.py (CadastroEmpresaSchema / AtualizacaoEmpresaSchema).
 */
import {
  CAMPO_GERAL, limparDigitos, strip, vazio, setErro, resultado,
  checarCamposExtras, checarTamanho, validarCnpj, validarCep,
} from "./generalValidation.js";

const REGEX_NUMERO_ENDERECO = /^[A-Za-z0-9°ºª\s\-/.,]{1,20}$/;
const STATUS_PLANO = ["ativo", "inativo", "suspenso", "cancelado"];

const CAMPOS_CADASTRO = new Set([
  "nome_fantasia", "razao_social", "cnpj", "cnes", "numero", "bairro",
  "complemento", "cep", "status_plano", "plano",
]);
// Só os autogerenciáveis. Restritos (cnpj, razao_social, status_plano, plano) são barrados.
const CAMPOS_ATUALIZACAO = new Set(["nome_fantasia", "numero", "bairro", "complemento", "cep"]);

function normalizaCep(erros, d) {
  if (vazio(d.cep)) { d.cep = null; return; }
  if (!validarCep(d.cep)) setErro(erros, "cep", "CEP inválido.");
  else d.cep = limparDigitos(d.cep);
}

/** POST /empresas */
export function validarCadastroEmpresa(payload) {
  const erros = {};
  const d = Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, strip(v)]));
  checarCamposExtras(d, CAMPOS_CADASTRO, erros);

  // nome_fantasia: obrigatório, 2-255
  if (vazio(d.nome_fantasia)) setErro(erros, "nome_fantasia", "Informe o nome fantasia.");
  else checarTamanho(erros, "nome_fantasia", d.nome_fantasia, { min: 2, max: 255 });

  checarTamanho(erros, "razao_social", d.razao_social, { max: 255 });
  checarTamanho(erros, "numero", d.numero, { max: 10 });
  checarTamanho(erros, "bairro", d.bairro, { max: 100 });
  checarTamanho(erros, "complemento", d.complemento, { max: 150 });
  checarTamanho(erros, "cnes", d.cnes, { max: 20 });

  // cnpj
  if (vazio(d.cnpj)) d.cnpj = null;
  else if (!validarCnpj(d.cnpj)) setErro(erros, "cnpj", "O CNPJ está incorreto.");
  else d.cnpj = limparDigitos(d.cnpj);

  // cnes
  if (vazio(d.cnes)) d.cnes = null;
  else {
    d.cnes = limparDigitos(d.cnes);
    if (d.cnes.length !== 7) setErro(erros, "cnes", "CNES deve conter 7 dígitos.");
  }

  normalizaCep(erros, d);

  // status_plano (default "ativo")
  d.status_plano ??= "ativo";
  if (!STATUS_PLANO.includes(d.status_plano)) {
    setErro(erros, "status_plano", `status_plano deve ser um de: ${[...STATUS_PLANO].sort().join(", ")}.`);
  }

  // regra cruzada (model_validator)
  if (!d.cnpj && !d.cnes && !erros.cnpj && !erros.cnes) {
    setErro(erros, CAMPO_GERAL, "Informe o CNPJ ou o CNES.");
  }

  return resultado(d, erros);
}

/** PUT /empresas/:id  (parcial; extra = forbid barra campos restritos) */
export function validarAtualizacaoEmpresa(payload) {
  const erros = {};
  const d = Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, strip(v)]));
  checarCamposExtras(d, CAMPOS_ATUALIZACAO, erros);

  if (d.nome_fantasia !== undefined && d.nome_fantasia !== null) {
    checarTamanho(erros, "nome_fantasia", d.nome_fantasia, { min: 2, max: 255 });
  }
  checarTamanho(erros, "bairro", d.bairro, { max: 100 });
  checarTamanho(erros, "complemento", d.complemento, { max: 150 });
  checarTamanho(erros, "numero", d.numero, { max: 10 });

  if ("numero" in d) {
    if (vazio(d.numero)) d.numero = null;
    else if (!REGEX_NUMERO_ENDERECO.test(d.numero)) {
      setErro(erros, "numero", "Número do endereço contém caracteres inválidos.");
    }
  }
  if ("cep" in d) normalizaCep(erros, d);

  return resultado(d, erros);
}

/**
 * Regras EXTRAS só do front (herdadas dos validadores antigos): o back não
 * as exige, mas barram caracteres de risco/estranhos antes do envio.
 */
export const FORMATOS_UI_EMPRESA = {
  nome_fantasia: /^[\p{L}\p{N}\s.,&\-'()/]+$/u,
  razao_social: /^[\p{L}\p{N}\s.,&\-'()/]+$/u,
  cep: /^\d{5}-?\d{3}$/,
  bairro: /^[\p{L}\p{N}\s.,\-'()]+$/u,
  numero: /^(\d{1,8}[A-Za-z]?|[sS]\/?[nN])$/,
  complemento: /^[\p{L}\p{N}\s.,\-'°ºª/]*$/u,
};

/** Acrescenta "Formato inválido." (sem sobrescrever erro já existente). */
export function checarFormatosUi(d, erros) {
  for (const [campo, regex] of Object.entries(FORMATOS_UI_EMPRESA)) {
    const v = strip(d[campo]);
    if (!vazio(v) && !regex.test(v)) setErro(erros, campo, "Formato inválido.");
  }
}