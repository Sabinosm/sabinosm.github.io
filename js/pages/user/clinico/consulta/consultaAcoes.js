// consultaAcoes.js
//
// Ações que encerram a consulta, na página de detalhe:
//   encerrar -> POST /consultas/<uuid>/encerrar   { desfecho_final, justificativa? }
//   evadir   -> POST /consultas/<uuid>/evadir     { justificativa? }
//
// Diferença entre as duas (regra do service):
//   - encerrar BLOQUEIA (409) se houver Atendimento em andamento;
//   - evadir cancela os Atendimentos em andamento e encerra com desfecho
//     "evasao". Por isso "evasao" não aparece no select de encerrar.
//
// As duas rotas usam acesso_auditado no back: só registram a ação, sem
// step-up. Validação no front: validarEncerramentoConsulta e
// validarEvasaoConsulta (espelho dos schemas do back; o back decide).
//
// Se o 409 do encerrar vier por causa de atendimento em andamento, a
// mensagem do back já explica; o modal só a mostra e deixa o caminho
// da evasão visível na própria página.
//
// Em caso de sucesso dispara EVENTO_CONSULTA_ALTERADA; quem recarrega a
// tela é consultaDetalhe.js.

import { ApiError, encerrarConsulta, evadirConsulta } from "./consultaApi.js";
import { validarEncerramentoConsulta, validarEvasaoConsulta } from "./consultaValidation.js";
import { CAMPO_GERAL } from "../../../../sharedConfig/validacoes/generalValidation.js";
import {
  CLASSE_OVERLAY_VISIVEL, EVENTO_CONSULTA_ALTERADA, exibirAviso, uuidDaUrl,
} from "./consultaHelpers.js";

const $ = (id) => document.getElementById(id);

// Configuração por modal: ids, validação, chamada e mensagem de sucesso.
const MODAIS = {
  encerrar: {
    prefixo: "cons-enc",
    abrirCom: "cons-btn-encerrar",
    form: "form-encerrar",
    campos: { desfecho_final: "cons-enc-desfecho", justificativa: "cons-enc-justificativa" },
    montar: () => {
      const payload = { desfecho_final: $("cons-enc-desfecho").value };
      const justificativa = $("cons-enc-justificativa").value.trim();
      if (justificativa) payload.justificativa = justificativa;
      return payload;
    },
    validar: validarEncerramentoConsulta,
    enviar: encerrarConsulta,
    sucesso: "Consulta encerrada.",
  },
  evadir: {
    prefixo: "cons-eva",
    abrirCom: "cons-btn-evadir",
    form: "form-evadir",
    campos: { justificativa: "cons-eva-justificativa" },
    montar: () => {
      const justificativa = $("cons-eva-justificativa").value.trim();
      return justificativa ? { justificativa } : {};
    },
    validar: validarEvasaoConsulta,
    enviar: (uuid, payload) => evadirConsulta(uuid, payload),
    sucesso: "Evasão registrada; atendimentos em andamento cancelados.",
  },
};

const enviando = { encerrar: false, evadir: false };

document.addEventListener("DOMContentLoaded", () => {
  Object.entries(MODAIS).forEach(([chave, m]) => {
    $(m.abrirCom)?.addEventListener("click", () => abrir(chave));
    $(`${m.prefixo}-close`)?.addEventListener("click", () => fechar(chave));
    $(`${m.prefixo}-cancel`)?.addEventListener("click", () => fechar(chave));
    $(`${m.prefixo}-overlay`)?.addEventListener("click", (e) => {
      if (e.target === $(`${m.prefixo}-overlay`)) fechar(chave);
    });
    $(m.form)?.addEventListener("submit", (e) => aoSubmeter(e, chave));
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    Object.keys(MODAIS).forEach((chave) => {
      if ($(`${MODAIS[chave].prefixo}-overlay`)?.classList.contains(CLASSE_OVERLAY_VISIVEL)) fechar(chave);
    });
  });
});

// ============================================
// Abrir / fechar
// ============================================
function abrir(chave) {
  limpar(chave);
  const m = MODAIS[chave];
  $(`${m.prefixo}-overlay`).classList.add(CLASSE_OVERLAY_VISIVEL);
  const primeiro = $(Object.values(m.campos)[0]);
  primeiro?.focus();
}

function fechar(chave) {
  const m = MODAIS[chave];
  $(`${m.prefixo}-overlay`)?.classList.remove(CLASSE_OVERLAY_VISIVEL);
  limpar(chave);
}

function limpar(chave) {
  const m = MODAIS[chave];
  $(m.form)?.reset();
  limparErros(chave);
  feedback(chave, "", "");
  enviando[chave] = false;
  const salvar = $(`${m.prefixo}-save`);
  if (salvar) salvar.disabled = false;
}

// ============================================
// Envio
// ============================================
async function aoSubmeter(e, chave) {
  e.preventDefault();
  if (enviando[chave]) return;

  const m = MODAIS[chave];
  limparErros(chave);
  feedback(chave, "", "");

  const validacao = m.validar(m.montar());
  if (!validacao.ok) {
    exibirErros(chave, validacao.erros);
    return;
  }

  enviando[chave] = true;
  $(`${m.prefixo}-save`).disabled = true;

  try {
    await m.enviar(uuidDaUrl(), validacao.dados);
    fechar(chave);
    exibirAviso(m.sucesso, "sucesso");
    document.dispatchEvent(new CustomEvent(EVENTO_CONSULTA_ALTERADA));
  } catch (erro) {
    if (erro instanceof ApiError && erro.erros && Object.keys(erro.erros).length > 0) {
      exibirErros(chave, erro.erros);
    } else {
      feedback(chave, erro instanceof ApiError ? erro.message : "Não foi possível concluir a ação.", "erro");
    }
    enviando[chave] = false;
    $(`${m.prefixo}-save`).disabled = false;
  }
}

// ============================================
// Erros e feedback
// ============================================

/** Erros por campo do schema; "_geral" e campos sem input vão para a mensagem do topo do modal. */
function exibirErros(chave, erros) {
  const m = MODAIS[chave];
  const gerais = [];

  Object.entries(erros).forEach(([campo, msg]) => {
    const id = campo === CAMPO_GERAL ? null : m.campos[campo];
    if (id && $(id)) {
      $(id).closest(".field-group")?.classList.add("field-group--has-error");
      $(id).classList.add("field-input--invalid");
      const el = $(`${id}-error`);
      if (el) el.textContent = msg;
    } else {
      gerais.push(campo === CAMPO_GERAL ? msg : `${campo}: ${msg}`);
    }
  });

  if (gerais.length > 0) feedback(chave, gerais.join(" "), "erro");
}

function limparErros(chave) {
  Object.values(MODAIS[chave].campos).forEach((id) => {
    $(id)?.closest(".field-group")?.classList.remove("field-group--has-error");
    $(id)?.classList.remove("field-input--invalid");
    const el = $(`${id}-error`);
    if (el) el.textContent = "";
  });
}

function feedback(chave, texto, tipo) {
  const el = $(`${MODAIS[chave].prefixo}-feedback`);
  if (!el) return;
  el.textContent = texto;
  el.className = tipo ? `cons-form-feedback ${tipo}` : "cons-form-feedback";
}