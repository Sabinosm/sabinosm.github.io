/**
 * paciente_validation.js
 * Espelho de schema_paciente.py (PacienteCriarSchema,
 * PacienteAtualizarPessoalSchema, PacienteAtualizarClinicoSchema).
 *
 * Diferenças de contrato em relação aos schemas de usuário/empresa:
 *  - Estes schemas do back NÃO têm extra="forbid": campo desconhecido é
 *    ignorado, não é erro (ex.: id_regiao_geografica, status/falecido no
 *    cadastro). Aqui também são descartados em silêncio.
 *  - `dados` equivale ao campos_informados() do back: só o que foi enviado,
 *    sem nulos. Só cep é normalizado (dígitos); cpf, telefone e e-mail
 *    seguem como o usuário digitou, igual ao back.
 *  - Datas são strings "AAAA-MM-DD".
 */
import {
  setErro, resultado, tam, vazio, validarCpf, validarTelefoneBr, validarEmail,
  validarEDevolverCep, dataIsoValida, dataFutura,
} from "./validacoes_gerais.js";

const informado = (v) => v !== undefined && v !== null;

/** Texto + restrições do Field (min/max). Devolve a string ou undefined. */
function lerTexto(src, campo, erros, { min, max } = {}) {
  const v = src[campo];
  if (!informado(v)) return undefined;
  if (typeof v !== "string") { setErro(erros, campo, "Deve ser um texto."); return undefined; }
  const n = tam(v);
  if (min !== undefined && n < min) { setErro(erros, campo, `Deve ter ao menos ${min} caractere(s).`); return undefined; }
  if (max !== undefined && n > max) { setErro(erros, campo, `Deve ter no máximo ${max} caracteres.`); return undefined; }
  return v;
}

/** Data ISO não futura. Devolve a string ou undefined. */
function lerData(src, campo, erros) {
  const v = src[campo];
  if (!informado(v)) return undefined;
  if (!dataIsoValida(v)) { setErro(erros, campo, "Data inválida (use AAAA-MM-DD)."); return undefined; }
  if (dataFutura(v)) { setErro(erros, campo, "não pode ser uma data futura"); return undefined; }
  return v;
}

function soPermitidos(src, permitidos) {
  return Object.fromEntries(Object.entries(src).filter(([k]) => permitidos.has(k)));
}

/** Grava só valores não nulos (equivale a exclude_none). */
function gravar(out, campo, v) {
  if (v !== undefined && v !== null) out[campo] = v;
}

// Campos de texto compartilhados entre criação e atualização pessoal.
const NAO_VAZIOS = { nome_completo: { min: 1, max: 500 }, logradouro: { min: 1, max: 500 } };
const NORMALIZADOS = { rg: { max: 100 }, numero_residencia: { max: 50 }, contato_emergencia_nome: { max: 255 } };
const TELEFONES = ["telefone", "contato_emergencia_telefone"];

/** Validações pessoais comuns (nome, logradouro, rg..., telefones, cep, e-mail). */
function validaPessoais(src, erros, out, { bairro = false } = {}) {
  for (const [campo, regras] of Object.entries(NAO_VAZIOS)) {
    const v = lerTexto(src, campo, erros, regras);
    if (v === undefined) continue;
    if (!v.trim()) setErro(erros, campo, "não pode ser vazio ou só espaços");
    else gravar(out, campo, v);
  }

  const normalizados = bairro ? { ...NORMALIZADOS, bairro: { max: 100 } } : NORMALIZADOS;
  for (const [campo, regras] of Object.entries(normalizados)) {
    const v = lerTexto(src, campo, erros, regras);
    if (v !== undefined) gravar(out, campo, v.trim() || null);
  }

  for (const campo of TELEFONES) {
    const v = lerTexto(src, campo, erros, { max: 20 });
    if (v === undefined) continue;
    if (!validarTelefoneBr(v)) setErro(erros, campo, "telefone inválido (DDD ou formato incorreto)");
    else gravar(out, campo, v);
  }

  const cep = lerTexto(src, "cep", erros, { max: 9 });
  if (cep !== undefined) {
    const normalizado = validarEDevolverCep(cep);
    if (normalizado === null) setErro(erros, "cep", "CEP inválido");
    else gravar(out, "cep", normalizado);
  }

  if (informado(src.email)) {
    if (typeof src.email !== "string" || !validarEmail(src.email)) setErro(erros, "email", "E-mail inválido.");
    else gravar(out, "email", src.email);
  }
}

const CAMPOS_PESSOAIS = [
  "nome_completo", "telefone", "email", "logradouro", "cep",
  "contato_emergencia_telefone", "rg", "numero_residencia", "contato_emergencia_nome",
];

/** PATCH dados pessoais: tudo opcional, só valida o que vier. */
export function validarAtualizarPacientePessoal(payload) {
  const erros = {};
  const out = {};
  validaPessoais(soPermitidos(payload, new Set(CAMPOS_PESSOAIS)), erros, out);
  return resultado(out, erros);
}

const STATUS = ["ativo", "inativo", "obito"];

/** PATCH dados clínicos. falecido=true força status="obito". */
export function validarAtualizarPacienteClinico(payload) {
  const erros = {};
  const out = {};
  const src = soPermitidos(payload, new Set(["status", "falecido", "data_obito"]));

  if (informado(src.status)) {
    if (!STATUS.includes(src.status)) setErro(erros, "status", `Deve ser um de: ${STATUS.join(", ")}.`);
    else gravar(out, "status", src.status);
  }
  if (informado(src.falecido)) {
    if (typeof src.falecido !== "boolean") setErro(erros, "falecido", "Deve ser verdadeiro ou falso.");
    else gravar(out, "falecido", src.falecido);
  }
  gravar(out, "data_obito", lerData(src, "data_obito", erros));

  // model_validator: só roda se os campos individuais passaram
  if (Object.keys(erros).length === 0 && out.falecido === true) out.status = "obito";
  return resultado(out, erros);
}

/** POST de paciente: sexo_biologico, data_nascimento, nome_completo e cpf são obrigatórios. */
export function validarCriarPaciente(payload) {
  const erros = {};
  const out = {};
  const permitidos = new Set([
    "sexo_biologico", "data_nascimento", "nome_completo", "cpf",
    "data_primeiro_atendimento", "tipo_sanguineo", "telefone", "email",
    "logradouro", "cep", "numero_residencia", "rg",
    "contato_emergencia_nome", "contato_emergencia_telefone", "bairro",
  ]);
  const src = soPermitidos(payload, permitidos);

  // obrigatórios
  if (vazio(src.sexo_biologico)) setErro(erros, "sexo_biologico", "Informe o sexo biológico.");
  else if (!["M", "F", "I"].includes(src.sexo_biologico)) setErro(erros, "sexo_biologico", "Deve ser M, F ou I.");
  else out.sexo_biologico = src.sexo_biologico;

  if (vazio(src.data_nascimento)) setErro(erros, "data_nascimento", "Informe a data de nascimento.");
  else gravar(out, "data_nascimento", lerData(src, "data_nascimento", erros));

  if (vazio(src.nome_completo)) {
    delete src.nome_completo; // evita a mensagem de tamanho mínimo por cima
    setErro(erros, "nome_completo", "Informe o nome completo.");
  }

  if (vazio(src.cpf)) setErro(erros, "cpf", "Informe o CPF.");
  else if (typeof src.cpf !== "string" || !validarCpf(src.cpf)) setErro(erros, "cpf", "CPF inválido");
  else out.cpf = src.cpf;

  // opcionais
  gravar(out, "data_primeiro_atendimento", lerData(src, "data_primeiro_atendimento", erros));
  gravar(out, "tipo_sanguineo", lerTexto(src, "tipo_sanguineo", erros, { max: 10 }));
  validaPessoais(src, erros, out, { bairro: true });

  return resultado(out, erros);
}