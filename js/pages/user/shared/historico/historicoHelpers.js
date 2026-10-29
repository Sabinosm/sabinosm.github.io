// historicoHelpers.js
//
// Utilitários puros da página de Histórico: rótulos, regras de qual botão aparece e links.
// Sem fetch e sem estado.

import { paraDataUtc, urlAtendimento, urlDetalhe } from "../../clinico/consulta/consultaHelpers.js";
import { urlPrescricao } from "../prescricao/prescricaoHelpers.js";
import { ROTAS } from "../../../../sharedConfig/loaders/rotas.js";
import { lerUuidUsuarioCache } from "../../../../sharedConfig/userCacheHelpers/userCacheUsuario.js";

export const POR_PAGINA = 10;

export const TIPO_ATENDIMENTO_LABELS = {
  triagem: "Triagem", "avaliacao-medica": "Avaliação médica", reavaliacao: "Reavaliação",
  alta: "Alta", procedimento: "Procedimento",
};
export const STATUS_ATENDIMENTO_LABELS = {
  "em-andamento": "Em andamento", finalizado: "Finalizado", cancelado: "Cancelado",
};
export const FUNCAO_LABELS = { medico: "Médico(a)", enfermeiro: "Enfermeiro(a)" };

export const ACAO_LABELS = {
  "continuar-atendimento": "Continuar atendimento",
  "registrar-consentimento": "Registrar consentimento",
  "dispensar-consentimento": "Dispensar consentimento",
  "abrir-triagem": "Abrir triagem",
  "abrir-avaliacao-medica": "Iniciar avaliação médica",
  "abrir-reavaliacao": "Abrir reavaliação",
};
export const MOTIVO_BLOQUEIO_LABELS = {
  "consulta-encerrada": "Consulta encerrada",
  "sem-permissao": "Sem permissão para continuar",
  "atendimento-de-outro-profissional": "Atendimento em andamento com outro profissional",
  "proxima-etapa-exige-medico": "A próxima etapa exige médico",
};

/** "paciente-nao-compareceu" -> "Paciente nao compareceu" (valor sem rótulo nunca fica em branco). */
export const humanizar = (valor) => {
  if (!valor) return "—";
  const t = String(valor).replace(/[-_]+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** "1 h 20 min", "35 min" ou null quando falta uma das pontas (atendimento em andamento). */
export function duracaoTexto(inicioIso, fimIso) {
  const ini = paraDataUtc(inicioIso);
  const fim = paraDataUtc(fimIso);
  if (!ini || !fim || fim < ini) return null;
  const min = Math.round((fim - ini) / 60000);
  if (min < 1) return "menos de 1 min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

// ------------------------------------------------------------ regras de botão
/** O resumo em PDF só existe para atendimento finalizado (o back devolve 409 nos demais). */
export const resumoDisponivel = (atendimento) => atendimento?.status === "finalizado";

/** O atendimento é do usuário logado? (o back só mostra a prescrição ao dono.) */
export function ehMeu(atendimento) {
  const dono = atendimento?.profissional?.uuid ?? atendimento?.realizado_por;
  const meu = lerUuidUsuarioCache();
  return Boolean(dono && meu && String(dono) === String(meu));
}

/** Prescrição só existe em avaliação médica e reavaliação. */
export const temPrescricao = (atendimento) =>
  ["avaliacao-medica", "reavaliacao"].includes(atendimento?.tipo_atendimento);

/** Termo de consentimento se resolve na página da consulta; o resto, na do atendimento. */
export function urlContinuar(consulta) {
  const acao = consulta.proxima_acao;
  if (acao === "registrar-consentimento" || acao === "dispensar-consentimento") return urlDetalhe(consulta.uuid);
  return urlAtendimento(consulta.uuid);
}

export const linkPrescricao = (uuidConsulta, atendimento) => urlPrescricao(uuidConsulta, atendimento.uuid);

/**
 * Link do detalhe do atendimento. A página ainda vai ser criada: sem ROTAS.atendimentoDetalhe devolve
 * null e o botão simplesmente não aparece.
 */
export function urlAtendimentoDetalhe(uuidConsulta, uuidAtendimento) {
  if (!ROTAS.atendimentoDetalhe) return null;
  const p = new URLSearchParams({ consulta: uuidConsulta, atendimento: uuidAtendimento });
  return `${ROTAS.atendimentoDetalhe}?${p.toString()}`;
}

// ---------------------------------------------------------------------- dom
export function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}