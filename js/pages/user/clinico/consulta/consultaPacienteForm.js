// consultaPacienteForm.js
//
// Formulário de dados do paciente, compartilhado por:
//   - aba "Novo paciente" do modal de nova consulta (consultaNova.js);
//   - modal "Identificar paciente" da página de detalhe (consultaIdentificar.js).
// As duas telas usam os MESMOS ids de input (cons-pac-*), em páginas diferentes.
//
// Espelha PacienteCriarSchema (schema_paciente.py), que também é o corpo de
// POST /pacientes/pessoal/<uuid>/identificar ("mesmo corpo de cadastrar").
// Obrigatórios: sexo_biologico, data_nascimento, nome_completo, cpf.
// Opcionais aqui: telefone e e-mail. Endereço, RG e contato de emergência
// ficam para depois (PUT /pacientes/pessoal/<uuid>).
// O back é a verdade; isto só evita ida e volta por erro óbvio.

import {
  dataFutura, dataIsoValida, limparDigitos, tam,
  validarCpf, validarEmail, validarTelefoneBr,
} from "../../../../sharedConfig/validacoes/generalValidation.js";

/** Campo do schema do back -> id do input. */
export const CAMPOS_PACIENTE = {
  nome_completo: "cons-pac-nome",
  cpf: "cons-pac-cpf",
  telefone: "cons-pac-telefone",
  email: "cons-pac-email",
  sexo_biologico: "cons-pac-sexo",
  data_nascimento: "cons-pac-nascimento",
};

const $ = (id) => document.getElementById(id);

/**
 * Lê e valida os campos do formulário.
 * @returns {{ paciente: object, erros: Record<string,string> }} `erros` indexado por id de input.
 */
export function lerPacienteForm() {
  const erros = {};
  const paciente = {};

  const nome = $("cons-pac-nome").value.trim();
  const sexo = $("cons-pac-sexo").value;
  const nascimento = $("cons-pac-nascimento").value;
  const cpf = $("cons-pac-cpf").value.trim();
  const telefone = $("cons-pac-telefone").value.trim();
  const email = $("cons-pac-email").value.trim();

  if (!nome) erros["cons-pac-nome"] = "Informe o nome completo.";
  else if (nome.split(/\s+/).length < 2 || tam(nome) < 3) erros["cons-pac-nome"] = "Informe nome e sobrenome.";
  else paciente.nome_completo = nome;

  if (!sexo) erros["cons-pac-sexo"] = "Selecione o sexo biológico.";
  else paciente.sexo_biologico = sexo;

  if (!nascimento) erros["cons-pac-nascimento"] = "Informe a data de nascimento.";
  else if (!dataIsoValida(nascimento)) erros["cons-pac-nascimento"] = "Data de nascimento inválida.";
  else if (dataFutura(nascimento)) erros["cons-pac-nascimento"] = "A data de nascimento não pode ser futura.";
  else paciente.data_nascimento = nascimento;

  if (!cpf) erros["cons-pac-cpf"] = "Informe o CPF.";
  else if (!validarCpf(cpf)) erros["cons-pac-cpf"] = "O CPF está incorreto.";
  else paciente.cpf = limparDigitos(cpf);

  if (telefone) {
    if (!validarTelefoneBr(telefone)) erros["cons-pac-telefone"] = "Telefone com formato inválido.";
    else paciente.telefone = limparDigitos(telefone);
  }

  if (email) {
    if (!validarEmail(email)) erros["cons-pac-email"] = "E-mail inválido.";
    else paciente.email = email.toLowerCase();
  }

  return { paciente, erros };
}

/**
 * Erros do back para ids de input. Aceita o objeto `erros` ({campo: msg}, com
 * ou sem prefixo "paciente.") ou o texto "campo: msg; campo2: msg2" que o
 * DadosInvalidosError do service devolve. O que não casar com um input volta
 * em `residual` (para a mensagem do topo do modal).
 */
export function mapearErrosPaciente({ erros, mensagem } = {}) {
  const porId = {};
  const restantes = [];

  const registrar = (campo, msg) => {
    const chave = String(campo).split(".").pop();
    const id = CAMPOS_PACIENTE[chave];
    if (id) porId[id] = msg;
    else restantes.push(campo === "_geral" ? msg : `${campo}: ${msg}`);
  };

  if (erros && Object.keys(erros).length > 0) {
    Object.entries(erros).forEach(([campo, msg]) => registrar(campo, msg));
  } else {
    String(mensagem ?? "").split(";").forEach((parte) => {
      const trecho = parte.trim();
      if (!trecho) return;
      const i = trecho.indexOf(":");
      if (i === -1) restantes.push(trecho);
      else registrar(trecho.slice(0, i).trim(), trecho.slice(i + 1).trim());
    });
  }

  return { porId, residual: restantes.join(" ") };
}