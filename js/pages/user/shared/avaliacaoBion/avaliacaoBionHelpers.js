// avaliacaoBionHelpers.js
//
// Utilitários puros da avaliação por IA (usada pela página de prescrição): estados, labels de erro, formatação.
// Sem fetch e sem DOM além do que vem de atendimentoHelpers (el, gate de escrita).

import { estadoAtendimento, podeEscrever } from "../atendimento/atendimentoHelpers.js";

/** Tipos de atendimento com avaliação por IA / prescrição (o back também exige: avaliacao-medica ou reavaliacao). */
export const TIPOS_COM_AVALIACAO_BION = ["avaliacao-medica", "reavaliacao"];

export const tipoComAvaliacaoBion = (a = estadoAtendimento.atendimento) =>
  Boolean(a) && TIPOS_COM_AVALIACAO_BION.includes(a.tipo_atendimento);

/** Pode pedir avaliação: tipo certo + em andamento + dono (podeEscrever já falha fechado sem dono). */
export const podeAvaliar = () => tipoComAvaliacaoBion() && podeEscrever();

/** Estados da avaliação (máquina de estados simples; hoje usados pelo prescricaoIa.js). */
export const ESTADO = {
  CARREGANDO: "carregando",
  OCIOSO: "ocioso",          // nunca avaliou neste atendimento
  ENVIANDO: "enviando",      // POST em andamento
  PROCESSANDO: "processando",
  DEMORANDO: "demorando",    // polling passou do teto sem desfecho
  CONCLUIDO: "concluido",
  FALHOU: "falhou",
};

/** Valores do back (helpers/status.py). */
export const STATUS_BACK = { PROCESSANDO: "processando", CONCLUIDO: "concluido", FALHOU: "falhou" };

/** erro_codigo -> texto para o médico (o código técnico não aparece na tela). */
export const ERRO_CODIGO_LABELS = {
  ia_indisponivel: "A IA está indisponível no momento. Tente novamente em instantes.",
  resposta_invalida: "A IA não devolveu uma resposta válida. Tente avaliar novamente.",
  registro_proposta: "A IA respondeu, mas o rascunho da conduta não pôde ser gravado. Tente avaliar novamente.",
  fila_indisponivel: "O serviço de avaliação está ocupado. Tente novamente em instantes.",
  expirado: "A avaliação demorou além do limite e foi encerrada. Tente novamente.",
  interno: "Ocorreu um erro interno durante a avaliação. Tente novamente.",
};

export const textoErro = (codigo) =>
  ERRO_CODIGO_LABELS[codigo] ?? "A avaliação não pôde ser concluída. Tente novamente.";

/** Índices do back (completude e confiança) já vêm em 0–100 (ex.: 71.96); mostrados como %. null/NaN -> "—". */
export function percentual(valor) {
  const n = Number(valor);
  if (valor == null || !Number.isFinite(n)) return "—";
  return `${Math.round(Math.min(Math.max(n, 0), 100))}%`;
}

/** Texto de um motivo de confiança: aceita string ou objeto {descricao | bloco, codigo}. */
export function textoMotivo(m) {
  if (m == null) return "";
  if (typeof m === "string") return m;
  return m.descricao ?? [m.bloco, m.codigo].filter(Boolean).join(": ");
}

/** Rótulo legível de um valor de enum do back; sem mapa, mostra o valor como veio. */
export function rotulo(mapa, valor) {
  if (valor == null || valor === "") return "—";
  return mapa[valor] ?? String(valor);
}

export const CERTEZA_LABELS = { suspeito: "Suspeito", provavel: "Provável", confirmado: "Confirmado" };
export const TIPO_PRESCRICAO_LABELS = {
  farmacologica: "Farmacológica", nao_farmacologica: "Não farmacológica", "nao-farmacologica": "Não farmacológica",
  internacao: "Internação",
};
export const STATUS_CONDUTA_LABELS = { rascunho: "Rascunho", confirmado: "Confirmada", confirmada: "Confirmada" };