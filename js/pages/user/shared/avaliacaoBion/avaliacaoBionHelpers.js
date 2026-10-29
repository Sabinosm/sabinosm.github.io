// avaliacaoBionHelpers.js
//
// Utilitários puros da aba "Avaliação IA": estados, labels de erro, formatação.
// Sem fetch e sem DOM além do que vem de atendimentoHelpers (el, gate de escrita).

import { estadoAtendimento, podeEscrever } from "../atendimento/atendimentoHelpers.js";

/** Tipos de atendimento em que a aba existe (o back também exige: avaliacao-medica ou reavaliacao). */
export const TIPOS_COM_AVALIACAO_BION = ["avaliacao-medica", "reavaliacao"];

export const tipoComAvaliacaoBion = (a = estadoAtendimento.atendimento) =>
  Boolean(a) && TIPOS_COM_AVALIACAO_BION.includes(a.tipo_atendimento);

/** Pode pedir avaliação: tipo certo + em andamento + dono (podeEscrever já falha fechado sem dono). */
export const podeAvaliar = () => tipoComAvaliacaoBion() && podeEscrever();

/** Estados da aba (máquina de estados simples; só avaliacaoBion.js escreve). */
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

/** Índices do back vão de 0 a 1 (escala confirmada); mostrados em %. null/NaN -> "—". */
export function percentual(valor) {
  const n = Number(valor);
  if (valor == null || !Number.isFinite(n)) return "—";
  return `${Math.round(Math.min(Math.max(n, 0), 1) * 100)}%`;
}

/** Rótulo legível de um valor de enum do back; sem mapa, mostra o valor como veio. */
export function rotulo(mapa, valor) {
  if (valor == null || valor === "") return "—";
  return mapa[valor] ?? String(valor);
}

export const CERTEZA_LABELS = { suspeito: "Suspeito", provavel: "Provável", confirmado: "Confirmado" };
export const TIPO_PRESCRICAO_LABELS = {
  farmacologica: "Farmacológica", nao_farmacologica: "Não farmacológica", "nao-farmacologica": "Não farmacológica",
};
export const STATUS_CONDUTA_LABELS = { rascunho: "Rascunho", confirmado: "Confirmada", confirmada: "Confirmada" };