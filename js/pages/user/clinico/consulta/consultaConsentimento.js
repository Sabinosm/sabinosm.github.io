// consultaConsentimento.js
//
// Consentimento LGPD na página de detalhe da consulta.
//
// Hoje: dispensa por emergência
//   POST /consultas/<uuid>/consentimento/dispensar   corpo: { motivo }
//   (LGPD art. 11, II, "f": vale só para esta consulta e fica registrada
//   com o motivo; o back confere o início da consulta em situacao()).
//
// Próxima etapa: coleta do termo por QR code (botão #cons-btn-coletar-termo,
// por enquanto desabilitado em consultaDetalhe.html). Quando for feita,
// entra neste módulo.
//
// Este módulo se liga sozinho no DOMContentLoaded e lê o uuid da URL. Em
// caso de sucesso dispara EVENTO_CONSULTA_ALTERADA; quem recarrega a
// tela é consultaDetalhe.js.

import { ApiError, dispensarConsentimento } from "./consultaApi.js";
import {
  CLASSE_OVERLAY_VISIVEL, EVENTO_CONSULTA_ALTERADA, exibirAviso, uuidDaUrl,
} from "./consultaHelpers.js";

const MAX_MOTIVO = 2000;

const $ = (id) => document.getElementById(id);

let enviando = false;

document.addEventListener("DOMContentLoaded", () => {
  $("cons-btn-dispensar")?.addEventListener("click", abrirModal);
  $("cons-disp-close")?.addEventListener("click", fecharModal);
  $("cons-disp-cancel")?.addEventListener("click", fecharModal);
  $("cons-disp-overlay")?.addEventListener("click", (e) => {
    if (e.target === $("cons-disp-overlay")) fecharModal();
  });
  $("form-dispensar")?.addEventListener("submit", aoSubmeter);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("cons-disp-overlay")?.classList.contains(CLASSE_OVERLAY_VISIVEL)) fecharModal();
  });
});

function abrirModal() {
  limpar();
  $("cons-disp-overlay").classList.add(CLASSE_OVERLAY_VISIVEL);
  $("cons-disp-motivo")?.focus();
}

function fecharModal() {
  $("cons-disp-overlay")?.classList.remove(CLASSE_OVERLAY_VISIVEL);
  limpar();
}

function limpar() {
  $("form-dispensar")?.reset();
  limparErroMotivo();
  feedback("", "");
  enviando = false;
  const salvar = $("cons-disp-save");
  if (salvar) salvar.disabled = false;
}

async function aoSubmeter(e) {
  e.preventDefault();
  if (enviando) return;

  limparErroMotivo();
  feedback("", "");

  const motivo = $("cons-disp-motivo").value.trim();
  if (!motivo) return erroMotivo("Informe o motivo da dispensa.");
  if ([...motivo].length > MAX_MOTIVO) return erroMotivo(`O motivo deve ter no máximo ${MAX_MOTIVO} caracteres.`);

  enviando = true;
  $("cons-disp-save").disabled = true;

  try {
    await dispensarConsentimento(uuidDaUrl(), { motivo });
    fecharModal();
    exibirAviso("Consentimento dispensado por emergência.", "sucesso");
    document.dispatchEvent(new CustomEvent(EVENTO_CONSULTA_ALTERADA));
  } catch (erro) {
    const texto = erro instanceof ApiError ? erro.message : "Não foi possível registrar a dispensa.";
    // erro de campo estruturado, se o back mandar
    if (erro instanceof ApiError && erro.erros?.motivo) erroMotivo(erro.erros.motivo);
    else feedback(texto, "erro");
    enviando = false;
    $("cons-disp-save").disabled = false;
  }
}

// ---------------------------------------------------------------- feedback
function erroMotivo(msg) {
  $("cons-disp-motivo")?.closest(".field-group")?.classList.add("field-group--has-error");
  $("cons-disp-motivo")?.classList.add("field-input--invalid");
  $("cons-disp-motivo-error").textContent = msg;
}

function limparErroMotivo() {
  $("cons-disp-motivo")?.closest(".field-group")?.classList.remove("field-group--has-error");
  $("cons-disp-motivo")?.classList.remove("field-input--invalid");
  const el = $("cons-disp-motivo-error");
  if (el) el.textContent = "";
}

function feedback(texto, tipo) {
  const el = $("cons-disp-feedback");
  if (!el) return;
  el.textContent = texto;
  el.className = tipo ? `cons-form-feedback ${tipo}` : "cons-form-feedback";
}