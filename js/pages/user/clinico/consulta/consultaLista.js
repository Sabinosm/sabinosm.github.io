// consultaLista.js
//
// Lista de consultas: busca por paciente, filtros e paginação, tudo no
// cliente. GET /consultas/ devolve o array inteiro da empresa (só o
// parâmetro `abertas` é do servidor), então:
//   - "Situação" (abertas/todas/encerradas) é o único filtro que
//     recarrega da API (abertas=true só para "Somente abertas");
//   - busca, status e consentimento filtram o que já foi carregado;
//   - a paginação é do cliente (POR_PAGINA itens por página).
// Quando os filtros forem definidos de vez, o ideal é levar paginação
// e filtros para o backend (o histórico de encerradas só cresce).
//
// Item esperado (Consulta.to_dict + dois campos propostos para a lista):
//   { uuid, origem_encaminhamento, status_consulta, data_hora_inicio,
//     data_hora_fim, desfecho_final, paciente_uuid,
//     paciente?:      { uuid, nome, nao_identificado, anonimizado },
//     consentimento?: "pendente" | "ativo" | "dispensado_emergencia" }
// Sem `paciente`/`consentimento` a tela ainda funciona (nome vira o uuid
// curto e o badge de consentimento não aparece), mas fica pobre.
//
// O modal de nova consulta vive em consultaNova.js, que chama de volta
// recarregarLista (exportada daqui).

import { exibirMensagem } from "/js/shared/feedback.js";
import { ApiError, listarConsultas } from "./consultaApi.js";
import {
  DESFECHO_LABELS, ORIGEM_LABELS,
  criarBadgeConsentimento, criarChipStatus, criarEstadoVazio,
  formatarDataHora, label, nomePaciente, normalizarTexto, urlDetalhe,
} from "./consultaHelpers.js";

const POR_PAGINA = 8;

let todas = [];            // resposta da API para a situação atual
let paginaAtual = 1;       // 1-indexado (paginação do cliente)
let filtros = { busca: "", situacao: "abertas", status: "", consentimento: "" };
let carregando = false;
let recarregarPendente = false; // um filtro de servidor mudou durante um carregamento

document.addEventListener("DOMContentLoaded", () => {
  configurarBusca();
  configurarFiltros();
  carregar();
});

/** Recarrega da API mantendo filtros e página (chamada por consultaNova.js). */
export function recarregarLista() {
  return carregar();
}

// ============================================
// Busca e filtros
// ============================================
function configurarBusca() {
  const input = document.getElementById("cons-busca");
  input?.addEventListener("input", () => {
    filtros.busca = input.value;
    paginaAtual = 1;
    renderizar();
  });
}

function configurarFiltros() {
  const btn = document.getElementById("cons-btn-toggle-filtros");
  const painel = document.getElementById("cons-filter-panel");
  if (!btn || !painel) return;

  btn.addEventListener("click", () => {
    const abrir = !painel.classList.contains("filter-panel--visible");
    painel.classList.toggle("filter-panel--visible", abrir);
    btn.classList.toggle("btn-filter--active", abrir);
  });

  const selSituacao = document.getElementById("cons-filtro-situacao");
  const selStatus = document.getElementById("cons-filtro-status");
  const selConsent = document.getElementById("cons-filtro-consentimento");

  // Situação muda o que o servidor devolve (abertas=true ou não); os
  // outros dois só refiltram o que já está carregado.
  selSituacao?.addEventListener("change", () => {
    const eraAbertas = filtros.situacao === "abertas";
    filtros.situacao = selSituacao.value;
    paginaAtual = 1;
    if (eraAbertas !== (filtros.situacao === "abertas")) carregar();
    else renderizar();
  });

  selStatus?.addEventListener("change", () => {
    filtros.status = selStatus.value;
    paginaAtual = 1;
    renderizar();
  });

  selConsent?.addEventListener("change", () => {
    filtros.consentimento = selConsent.value;
    paginaAtual = 1;
    renderizar();
  });

  document.getElementById("cons-btn-limpar-filtros")?.addEventListener("click", () => {
    const eraAbertas = filtros.situacao === "abertas";
    painel.querySelectorAll("select").forEach((s) => { s.selectedIndex = 0; }); // 1ª opção = padrão
    const busca = document.getElementById("cons-busca");
    if (busca) busca.value = "";
    filtros = { busca: "", situacao: "abertas", status: "", consentimento: "" };
    paginaAtual = 1;
    if (!eraAbertas) carregar();
    else renderizar();
  });
}

function filtradas() {
  const termo = normalizarTexto(filtros.busca);
  return todas.filter((c) => {
    if (filtros.situacao === "encerradas" && c.status_consulta !== "encerrada") return false;
    if (filtros.status && c.status_consulta !== filtros.status) return false;
    if (filtros.consentimento && c.consentimento !== filtros.consentimento) return false;
    if (termo && !normalizarTexto(nomePaciente(c).texto).includes(termo)) return false;
    return true;
  });
}

// ============================================
// Dados
// ============================================
async function carregar() {
  if (carregando) {
    recarregarPendente = true;
    return;
  }
  carregando = true;

  const container = document.getElementById("cons-lista");
  if (container) {
    container.innerHTML = '<p class="empty-state-text" style="padding: 24px 0;">Carregando consultas…</p>';
  }

  try {
    const resposta = await listarConsultas({ abertas: filtros.situacao === "abertas" });
    todas = Array.isArray(resposta.data) ? resposta.data : [];
  } catch (erro) {
    todas = [];
    exibirMensagem(erro instanceof ApiError ? erro.message : "Não foi possível carregar as consultas.", "erro");
  } finally {
    carregando = false;
  }

  if (recarregarPendente) {
    recarregarPendente = false;
    return carregar();
  }
  renderizar();
}

// ============================================
// Renderização
// ============================================
function renderizar() {
  const container = document.getElementById("cons-lista");
  if (!container) return;

  const itens = filtradas();
  const totalPaginas = Math.max(1, Math.ceil(itens.length / POR_PAGINA));
  if (paginaAtual > totalPaginas) paginaAtual = totalPaginas;

  container.innerHTML = "";

  if (itens.length === 0) {
    container.appendChild(criarEstadoVazio(
      "Nenhuma consulta encontrada",
      todas.length === 0
        ? "Ainda não há consultas aqui. Use “Nova consulta” para abrir a primeira."
        : "Tente ajustar a busca ou os filtros.",
    ));
  } else {
    const inicio = (paginaAtual - 1) * POR_PAGINA;
    itens.slice(inicio, inicio + POR_PAGINA).forEach((c) => container.appendChild(criarCard(c)));
  }

  renderizarPaginacao(itens.length, totalPaginas);
}

function criarCard(c) {
  const card = document.createElement("article");
  card.className = "consult-card";

  const main = document.createElement("div");
  main.className = "consult-main";

  const { texto, especial } = nomePaciente(c);
  const nome = document.createElement("h3");
  nome.className = especial ? "consult-patient cons-nome--especial" : "consult-patient";
  nome.textContent = texto;

  const partes = [`Início ${formatarDataHora(c.data_hora_inicio)}`, label(ORIGEM_LABELS, c.origem_encaminhamento)];
  if (c.status_consulta === "encerrada" && c.desfecho_final) {
    partes.push(`Desfecho: ${label(DESFECHO_LABELS, c.desfecho_final)}`);
  }
  const meta = document.createElement("p");
  meta.className = "consult-meta";
  meta.textContent = partes.join(" · ");

  main.append(nome, meta);

  // Consentimento só importa enquanto a consulta está aberta.
  if (c.consentimento && c.status_consulta !== "encerrada") {
    const badges = document.createElement("div");
    badges.className = "cons-badges";
    badges.appendChild(criarBadgeConsentimento(c.consentimento));
    main.appendChild(badges);
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-ghost";
  btn.textContent = "Abrir";
  btn.addEventListener("click", () => { window.location.href = urlDetalhe(c.uuid); });

  card.append(criarChipStatus(c.status_consulta), main, btn);
  return card;
}

// ============================================
// Paginação (do cliente: o total é conhecido)
// ============================================
function renderizarPaginacao(total, totalPaginas) {
  const info = document.getElementById("cons-paginacao-info");
  const controles = document.getElementById("cons-paginacao-controles");
  if (!info || !controles) return;

  controles.innerHTML = "";

  if (total === 0) {
    info.textContent = "Nenhum resultado";
    return;
  }

  info.textContent = `${total} ${total === 1 ? "consulta" : "consultas"} · página ${paginaAtual} de ${totalPaginas}`;
  if (totalPaginas === 1) return;

  controles.appendChild(criarBotaoSeta("Página anterior", "M15 6l-6 6 6 6", paginaAtual <= 1, () => irParaPagina(paginaAtual - 1)));
  controles.appendChild(criarBotaoSeta("Próxima página", "M9 6l6 6-6 6", paginaAtual >= totalPaginas, () => irParaPagina(paginaAtual + 1)));
}

function criarBotaoSeta(rotulo, caminho, desabilitado, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "page-btn";
  btn.setAttribute("aria-label", rotulo);
  btn.disabled = desabilitado;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${caminho}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  btn.addEventListener("click", onClick);
  return btn;
}

function irParaPagina(numero) {
  paginaAtual = numero;
  renderizar();
  document.getElementById("cons-lista")?.scrollIntoView({ block: "start", behavior: "smooth" });
}