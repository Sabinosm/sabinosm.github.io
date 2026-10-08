import {
  CAMPO_GERAL, limparDigitos, strip, vazio, setErro, resultado, tam,
  checarCamposExtras, checarTamanho, validarCpf, validarTelefoneBr,
  validarEmail, validarSenha,
} from "./generalValidation.js";

const REGEX_LOGIN = /^[a-zA-Z0-9._@-]{3,30}$/;
const REGEX_UF = /^[A-Z]{2}$/;
const REGEX_NOME_PARTE = /^[A-Za-zÀ-ÖØ-öø-ÿ'-]+$/;

const CAMPOS = new Set([
  "nome_completo", "cpf", "email", "user_login", "tipo_papel", "is_admin",
  "telefone", "senha", "rqe", "especialidade",
  "numero_crm", "uf_crm", "numero_coren", "uf_coren",
]);

/** Aceita hífen (alias do back) ou underscore e devolve sempre underscore. */
function normalizaAliases(d) {
  for (const base of ["numero_crm", "uf_crm", "numero_coren", "uf_coren"]) {
    const alias = base.replace("_", "-");
    if (alias in d) { d[base] = d[alias]; delete d[alias]; }
  }
}

function validaCampos(d, erros, { atualizacao }) {
  // nome_completo
  if (vazio(d.nome_completo)) {
    if (!atualizacao) setErro(erros, "nome_completo", "Informe o nome completo.");
  } else {
    checarTamanho(erros, "nome_completo", d.nome_completo, { min: 3, max: 150 });
    const partes = d.nome_completo.split(/\s+/);
    if (partes.length < 2) setErro(erros, "nome_completo", "Informe nome e sobrenome.");
    else if (!partes.every((p) => REGEX_NOME_PARTE.test(p))) {
      setErro(erros, "nome_completo", "Nome completo contém caracteres inválidos.");
    }
  }

  // cpf
  if (vazio(d.cpf)) {
    if (!atualizacao) setErro(erros, "cpf", "Informe o CPF.");
  } else if (!validarCpf(d.cpf)) setErro(erros, "cpf", "O CPF está incorreto.");
  else d.cpf = limparDigitos(d.cpf);

  // email
  if (vazio(d.email)) {
    if (!atualizacao) setErro(erros, "email", "Informe o e-mail.");
  } else if (!validarEmail(d.email)) setErro(erros, "email", "E-mail inválido.");
  else d.email = d.email.toLowerCase();

  // user_login
  if (vazio(d.user_login)) {
    if (!atualizacao) setErro(erros, "user_login", "Informe o login.");
  } else if (!REGEX_LOGIN.test(d.user_login)) {
    setErro(erros, "user_login",
      "Login deve ter 3-30 caracteres e conter apenas letras, números, ponto, hífen, underline ou @.");
  } else d.user_login = d.user_login.toLowerCase();

  // telefone
  if (vazio(d.telefone)) d.telefone = null;
  else if (!validarTelefoneBr(d.telefone)) setErro(erros, "telefone", "Telefone com formato inválido.");
  else d.telefone = limparDigitos(d.telefone);

  // tipo_papel / is_admin
  if (!vazio(d.tipo_papel) && !["medico", "enfermeiro"].includes(d.tipo_papel)) {
    setErro(erros, "tipo_papel", "Deve ser 'medico' ou 'enfermeiro'.");
  }
  if (!vazio(d.is_admin) && typeof d.is_admin !== "boolean") {
    setErro(erros, "is_admin", "Deve ser verdadeiro ou falso.");
  }

  // UFs
  for (const campo of ["uf_crm", "uf_coren"]) {
    if (vazio(d[campo])) continue; // vazio: "Informe..." sai da regra cruzada
    const uf = d[campo].toUpperCase();
    if (!REGEX_UF.test(uf)) setErro(erros, campo, "UF deve conter exatamente 2 letras.");
    else d[campo] = uf;
  }

  // números de registro
  for (const campo of ["numero_crm", "numero_coren"]) {
    if (vazio(d[campo])) continue; // vazio: "Informe..." sai da regra cruzada
    if (!/^\d+$/.test(d[campo])) setErro(erros, campo, "Número do registro deve conter apenas dígitos.");
  }

  // especialidade
  if (!vazio(d.especialidade)) {
    checarTamanho(erros, "especialidade", d.especialidade, { max: 100 });
    if (tam(d.especialidade) < 2) setErro(erros, "especialidade", "Especialidade inválida.");
  }

  // senha
  if (!vazio(d.senha)) {
    const r = validarSenha(d.senha);
    if (!r.valida) setErro(erros, "senha", r.mensagem);
  } else d.senha = null;
}

function validaCruzada(d, erros, { exigeAdminOuPapel }) {
  const g = (msg) => setErro(erros, CAMPO_GERAL, msg);

  // Diferença proposital em relação ao back: campo obrigatório ausente é
  // pintado no próprio input (o back devolve tudo em _geral).
  if (d.tipo_papel === "medico") {
    if (!d.numero_crm) setErro(erros, "numero_crm", "Informe o CRM.");
    if (!d.uf_crm) setErro(erros, "uf_crm", "Informe a UF.");
    if (d.senha && !d.is_admin) {
      g("Médicos não devem informar 'senha' no cadastro; o acesso é definido em um fluxo de ativação de conta separado.");
    }
  } else if (d.tipo_papel === "enfermeiro") {
    if (!d.numero_coren) setErro(erros, "numero_coren", "Informe o COREN.");
    if (!d.uf_coren) setErro(erros, "uf_coren", "Informe a UF.");
    if (!d.especialidade) setErro(erros, "especialidade", "Informe a especialidade.");
    if (d.senha && !d.is_admin) {
      g("Enfermeiros não devem informar 'senha' no cadastro; o acesso é definido em um fluxo de ativação de conta separado.");
    }
  } else {
    const indevidos = ["numero_crm", "uf_crm", "numero_coren", "uf_coren", "especialidade"].filter((c) => d[c]);
    if (indevidos.length) {
      g(`Sem 'tipo_papel' definido, não deve informar: ${indevidos.map((c) => c.replace("_", "-")).join(", ")}.`);
    }
  }

  if (exigeAdminOuPapel && !d.is_admin && !d.tipo_papel) {
    g("Usuário sem 'is_admin' precisa ter 'tipo_papel' definido ('medico' ou 'enfermeiro') — todo usuário precisa ser administrador ou ter uma função clínica.");
  }
}

function prepara(payload) {
  const d = Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, strip(v)]));
  normalizaAliases(d);
  return d;
}

/** POST /usuarios */
export function validarCadastroUsuario(payload) {
  const erros = {};
  const d = prepara(payload);
  checarCamposExtras(d, CAMPOS, erros);
  d.is_admin ??= false;
  validaCampos(d, erros, { atualizacao: false });
  validaCruzada(d, erros, { exigeAdminOuPapel: true });
  return resultado(d, erros);
}

/** PUT/PATCH /usuarios/:id (parcial; a invariante admin-ou-papel fica no service) */
export function validarAtualizacaoUsuario(payload) {
  const erros = {};
  const d = prepara(payload);
  checarCamposExtras(d, CAMPOS, erros);
  validaCampos(d, erros, { atualizacao: true });
  validaCruzada(d, erros, { exigeAdminOuPapel: false });
  return resultado(d, erros);
}

/** PUT /usuarios/senha */
export function validarAlterarSenha(payload) {
  const erros = {};
  checarCamposExtras(payload, new Set(["senha_nova"]), erros);
  const r = validarSenha(payload.senha_nova);
  if (!r.valida) setErro(erros, "senha_nova", r.mensagem);
  return resultado({ senha_nova: payload.senha_nova }, erros);
}

/** Exemplo do "só certo/errado": o usuário tem papel de administrador? */
export function validarAdministrador(dados) {
  return dados?.is_admin === true;
}