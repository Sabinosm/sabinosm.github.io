// consultaConsentimento.js
//
// Consentimento LGPD na página de detalhe da consulta.
//
// Hoje: dispensa por emergência
//   POST /consultas/<uuid>/consentimento/dispensar   corpo: { motivo }
//   (LGPD art. 11, II, "f": vale só para esta consulta e fica registrada
//   com o motivo; o back confere o início da consulta em situacao()).
//
// A coleta do termo por QR code (botão #cons-btn-coletar-termo) fica em
// consultaAssinatura.js.
//
// Este módulo se liga sozinho no DOMContentLoaded e lê o uuid da URL. Em
// caso de sucesso dispara EVENTO_CONSULTA_ALTERADA; quem recarrega a
// tela é consultaDetalhe.js.

import { exibirMensagem } from "/js/shared/feedback.js";
import { ApiError, dispensarConsentimento } from "./consultaApi.js";
import {
  CLASSE_OVERLAY_VISIVEL, EVENTO_CONSULTA_ALTERADA, uuidDaUrl,
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
  enviando = false;
  const salvar = $("cons-disp-save");
  if (salvar) salvar.disabled = false;
}

async function aoSubmeter(e) {
  e.preventDefault();
  if (enviando) return;

  limparErroMotivo();

  const motivo = $("cons-disp-motivo").value.trim();
  if (!motivo) return erroMotivo("Informe o motivo da dispensa.");
  if ([...motivo].length > MAX_MOTIVO) return erroMotivo(`O motivo deve ter no máximo ${MAX_MOTIVO} caracteres.`);

  enviando = true;
  $("cons-disp-save").disabled = true;

  try {
    await dispensarConsentimento(uuidDaUrl(), { motivo });
    fecharModal();
    exibirMensagem("Consentimento dispensado por emergência.", "sucesso");
    document.dispatchEvent(new CustomEvent(EVENTO_CONSULTA_ALTERADA));
  } catch (erro) {
    const texto = erro instanceof ApiError ? erro.message : "Não foi possível registrar a dispensa.";
    // erro de campo estruturado, se o back mandar
    if (erro instanceof ApiError && erro.erros?.motivo) erroMotivo(erro.erros.motivo);
    else exibirMensagem(texto, "erro");
    enviando = false;
    $("cons-disp-save").disabled = false;
  }
}

// ---------------------------------------------------------------- erro do campo
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