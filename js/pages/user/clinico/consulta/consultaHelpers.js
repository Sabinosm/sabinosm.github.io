// consultaHelpers.js
//
// Utilitários puros da tela de Consulta: labels dos enums, formatação
// de data, nome de exibição do paciente, link para o detalhe e builders
// de elementos repetidos. Sem estado de página.

// Página de detalhe da consulta (a criar). Fica numa constante só para
// trocar o caminho em um lugar quando a página existir.
const PAGINA_DETALHE = "./consultaDetalhe.html";

export const STATUS_LABELS = {
  "aguardando-triagem": "Aguardando triagem",
  "em-triagem": "Em triagem",
  "aguardando-medico": "Aguardando médico",
  "em-atendimento": "Em atendimento",
  "em-observacao": "Em observação",
  "encerrada": "Encerrada",
};

export const CONSENTIMENTO_LABELS = {
  pendente: "Consentimento pendente",
  ativo: "Consentimento registrado",
  dispensado_emergencia: "Dispensado (emergência)",
};

export const ORIGEM_LABELS = {
  espontanea: "Espontânea",
  SAMU: "SAMU",
  transferencia: "Transferência",
  regulacao: "Regulação",
};

export const DESFECHO_LABELS = {
  alta: "Alta",
  internacao: "Internação",
  transferencia: "Transferência",
  obito: "Óbito",
  evasao: "Evasão",
};

// Valor desconhecido cai no próprio valor (nunca em branco).
export const label = (mapa, valor) => mapa[valor] ?? valor ?? "—";

/** Link para o detalhe da consulta. `foco` é uma dica para a página de destino (ex: "encerrar"). */
export function urlDetalhe(uuid, foco) {
  const params = new URLSearchParams({ uuid });
  if (foco) params.set("foco", foco);
  return `${PAGINA_DETALHE}?${params.toString()}`;
}

/** O backend serializa em UTC com offset; exibe no fuso do navegador. */
export function formatarDataHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/** Minúsculo e sem acento, para busca textual. */
export function normalizarTexto(texto) {
  return String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/**
 * Nome a exibir no card. `consulta.paciente` ({uuid, nome,
 * nao_identificado, anonimizado}) é o contrato proposto para o
 * to_dict da lista; sem ele, cai no uuid curto em vez de quebrar.
 * `especial` = não é um nome de verdade (estilizado em itálico).
 */
export function nomePaciente(consulta) {
  const p = consulta?.paciente;
  if (p?.nome) return { texto: p.nome, especial: false };
  if (p?.nao_identificado) return { texto: "Paciente não identificado", especial: true };
  if (p?.anonimizado) return { texto: "Paciente anonimizado", especial: true };
  const uuid = consulta?.paciente_uuid;
  return { texto: uuid ? `Paciente ${uuid.slice(0, 8)}` : "Paciente", especial: true };
}

/** Primeiro UUID encontrado num texto (o 409 de consulta duplicada traz o uuid só na mensagem). */
export function extrairUuid(texto) {
  const m = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(texto ?? "");
  return m ? m[0] : null;
}

// ============================================
// Builders de elementos
// ============================================

/** Badge de consentimento (cores em consulta.css: .cons-consent--*). */
export function criarBadgeConsentimento(valor) {
  const span = document.createElement("span");
  span.className = `cons-badge cons-consent--${valor}`;
  span.textContent = label(CONSENTIMENTO_LABELS, valor);
  return span;
}

/** Chip de status da consulta (classes de homePage.css + preferencias.css). */
export function criarChipStatus(status) {
  const chip = document.createElement("div");
  chip.className = `consult-status status--${status}`;
  const dot = document.createElement("span");
  dot.className = "status-dot";
  chip.append(dot, ` ${label(STATUS_LABELS, status)}`);
  return chip;
}

export function criarEstadoVazio(titulo, texto) {
  const div = document.createElement("div");
  div.className = "empty-state";

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("class", "empty-state-icon");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "1.5");
  icon.innerHTML = '<circle cx="11" cy="11" r="7" stroke-linecap="round"/><path d="M21 21l-4.3-4.3" stroke-linecap="round"/>';

  const h = document.createElement("p");
  h.className = "empty-state-title";
  h.textContent = titulo;

  const p = document.createElement("p");
  p.className = "empty-state-text";
  p.textContent = texto;

  div.append(icon, h, p);
  return div;
}