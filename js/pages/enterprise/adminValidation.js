import { exibirMensagem } from "../../shared/feedback.js";
import { validarCadastroUsuario } from "../../sharedConfig/validacoes/usuarioValidation.js";
import { validarSenha, setErro } from "../../sharedConfig/validacoes/generalValidation.js";
import {
  setError, clearError, temErro, pintarErros, pintarMensagemBackend, ligarCampo,
} from "../../sharedConfig/validacoes/dom_erros.js";

const IDS = [
  "nome_completo", "cpf", "telefone", "email", "user_login", "senha",
  "confirmar_senha", "numero_crm", "uf_crm", "numero_coren", "uf_coren",
  "especialidade",
];

const val = (id) => document.getElementById(id)?.value ?? "";

export function getTipoPapelSelecionado() {
  const marcado = document.querySelector('input[name="tipo_papel"]:checked');
  return marcado && marcado.value ? marcado.value : null; // '' -> null
}

// Só o bloco do tipo_papel selecionado entra no payload (regra cruzada do back).
function lerPayload() {
  const tipo = getTipoPapelSelecionado();
  const d = {
    nome_completo: val("nome_completo"),
    cpf: val("cpf"),
    email: val("email"),
    telefone: val("telefone") || null,
    user_login: val("user_login"),
    is_admin: true, // fundador
    tipo_papel: tipo,
    senha: val("senha"),
  };
  if (tipo === "medico") {
    d.numero_crm = val("numero_crm");
    d.uf_crm = val("uf_crm");
    d.rqe = val("rqe") || null;
  } else if (tipo === "enfermeiro") {
    d.numero_coren = val("numero_coren");
    d.uf_coren = val("uf_coren");
    d.especialidade = val("especialidade");
  }
  return d;
}

// { idDoDom: mensagem } (+ _geral)
function avaliar({ submit }) {
  const { erros } = validarCadastroUsuario(lerPayload());

  // Regras só desta tela: o fundador precisa de senha (no back ela é opcional).
  if (!val("senha")) setErro(erros, "senha", validarSenha("").mensagem);

  const senha = val("senha");
  const confirmar = val("confirmar_senha");
  if (!confirmar) {
    if (submit) setErro(erros, "confirmar_senha", "Confirme a senha");
  } else if (confirmar !== senha) {
    setErro(erros, "confirmar_senha", "As senhas não coincidem");
  }
  return erros;
}

function validarUm(id) {
  const erros = avaliar({ submit: false });
  if (erros[id]) setError(id, erros[id]);
  else clearError(id);
  return !erros[id];
}

export function validarFormularioAdmin() {
  const erros = avaliar({ submit: true });
  IDS.forEach((id) => (erros[id] ? setError(id, erros[id]) : clearError(id)));
  if (erros._geral) exibirMensagem(erros._geral, "erro"); // regra cruzada sem campo
  return Object.keys(erros).length === 0;
}

export function ligarValidacaoEmTempoReal() {
  // Valida enquanto digita só se houver texto (ou erro visível); vazio limpa.
  ["nome_completo", "cpf", "telefone", "email", "user_login"].forEach((id) => {
    document.getElementById(id).addEventListener("input", function () {
      if (this.value.trim().length > 0 || temErro(id)) validarUm(id);
      else clearError(id);
    });
  });

  document.getElementById("senha").addEventListener("input", function () {
    if (this.value.length > 0) validarUm("senha");
    else clearError("senha");
    if (val("confirmar_senha")) validarUm("confirmar_senha");
  });
  document.getElementById("confirmar_senha").addEventListener("input", () => {
    if (val("confirmar_senha")) validarUm("confirmar_senha");
    else clearError("confirmar_senha");
  });

  // CRM/COREN existem escondidos no DOM: só revalidam se já houver erro.
  ["numero_crm", "uf_crm", "numero_coren", "uf_coren", "especialidade"]
    .forEach((id) => ligarCampo(id, validarUm));
}

// Erros do back: texto "campo: msg; ..." (plano B) ou objeto { campo: msg }.
export function aplicarErrosBackend(mensagem) {
  return pintarMensagemBackend(mensagem, (c) => c, IDS);
}
export function aplicarErrosPorCampo(erros) {
  return pintarErros(erros, (c) => c, IDS);
}

export { setError, clearError };