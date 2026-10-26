// avaliacaoBion.js
//
// Aba "Avaliação IA" do atendimento (avaliação médica / reavaliação). Liga a tela
// à API: pede a avaliação, espera pelo status leve e lê o conteúdo uma única vez.
//
//   retomar()  -> /ultima: nunca avaliou | em andamento (volta a esperar) | concluída | falhou
//   avaliar()  -> POST (sem dado clínico) -> aguardar() -> lerAvaliacao() (única leitura auditada)
//
// Regras:
//   - o front não decide nada clínico nem guarda nada em storage; a retomada vem do back
//   - o gate (dono + tipo + em andamento) só esconde/desabilita; o back continua sendo a cerca
//   - `geracao` descarta resposta atrasada (troca de atendimento, nova avaliação)
//   - AbortController cancela o polling ao trocar de atendimento
// A aba é mostrada/escondida pelo orquestrador (tipoComAvaliacaoBion); este módulo só reage
// a EVENTO_ATENDIMENTO_ALTERADA.

import {
  iniciarAvaliacao, ultimaAvaliacao, lerAvaliacao, ApiError,
} from "./avaliacaoBionApi.js";
import { aguardarConclusao, PollingTimeout } from "./avaliacaoBionPolling.js";
import { renderResultado } from "./avaliacaoBionRender.js";
import {
  ESTADO, STATUS_BACK, podeAvaliar, tipoComAvaliacaoBion, textoErro,
} from "./avaliacaoBionHelpers.js";
import { estadoAtendimento, EVENTO_ATENDIMENTO_ALTERADA, souDono, el } from "../atendimentoHelpers.js";
import { exibirMensagem } from "../../../../../shared/feedback.js";

const $ = (id) => document.getElementById(id);

let estado = ESTADO.CARREGANDO;
let uuidAtendimentoAtual = null;   // atendimento a que o estado da aba se refere
let teveResultado = false;         // já há resultado/falha visível (muda o texto do botão)
let geracao = 0;
let controlador = null;

document.addEventListener("DOMContentLoaded", () => {
  $("aten-bion-avaliar")?.addEventListener("click", avaliar);
  $("aten-bion-verificar")?.addEventListener("click", () => retomar());
  document.addEventListener(EVENTO_ATENDIMENTO_ALTERADA, sincronizar);
});

// ---------------------------------------------------------------- sincronização
function sincronizar() {
  const a = estadoAtendimento.atendimento;
  if (!a || !tipoComAvaliacaoBion(a)) {            // sem atendimento ou tipo sem aba: solta tudo
    cancelar();
    uuidAtendimentoAtual = null;
    return;
  }
  if (a.uuid !== uuidAtendimentoAtual) {           // atendimento novo: recomeça do back
    cancelar();
    uuidAtendimentoAtual = a.uuid;
    teveResultado = false;
    limparResultado();
    // Só o dono lê a avaliação (o back responde 403 aos demais): quem não é dono vê só o aviso.
    if (souDono()) retomar(); else definir(ESTADO.OCIOSO);
    return;
  }
  desenhar();                                      // mesmo atendimento: só atualiza o gate
}

function cancelar() {
  geracao += 1;
  controlador?.abort();
  controlador = null;
}

// ---------------------------------------------------------------- retomar (ultima)
async function retomar() {
  const uuid = uuidAtendimentoAtual;
  if (!uuid) return;
  const minha = ++geracao;
  controlador?.abort();
  definir(ESTADO.CARREGANDO);
  try {
    const resp = await ultimaAvaliacao(uuid);
    if (minha !== geracao) return;
    await aplicarEstadoBack(resp.data, minha, { notificar: false });
  } catch (erro) {
    if (minha !== geracao || erro?.name === "AbortError") return;
    definir(ESTADO.OCIOSO);
    exibirMensagem(erro instanceof ApiError ? erro.message : "Não foi possível consultar a avaliação da IA.", "erro");
  }
}

/** Decide o que mostrar a partir do estado devolvido pelo back (ultima/status). */
async function aplicarEstadoBack(info, minha, { notificar }) {
  if (!info) return definir(ESTADO.OCIOSO);        // nunca houve avaliação
  if (info.status === STATUS_BACK.PROCESSANDO) return aguardar(info.uuid_output, minha);
  if (info.status === STATUS_BACK.CONCLUIDO) return carregarResultado(info.uuid_output, minha, notificar);
  teveResultado = true;
  limparResultado();
  definir(ESTADO.FALHOU, textoErro(info.erro_codigo));
}

// ---------------------------------------------------------------- avaliar (POST)
async function avaliar() {
  if (!podeAvaliar() || [ESTADO.ENVIANDO, ESTADO.PROCESSANDO, ESTADO.CARREGANDO].includes(estado)) return;
  const uuid = uuidAtendimentoAtual;
  if (!uuid) return;

  const minha = ++geracao;
  controlador?.abort();
  definir(ESTADO.ENVIANDO);
  try {
    const resp = await iniciarAvaliacao(uuid);
    if (minha !== geracao) return;
    limparResultado();
    await aguardar(resp.data.uuid_output, minha);
  } catch (erro) {
    if (minha !== geracao || erro?.name === "AbortError") return;
    if (erro instanceof ApiError && erro.status === 409) return aoConflito(uuid, erro, minha);
    definir(teveResultado ? ESTADO.CONCLUIDO : ESTADO.OCIOSO);
    exibirMensagem(erro instanceof ApiError ? erro.message : "Não foi possível iniciar a avaliação.", "erro");
  }
}

/** 409: pode ser "já em andamento" (retoma sozinho) ou pré-requisito faltando (mostra a mensagem do back). */
async function aoConflito(uuid, erro, minha) {
  try {
    const resp = await ultimaAvaliacao(uuid);
    if (minha !== geracao) return;
    if (resp.data?.status === STATUS_BACK.PROCESSANDO) {
      exibirMensagem("Já existe uma avaliação em andamento; acompanhando.", "sucesso");
      return aguardar(resp.data.uuid_output, minha);
    }
  } catch { /* cai na mensagem do back */ }
  if (minha !== geracao) return;
  definir(teveResultado ? ESTADO.CONCLUIDO : ESTADO.OCIOSO);
  exibirMensagem(erro.message, "erro");
}

// ---------------------------------------------------------------- espera + leitura
async function aguardar(uuidOutput, minha) {
  definir(ESTADO.PROCESSANDO);
  controlador = new AbortController();
  try {
    const final = await aguardarConclusao(uuidOutput, { signal: controlador.signal });
    if (minha !== geracao) return;
    await aplicarEstadoBack(final, minha, { notificar: true });
  } catch (erro) {
    if (minha !== geracao || erro?.name === "AbortError") return;
    if (erro instanceof PollingTimeout) return definir(ESTADO.DEMORANDO);
    definir(teveResultado ? ESTADO.CONCLUIDO : ESTADO.OCIOSO);
    exibirMensagem(erro instanceof ApiError ? erro.message : "Perdemos o acompanhamento da avaliação.", "erro");
  }
}

async function carregarResultado(uuidOutput, minha, notificar) {
  definir(ESTADO.CARREGANDO);
  try {
    const resp = await lerAvaliacao(uuidOutput);      // única leitura auditada
    if (minha !== geracao) return;
    const alvo = $("aten-bion-resultado");
    alvo.replaceChildren(renderResultado(resp.data));
    teveResultado = true;
    definir(ESTADO.CONCLUIDO);
    // O rascunho de conduta acabou de ser gravado: as demais abas podem se atualizar.
    // Nesta aba o evento cai em sincronizar() no mesmo atendimento (só redesenha, sem loop).
    if (notificar) document.dispatchEvent(new CustomEvent(EVENTO_ATENDIMENTO_ALTERADA));
  } catch (erro) {
    if (minha !== geracao || erro?.name === "AbortError") return;
    definir(ESTADO.OCIOSO);
    exibirMensagem(erro instanceof ApiError ? erro.message : "Não foi possível abrir a avaliação.", "erro");
  }
}

// ---------------------------------------------------------------- tela
function limparResultado() {
  $("aten-bion-resultado")?.replaceChildren();
}

function definir(novo, mensagem = "") {
  estado = novo;
  desenhar(mensagem);
}

/** Reflete estado + gate no DOM. Idempotente. */
function desenhar(mensagem) {
  const caixa = $("aten-bion-status");
  if (!caixa) return;
  if (mensagem !== undefined) caixa.dataset.mensagem = mensagem;

  const ocupado = [ESTADO.ENVIANDO, ESTADO.PROCESSANDO, ESTADO.CARREGANDO].includes(estado);
  const pode = podeAvaliar();

  const textos = {
    [ESTADO.CARREGANDO]: "Carregando…",
    [ESTADO.ENVIANDO]: "Enviando para a IA…",
    [ESTADO.PROCESSANDO]: "A IA está avaliando o atendimento. Isso pode levar alguns instantes.",
    [ESTADO.DEMORANDO]: "A avaliação está demorando mais que o esperado.",
    [ESTADO.FALHOU]: caixa.dataset.mensagem || "A avaliação não pôde ser concluída.",
  };
  caixa.replaceChildren();
  if (textos[estado]) {
    const linha = el("p", `aten-bion-estado aten-bion-estado--${estado}`);
    if (ocupado) linha.appendChild(el("span", "aten-bion-spinner"));
    linha.appendChild(el("span", null, textos[estado]));
    caixa.appendChild(linha);
  }

  const botao = $("aten-bion-avaliar");
  botao.hidden = !pode;
  botao.disabled = ocupado || estado === ESTADO.DEMORANDO;
  botao.textContent = teveResultado || estado === ESTADO.FALHOU ? "Avaliar novamente" : "Avaliar com IA";

  $("aten-bion-verificar").hidden = estado !== ESTADO.DEMORANDO;
  $("aten-bion-leitura-hint").hidden = pode;
  $("aten-bion-substitui-hint").hidden = !(pode && teveResultado && !ocupado);
}