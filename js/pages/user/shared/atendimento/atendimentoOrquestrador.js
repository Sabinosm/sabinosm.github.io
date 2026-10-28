// atendimentoOrquestrador.js
//
// Orquestrador da página de Atendimento (Bloco 2). Carrega a consulta e os
// atendimentos, decide o que mostrar e mantém o estado compartilhado:
//
//   nenhum atendimento em andamento  -> painel de ABERTURA (triagem / avaliação)
//   atendimento em andamento         -> telas de escrita (abas), com gate de dono
//   consulta encerrada               -> só leitura
//
// O front NUNCA calcula status_consulta: vem do back e é re-lido a cada
// EVENTO_ATENDIMENTO_ALTERADA. As abas (binário, sinais, coleta, conduta)
// escutam o mesmo evento e se re-renderizam sozinhas.
//
// Dependência de back: Atendimento.to_dict() precisa trazer `realizado_por`
// (uuid do profissional dono) para o gate "só o dono escreve". Sem ele,
// somenteLeitura fica true para todos (falha fechada -- o back continua
// autorizando de verdade).

import { buscarConsulta, situacaoConsentimento } from "../../clinico/consulta/consultaApi.js";
import { ApiError, listarAtendimentosDaConsulta, abrirTriagem, abrirAvaliacaoMedica } from "./atendimentoApi.js";
import {
  estadoAtendimento, EVENTO_ATENDIMENTO_ALTERADA, TIPOS_ATENDIMENTO_LABELS, souDono,
} from "./atendimentoHelpers.js";
import {
  criarChipStatus, criarEstadoVazio, formatarDataHora, nomePaciente,
} from "../../clinico/consulta/consultaHelpers.js";
import { tipoComAvaliacaoBion } from "./avaliacaoBion/avaliacaoBionHelpers.js";
import { urlPrescricao } from "../prescricao/prescricaoHelpers.js";
import { ROTAS } from "../../../../sharedConfig/loaders/rotas.js";
import { exibirMensagem } from "../../../../shared/feedback.js";

const $ = (id) => document.getElementById(id);
let seq = 0; // descarta resposta atrasada de carregamentos concorrentes

export function iniciar() {
  $("aten-abas")?.addEventListener("click", aoTrocarAba);
  $("aten-btn-triagem")?.addEventListener("click", () => aoAbrir("triagem"));
  $("aten-btn-avaliacao")?.addEventListener("click", () => aoAbrir("avaliacao"));

  // Qualquer escrita com sucesso: re-lê contexto (status pode ter mudado no back).
  document.addEventListener(EVENTO_ATENDIMENTO_ALTERADA, recarregarLeve);

  carregar();
}

// ============================================
// Carregamento
// ============================================
async function carregar() {
  const uuidConsulta = new URLSearchParams(window.location.search).get("consulta");
  if (!uuidConsulta) {
    mostrarErro("Consulta não informada", "Abra o atendimento a partir do detalhe da consulta.");
    return;
  }

  const minhaVez = ++seq;
  try {
    const [rConsulta, rAtendimentos, rConsent] = await Promise.all([
      buscarConsulta(uuidConsulta),
      listarAtendimentosDaConsulta(uuidConsulta),
      situacaoConsentimento(uuidConsulta).catch(() => ({ data: { situacao: null } })),
    ]);
    if (minhaVez !== seq) return;

    estadoAtendimento.consulta = rConsulta.data;
    const emAndamento = (rAtendimentos.data ?? []).filter((a) => a.status === "em-andamento");
    estadoAtendimento.atendimento = emAndamento.length ? emAndamento[emAndamento.length - 1] : null;
    estadoAtendimento.consentimento = rConsent.data?.situacao ?? null;

    aplicarEstado();
    document.dispatchEvent(new CustomEvent(EVENTO_ATENDIMENTO_ALTERADA));
  } catch (erro) {
    if (minhaVez !== seq) return;
    mostrarErro(
      "Não foi possível carregar o atendimento",
      erro instanceof ApiError ? erro.message : "Erro inesperado.",
    );
  }
}

/** Re-lê consulta + atendimentos depois de qualquer escrita (sem montar erro na tela). */
async function recarregarLeve() {
  const c = estadoAtendimento.consulta;
  if (!c) return;
  const minhaVez = ++seq;
  try {
    const [rConsulta, rAtendimentos] = await Promise.all([
      buscarConsulta(c.uuid),
      listarAtendimentosDaConsulta(c.uuid),
    ]);
    if (minhaVez !== seq) return;

    estadoAtendimento.consulta = rConsulta.data;
    const uuidAtual = estadoAtendimento.atendimento?.uuid;
    const emAndamento = (rAtendimentos.data ?? []).filter((a) => a.status === "em-andamento");
    const aindaExiste = emAndamento.find((a) => a.uuid === uuidAtual);
    estadoAtendimento.atendimento = aindaExiste ?? (emAndamento.length ? emAndamento[emAndamento.length - 1] : null);
    aplicarEstado();
  } catch { /* mantém o estado anterior; a próxima ação tenta de novo */ }
}

// ============================================
// Abertura de atendimento
// ============================================
async function aoAbrir(tipo) {
  const uuidConsulta = estadoAtendimento.consulta?.uuid;
  if (!uuidConsulta) return;

  const botao = tipo === "triagem" ? $("aten-btn-triagem") : $("aten-btn-avaliacao");
  botao.disabled = true;
  try {
    const fn = tipo === "triagem" ? abrirTriagem : abrirAvaliacaoMedica;
    const resposta = await fn(uuidConsulta);
    estadoAtendimento.atendimento = resposta.data;
    exibirMensagem(
      tipo === "triagem" ? "Triagem aberta." : "Avaliação médica aberta.",
      "sucesso",
    );
    aplicarEstado();
    document.dispatchEvent(new CustomEvent(EVENTO_ATENDIMENTO_ALTERADA));
  } catch (erro) {
    // 409 (consentimento pendente / consulta encerrada) e 403 (só médico)
    // chegam com mensagem pronta do back.
    exibirMensagem(erro instanceof ApiError ? erro.message : "Não foi possível abrir o atendimento.", "erro");
  } finally {
    botao.disabled = false;
  }
}

// ============================================
// Renderização
// ============================================
function aplicarEstado() {
  const c = estadoAtendimento.consulta;
  const a = estadoAtendimento.atendimento;
  if (!c) return;

  $("aten-conteudo").hidden = false;
  $("aten-erro").hidden = true;

  // --- cabeçalho
  const { texto, especial } = nomePaciente(c);
  const titulo = $("aten-nome");
  titulo.textContent = texto;
  titulo.classList.toggle("cons-nome--especial", especial);
  $("aten-subtitulo").textContent =
    `Consulta iniciada em ${formatarDataHora(c.data_hora_inicio)}`;

  const chip = $("aten-chip-status");
  chip.innerHTML = "";
  chip.appendChild(criarChipStatus(c.status_consulta));

  const chipTipo = $("aten-chip-tipo");
  chipTipo.innerHTML = "";
  if (a) {
    const badge = document.createElement("span");
    badge.className = "cons-badge aten-badge-tipo";
    badge.textContent = TIPOS_ATENDIMENTO_LABELS[a.tipo_atendimento] ?? a.tipo_atendimento;
    chipTipo.appendChild(badge);
  }

  // --- voltar para o detalhe da consulta (ROTAS dá o caminho absoluto)
  $("aten-voltar").href = `${ROTAS.consultaDetalhe}?uuid=${encodeURIComponent(c.uuid)}`;

  const aberta = c.status_consulta !== "encerrada";

  // Gate de escrita: dono (realizado_por === meu uuid, via cache) E em
  // andamento. Falha fechada: sem realizado_por no payload, ninguém
  // escreve pelo front (o back continua sendo a cerca real).
  estadoAtendimento.atendimento = a;
  estadoAtendimento.somenteLeitura = !a || a.status !== "em-andamento" || !souDono();

  // atalho de prescrição: sem atendimento em andamento (ou consulta encerrada) ele não existe
  const linkPrescricao = $("aten-link-prescricao");
  if (linkPrescricao && !(a && aberta)) linkPrescricao.hidden = true;

  if (a && aberta) {
    $("aten-secao-abertura").hidden = true;
    $("aten-secao-atendimento").hidden = false;
    $("aten-banner-leitura").hidden = !estadoAtendimento.somenteLeitura;

    // conduta de enfermagem só existe em triagem
    const abaConduta = document.querySelector('#aten-abas [data-aba="conduta"]');
    const ehTriagem = a.tipo_atendimento === "triagem";
    if (abaConduta) abaConduta.hidden = !ehTriagem;
    if (!ehTriagem && abaAtiva() === "conduta") ativarAba("binario");
    // avaliação por IA só existe em avaliação médica / reavaliação
    const abaBion = document.querySelector('#aten-abas [data-aba="bion"]');
    const temBion = tipoComAvaliacaoBion(a);
    if (abaBion) abaBion.hidden = !temBion;
    if (!temBion && abaAtiva() === "bion") ativarAba("binario");
    // atalho para a página de prescrição (mesma regra de acesso da aba de IA: médico dono)
    if (linkPrescricao) {
      linkPrescricao.hidden = !(temBion && souDono());
      linkPrescricao.href = urlPrescricao(c.uuid, a.uuid);
    }
    // Os painéis das abas são controlados só por ativarAba(); re-sincroniza a cada render.
    ativarAba(abaAtiva());
  } else if (aberta) {
    // nenhum atendimento em andamento: oferecer abertura
    $("aten-secao-atendimento").hidden = true;
    $("aten-secao-abertura").hidden = false;
    $("aten-banner-leitura").hidden = true;

    const consent = estadoAtendimento.consentimento;
    $("aten-abertura-aviso").textContent =
      consent === "pendente"
        ? "Atenção: o consentimento LGPD está pendente. O back recusa a abertura (409) até que ele seja registrado ou dispensado na página da consulta."
        : consent === "dispensado_emergencia"
          ? "Consentimento dispensado por emergência. Escolha o tipo de atendimento para iniciar."
          : "Escolha o tipo de atendimento para iniciar.";
  } else {
    $("aten-secao-abertura").hidden = true;
    $("aten-secao-atendimento").hidden = true;
    $("aten-banner-leitura").hidden = false;
    $("aten-banner-leitura-texto").textContent = "Consulta encerrada — atendimento em modo de leitura.";
  }
}

function mostrarErro(titulo, texto) {
  $("aten-conteudo").hidden = true;
  const caixa = $("aten-erro");
  caixa.hidden = false;
  caixa.innerHTML = "";
  caixa.appendChild(criarEstadoVazio(titulo, texto));

  const uuidConsulta = new URLSearchParams(window.location.search).get("consulta");
  const voltar = document.createElement("a");
  voltar.className = "btn-ghost cons-btn-link";
  voltar.href = uuidConsulta
    ? `${ROTAS.consultaDetalhe}?uuid=${encodeURIComponent(uuidConsulta)}`
    : ROTAS.consulta;
  voltar.textContent = "Voltar";
  caixa.appendChild(voltar);
}

// ============================================
// Abas
// ============================================
function abaAtiva() {
  return document.querySelector("#aten-abas .segmented-item--active")?.dataset.aba ?? "binario";
}

function ativarAba(nome) {
  document.querySelectorAll("#aten-abas .segmented-item").forEach((btn) => {
    btn.classList.toggle("segmented-item--active", btn.dataset.aba === nome);
  });
  ["binario", "sinais", "coleta", "conduta", "bion"].forEach((aba) => {
    const painel = $(`aten-aba-${aba}`);
    if (painel) painel.hidden = aba !== nome;
  });
}

function aoTrocarAba(e) {
  const btn = e.target.closest(".segmented-item");
  if (btn && !btn.hidden) ativarAba(btn.dataset.aba);
}