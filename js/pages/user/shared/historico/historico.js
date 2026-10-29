// historico.js
//
// Entry point da página de Histórico de consultas (historico.html).
//
//   historicoApi.js      -> GET /consultas/historico e /atendimentos/consulta/<uuid>
//   historicoHelpers.js  -> rótulos, regras de botão, links
//   historicoLista.js    -> estado, carga paginada ("Carregar mais"), busca por nome no cliente
//   historicoCard.js     -> card da consulta + linha do tempo dos atendimentos + PDFs
//   shared/downloadPdf.js-> download dos PDFs (consulta e atendimento)
//
// Escopo (back): consultas que o profissional INICIOU ou em que ATENDEU. Acesso: médico ou
// enfermeiro (data-requer="atenderClinicamente" no <body>).

import { iniciarPagina } from "../../../../sharedConfig/loaders/initPagina.js";
import { exibirMensagem } from "../../../../shared/feedback.js";
import { definirBusca, definirFiltros, iniciarLista } from "./historicoLista.js";

const $ = (id) => document.getElementById(id);

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Lê os controles; null quando o período é inválido (o back também devolveria 422). */
function lerFiltros() {
  const dataInicio = $("hist-filtro-inicio").value || undefined;
  const dataFim = $("hist-filtro-fim").value || undefined;
  if (dataInicio && dataFim && dataFim < dataInicio) {
    exibirMensagem("A data final não pode ser anterior à inicial.", "erro");
    return null;
  }
  return {
    status: $("hist-filtro-status").value || undefined,
    desfecho: $("hist-filtro-desfecho").value || undefined,
    abertas: $("hist-filtro-abertas").value === "true",
    dataInicio,
    dataFim,
  };
}

function aplicar() {
  const filtros = lerFiltros();
  if (filtros) definirFiltros(filtros);
}

function ligarFiltros() {
  const painel = $("hist-filter-panel");
  const toggle = $("hist-btn-toggle-filtros");
  toggle.addEventListener("click", () => {
    // mesmas classes de consultaLista.js
    const abrir = !painel.classList.contains("filter-panel--visible");
    painel.classList.toggle("filter-panel--visible", abrir);
    toggle.classList.toggle("btn-filter--active", abrir);
    toggle.setAttribute("aria-expanded", String(abrir));
  });

  ["hist-filtro-status", "hist-filtro-desfecho", "hist-filtro-abertas", "hist-filtro-inicio", "hist-filtro-fim"]
    .forEach((id) => $(id).addEventListener("change", aplicar));

  $("hist-btn-limpar-filtros").addEventListener("click", () => {
    ["hist-filtro-status", "hist-filtro-desfecho", "hist-filtro-abertas", "hist-filtro-inicio", "hist-filtro-fim"]
      .forEach((id) => { $(id).value = ""; });
    aplicar();
  });

  $("hist-busca").addEventListener("input", debounce((e) => definirBusca(e.target.value), 200));
}

document.addEventListener("DOMContentLoaded", async () => {
  await iniciarPagina();
  iniciarLista($("hist-lista"), $("hist-mais"));
  ligarFiltros();
  aplicar();
});