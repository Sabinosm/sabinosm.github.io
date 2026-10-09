// pacientesCriacaoValidacoes.js  (SUBSTITUI o arquivo antigo)
//
// Validação do formulário de criação de paciente (POST /pacientes/pessoal/).
// Sem regras próprias: traduz os campos da tela (pac-*) para o payload do
// back e delega a validarCriarPaciente (espelho de PacienteCriarSchema).
// Depois traduz os erros de volta para os ids do formulário.
//
// Contrato mantido (pacientesCriacao.js não precisa mudar a chamada):
//   validarEssencial(campos) -> { payload, erros: { 'pac-...': mensagem } }

import { validarCriarPaciente } from "../../../../sharedConfig/validacoes/pacienteValidation.js";
import { setErro } from "../../../../sharedConfig/validacoes/generalValidation.js";

// campo do schema (back) -> id do input
const CAMPO_PARA_ID = {
  nome_completo: "pac-nome",
  cpf: "pac-cpf",
  telefone: "pac-telefone",
  sexo_biologico: "pac-sexo",
  data_nascimento: "pac-nascimento",
  email: "pac-email",
  rg: "pac-rg",
  logradouro: "pac-logradouro",
  numero_residencia: "pac-numero",
  cep: "pac-cep",
  bairro: "pac-bairro",
  contato_emergencia_nome: "pac-emergencia-nome",
  contato_emergencia_telefone: "pac-emergencia-telefone",
  tipo_sanguineo: "pac-tipo-sanguineo",
  data_primeiro_atendimento: "pac-primeiro-atendimento",
};

/** Todos os ids com mensagem de erro possível (use para limpar a tela inteira). */
export const IDS_CAMPOS_PACIENTE = Object.values(CAMPO_PARA_ID);

/** Erros estruturados do back { campo: msg } -> { erros: {pac-id: msg}, residual }. */
export function mapearErrosPorCampoPaciente(porCampo) {
  const erros = {};
  const sobra = [];
  for (const [campo, msg] of Object.entries(porCampo || {})) {
    const id = CAMPO_PARA_ID[campo.replace(/-/g, "_")];
    if (id) setErro(erros, id, String(msg));
    else sobra.push(campo === "_geral" ? String(msg) : `${campo}: ${msg}`);
  }
  return { erros, residual: sobra.join("; ") };
}

/**
 * @param {object} campos - valores brutos lidos por lerCamposEssencial()
 * @returns {{ payload: object, erros: Record<string,string> }}
 */
export function validarEssencial(campos) {
  // campos da tela -> payload do back (vazio = chave ausente)
  const entrada = {};
  const put = (chave, valor) => {
    const v = typeof valor === "string" ? valor.trim() : valor;
    if (v) entrada[chave] = v;
  };
  put("nome_completo", campos.nome);
  put("cpf", campos.cpf);
  put("telefone", campos.telefone);
  put("sexo_biologico", campos.sexoBiologico);
  put("data_nascimento", campos.dataNascimento);
  put("email", campos.email);
  put("rg", campos.rg);
  put("logradouro", campos.logradouro);
  put("numero_residencia", campos.numeroResidencia);
  put("cep", campos.cep);
  put("bairro", campos.bairro);
  put("contato_emergencia_nome", campos.contatoEmergenciaNome);
  put("contato_emergencia_telefone", campos.contatoEmergenciaTelefone);
  put("tipo_sanguineo", campos.tipoSanguineo);
  put("data_primeiro_atendimento", campos.dataPrimeiroAtendimento);

  const resultado = validarCriarPaciente(entrada);
  const { erros, residual } = mapearErrosPorCampoPaciente(resultado.erros);

  // Sem campo próprio na tela: cai no nome, o primeiro input do formulário.
  if (residual) setErro(erros, "pac-nome", residual);

  // `dados` é nulo quando há erro; nesse caso o payload não é usado.
  return { payload: resultado.dados ?? entrada, erros };
}