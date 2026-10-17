// consultaIdentificar.js
//
// Identificação de paciente de emergência na página de detalhe da consulta:
//   POST /pacientes/pessoal/<uuid_paciente>/identificar   (mesmo corpo do cadastro)
//
// Completa o MESMO registro de Paciente criado na emergência: o histórico de
// consulta, consentimento e atendimento já gravado continua nele (nada de
// segundo cadastro). Regras do back que aparecem aqui como erro:
//   - paciente já identificado, ou com óbito registrado -> 409;
//   - CPF já cadastrado nesta empresa -> 409 (não há unificação de cadastros
//     neste fluxo).
//
// O botão #cons-btn-identificar carrega o uuid do paciente em
// data-paciente-uuid (preenchido por consultaDetalhe.js), e o painel só
// aparece para paciente não identificado.
//
// Em caso de sucesso dispara EVENTO_CONSULTA_ALTERADA: a página recarrega, o
// nome passa a aparecer no título e a coleta do termo é liberada.

import { ApiError, identificarPaciente } from "./consultaApi.js";
import { lerPacienteForm, mapearErrosPaciente } from "./consultaPacienteForm.js";
import { CLASSE_OVERLAY_VISIVEL, EVENTO_CONSULTA_ALTERADA, exibirAviso } from "./consultaHelpers.js";
import { hojeIso } from "../../../../sharedConfig/validacoes/generalValidation.js";

const IDS_CAMPOS = [
  "cons-pac-nome", "cons-pac-sexo", "cons-pac-nascimento",
  "cons-pac-cpf", "cons-pac-telefone", "cons-pac-email",
];

const $ = (id) => document.getElementById(id);

let enviando = false;

document.addEventListener("DOMContentLoaded", () => {
  $("cons-pac-nascimento")?.setAttribute("max", hojeIso());

  $("cons-btn-identificar")?.addEventListener("click", abrirModal);
  $("cons-ident-close")?.addEventListener("click", fecharModal);
  $("cons-ident-cancel")?.addEventListener("click", fecharModal);
  $("cons-ident-overlay")?.addEventListener("click", (e) => {
    if (e.target === $("cons-ident-overlay")) fecharModal();
  });
  $("form-identificar")?.addEventListener("submit", aoSubmeter);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("cons-ident-overlay")?.classList.contains(CLASSE_OVERLAY_VISIVEL)) fecharModal();
  });
});

function abrirModal() {
  limpar();
  $("cons-ident-overlay").classList.add(CLASSE_OVERLAY_VISIVEL);
  $("cons-pac-nome")?.focus();
}

function fecharModal() {
  $("cons-ident-overlay")?.classList.remove(CLASSE_OVERLAY_VISIVEL);
  limpar();
}

function limpar() {
  $("form-identificar")?.reset();
  limparErros();
  feedback("", "");
  enviando = false;
  const salvar = $("cons-ident-save");
  if (salvar) salvar.disabled = false;
}

async function aoSubmeter(e) {
  e.preventDefault();
  if (enviando) return;

  limparErros();
  feedback("", "");

  const { paciente, erros } = lerPacienteForm();
  if (Object.keys(erros).length > 0) {
    Object.entries(erros).forEach(([id, msg]) => erroCampo(id, msg));
    return;
  }

  const uuidPaciente = $("cons-btn-identificar")?.dataset.pacienteUuid;
  if (!uuidPaciente) {
    feedback("Paciente da consulta não identificado na tela. Recarregue a página.", "erro");
    return;
  }

  enviando = true;
  $("cons-ident-save").disabled = true;

  try {
    await identificarPaciente(uuidPaciente, paciente);
    fecharModal();
    exibirAviso("Paciente identificado.", "sucesso");
    document.dispatchEvent(new CustomEvent(EVENTO_CONSULTA_ALTERADA));
  } catch (erro) {
    tratarErro(erro);
    enviando = false;
    $("cons-ident-save").disabled = false;
  }
}

function tratarErro(erro) {
  if (!(erro instanceof ApiError)) {
    feedback("Não foi possível identificar o paciente.", "erro");
    return;
  }

  // CPF já cadastrado: o erro é do campo
  if (erro.status === 409 && /\bCPF\b/.test(erro.message)) {
    erroCampo("cons-pac-cpf", erro.message);
    return;
  }

  const { porId, residual } = mapearErrosPaciente({ erros: erro.erros, mensagem: erro.message });
  Object.entries(porId).forEach(([id, msg]) => erroCampo(id, msg));

  if (residual) feedback(residual, "erro");
  else if (Object.keys(porId).length === 0) feedback(erro.message, "erro");
}

// ---------------------------------------------------------------- feedback
function erroCampo(id, msg) {
  $(id)?.closest(".field-group")?.classList.add("field-group--has-error");
  $(id)?.classList.add("field-input--invalid");
  const el = $(`${id}-error`);
  if (el) el.textContent = msg;
}

function limparErros() {
  IDS_CAMPOS.forEach((id) => {
    $(id)?.closest(".field-group")?.classList.remove("field-group--has-error");
    $(id)?.classList.remove("field-input--invalid");
    const el = $(`${id}-error`);
    if (el) el.textContent = "";
  });
}

function feedback(texto, tipo) {
  const el = $("cons-ident-feedback");
  if (!el) return;
  el.textContent = texto;
  el.className = tipo ? `cons-form-feedback ${tipo}` : "cons-form-feedback";
}