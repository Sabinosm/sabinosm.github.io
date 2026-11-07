// prescricaoIa.js
//
// "Prescrever com IA" dentro da página de prescrição. É AQUI que mora a avaliação por IA (a antiga
// aba "Avaliação IA" do atendimento foi removida). Reaproveita Api, Polling, Render e Helpers da
// pasta avaliacaoBion/:
//
//   retomarIA()  -> /ultima: nunca avaliou | em andamento (volta a esperar) | concluída | falhou
//   gerarComIA() -> POST (sem dado clínico) -> polling na rota LEVE de status -> ao concluir,
//                   lê o conteúdo UMA vez (leitura auditada) e chama aoConcluir(): a página relê as
//                   prescrições, porque o back já gravou o rascunho (origem 'bion_ia') no mesmo
//                   editor do modo manual.
//
// O resultado da avaliação (conduta proposta, perguntas, explicação, qualidade) aparece logo abaixo
// do painel, com o mesmo render da antiga aba. Todo texto da IA entra no DOM por textContent.
//
// O estado vive no módulo (não no DOM) para sobreviver aos re-renders da página.

import {
  iniciarAvaliacao, ultimaAvaliacao, lerAvaliacao,
} from "../avaliacaoBion/avaliacaoBionApi.js";
import { aguardarConclusao, PollingTimeout } from "../avaliacaoBion/avaliacaoBionPolling.js";
import { renderResultado } from "../avaliacaoBion/avaliacaoBionRender.js";
import { criarBloqueio } from "../avaliacaoBion/avaliacaoBionBloqueio.js";
import { STATUS_BACK, podeAvaliar, textoErro } from "../avaliacaoBion/avaliacaoBionHelpers.js";
import { el, mensagemDeErro } from "./prescricaoHelpers.js";
import { exibirMensagem } from "../../../../shared/feedback.js";

const FASE = {
  OCIOSO: "ocioso", CARREGANDO: "carregando", ENVIANDO: "enviando",
  PROCESSANDO: "processando", DEMORANDO: "demorando", FALHOU: "falhou",
};

let fase = FASE.OCIOSO;
let mensagemFalha = "";
let dados = null;          // conteúdo da última avaliação concluída (resposta do GET completo)
let teveResultado = false; // já houve resultado/falha visível (muda o texto do botão)
let iniciada = false;      // a consulta à /ultima já foi feita nesta página
let geracao = 0;
let controlador = null;
let contexto = null;       // { alvo, uuidAtendimento, aoConcluir, visivel, bloqueado, temRascunhoIA,
                           //   aoDescartarRascunho, aoMudarFase, aoRetomarProcessando }

// Espera de 30 s após "ia_indisponivel". Enquanto a IA trabalha, quem bloqueia o botão é `fase`.
const bloqueio = criarBloqueio();
bloqueio.aoMudar(() => { if (contexto?.alvo?.isConnected) renderIA({}); });

const ocupadoAgora = () => [FASE.CARREGANDO, FASE.ENVIANDO, FASE.PROCESSANDO].includes(fase);

/** A IA está trabalhando (o alternador de modo trava enquanto isso). */
export const iaOcupada = () => ocupadoAgora();
/** A consulta ao estado da avaliação já foi feita (evita repetir a leitura auditada). */
export const iaIniciada = () => iniciada;

export function cancelarIA() {
  geracao += 1;
  controlador?.abort();
  controlador = null;
  fase = FASE.OCIOSO;
}

/** Desenha o painel (idempotente). `visivel=false` limpa o bloco (modo manual, prescrição confirmada...). */
export function renderIA(opcoes) {
  contexto = { ...contexto, ...opcoes };
  const { alvo, visivel, bloqueado, temRascunhoIA, aoDescartarRascunho } = contexto;
  alvo.replaceChildren();
  if (!visivel || !podeAvaliar()) return;

  const painel = el("section", "cons-panel presc-bloco");
  painel.appendChild(el("h2", "cons-panel-titulo", "Prescrever com IA"));
  painel.appendChild(el("p", "field-hint",
    "A IA analisa os dados já registrados neste atendimento e cria um rascunho de prescrição para você revisar. "
    + "Nada é prescrito automaticamente: a decisão clínica é sua."));

  const ocupado = ocupadoAgora();
  const acoes = el("div", "cons-panel-acoes");

  if (bloqueado) {
    // o back recusa a IA (409) com rascunho do médico em aberto: explica e oferece o caminho
    painel.appendChild(el("p", "presc-aviso",
      "Você já tem um rascunho de prescrição feito ou editado por você. Para gerar com a IA, descarte esse rascunho antes."));
    const descartar = el("button", "btn-ghost", "Descartar rascunho e usar a IA");
    descartar.type = "button";
    descartar.addEventListener("click", () => aoDescartarRascunho?.());
    acoes.appendChild(descartar);
  } else {
    const aguardando = bloqueio.bloqueado();
    const gerar = el("button", "btn-primary", aguardando && !ocupado
      ? "Aguarde para tentar novamente"
      : (temRascunhoIA || teveResultado ? "Gerar novamente com a IA" : "Gerar rascunho com a IA"));
    gerar.type = "button";
    gerar.disabled = ocupado || fase === FASE.DEMORANDO || aguardando;
    gerar.addEventListener("click", gerarComIA);
    acoes.appendChild(gerar);
    if (fase === FASE.DEMORANDO) {
      const verificar = el("button", "btn-ghost", "Verificar novamente");
      verificar.type = "button";
      verificar.addEventListener("click", () => retomarIA());
      acoes.appendChild(verificar);
    }
  }
  painel.appendChild(acoes);

  if (!bloqueado && temRascunhoIA) {
    painel.appendChild(el("p", "field-hint",
      "Uma nova geração substitui o rascunho da IA que você ainda não editou."));
  }

  const textos = {
    [FASE.CARREGANDO]: "Carregando…",
    [FASE.ENVIANDO]: "Enviando para a IA…",
    [FASE.PROCESSANDO]: "A IA está avaliando o atendimento. Isso pode levar alguns instantes.",
    [FASE.DEMORANDO]: "A avaliação está demorando mais que o esperado.",
    [FASE.FALHOU]: mensagemFalha || "A avaliação não pôde ser concluída.",
  };
  if (textos[fase]) {
    const linha = el("p", `presc-estado presc-estado--${fase}`);
    if (ocupado) linha.appendChild(el("span", "presc-spinner"));
    linha.appendChild(el("span", null, textos[fase]));
    linha.setAttribute("role", "status");
    painel.appendChild(linha);
  }
  alvo.appendChild(painel);

  // Resultado da avaliação (explicação, perguntas, qualidade): blocos próprios, fora do painel acima.
  if (dados) {
    const resultado = el("div", "presc-ia-resultado");
    resultado.appendChild(renderResultado(dados));
    alvo.appendChild(resultado);
  }
}

const redesenhar = () => {
  if (contexto) renderIA({});
  contexto?.aoMudarFase?.();
};

// ---------------------------------------------------------------- retomar (/ultima)
/**
 * Pergunta ao back em que pé está a avaliação deste atendimento.
 * `soSeProcessando`: usado ao abrir a página fora do modo IA -- só volta a esperar se houver
 * avaliação em curso; não lê conteúdo (a leitura é auditada) nem mexe na tela.
 */
export async function retomarIA({ soSeProcessando = false } = {}) {
  if (!contexto?.uuidAtendimento || !podeAvaliar()) return;
  const minha = ++geracao;
  controlador?.abort();
  if (!soSeProcessando) { fase = FASE.CARREGANDO; redesenhar(); }
  try {
    const resp = await ultimaAvaliacao(contexto.uuidAtendimento);
    if (minha !== geracao) return;
    const processando = resp.data?.status === STATUS_BACK.PROCESSANDO;
    if (soSeProcessando && !processando) return;
    iniciada = true;
    if (processando) contexto.aoRetomarProcessando?.();
    await aplicarEstadoBack(resp.data, minha, { notificar: false });
  } catch (erro) {
    if (minha !== geracao || erro?.name === "AbortError") return;
    if (soSeProcessando) return;
    fase = FASE.OCIOSO;
    redesenhar();
    exibirMensagem(mensagemDeErro(erro, "Não foi possível consultar a avaliação da IA."), "erro");
  }
}

/** Decide o que mostrar a partir do estado devolvido pelo back (ultima/status). */
async function aplicarEstadoBack(info, minha, { notificar }) {
  if (!info) { fase = FASE.OCIOSO; redesenhar(); return; }          // nunca houve avaliação
  if (info.status === STATUS_BACK.PROCESSANDO) return esperar(info.uuid_output, minha);
  if (info.status === STATUS_BACK.CONCLUIDO) return carregarResultado(info.uuid_output, minha, notificar);
  teveResultado = true;
  dados = null;
  mensagemFalha = textoErro(info.erro_codigo, info.mensagem);
  fase = FASE.FALHOU;
  if (notificar) {                                   // desfecho novo (não o estado antigo lido ao abrir a página)
    bloqueio.concluir(info);                         // "ia_indisponivel" segura o botão por 30 s
    exibirMensagem(mensagemFalha, "erro", 6000);      // texto longo: o padrão de 2 s não dá para ler
  }
  redesenhar();
}

// ---------------------------------------------------------------- gerar (POST)
async function gerarComIA() {
  if (ocupadoAgora() || bloqueio.bloqueado() || !contexto?.uuidAtendimento) return;
  const minha = ++geracao;
  controlador?.abort();
  fase = FASE.ENVIANDO;
  redesenhar();
  try {
    const resp = await iniciarAvaliacao(contexto.uuidAtendimento);
    if (minha !== geracao) return;
    iniciada = true;
    dados = null;                                    // some o resultado antigo; o novo vem ao concluir
    await esperar(resp.data.uuid_output, minha);
  } catch (erro) {
    if (minha !== geracao || erro?.name === "AbortError") return;
    if (erro?.status === 409) {                      // pode ser "já em andamento": retoma sem alarde
      try {
        const ultima = await ultimaAvaliacao(contexto.uuidAtendimento);
        if (minha !== geracao) return;
        if (ultima.data?.status === STATUS_BACK.PROCESSANDO) {
          exibirMensagem("Já existe uma avaliação em andamento; acompanhando.", "info");
          return esperar(ultima.data.uuid_output, minha);
        }
      } catch { /* cai na mensagem do back */ }
    }
    fase = FASE.OCIOSO;
    redesenhar();
    exibirMensagem(mensagemDeErro(erro, "Não foi possível iniciar a avaliação."), "erro");
  }
}

// ---------------------------------------------------------------- espera + leitura
async function esperar(uuidOutput, minha) {
  fase = FASE.PROCESSANDO;
  redesenhar();
  controlador = new AbortController();
  try {
    const final = await aguardarConclusao(uuidOutput, { signal: controlador.signal });
    if (minha !== geracao) return;
    await aplicarEstadoBack(final, minha, { notificar: true });
  } catch (erro) {
    if (minha !== geracao || erro?.name === "AbortError") return;
    if (erro instanceof PollingTimeout) { fase = FASE.DEMORANDO; redesenhar(); return; }
    fase = FASE.OCIOSO;
    redesenhar();
    exibirMensagem(mensagemDeErro(erro, "Perdemos o acompanhamento da avaliação."), "erro");
  }
}

async function carregarResultado(uuidOutput, minha, notificar) {
  fase = FASE.CARREGANDO;
  redesenhar();
  try {
    const resp = await lerAvaliacao(uuidOutput);     // única leitura auditada
    if (minha !== geracao) return;
    dados = resp.data;
    teveResultado = true;
    fase = FASE.OCIOSO;
    redesenhar();
    // O back acabou de gravar o rascunho: a página relê as prescrições (só quando a avaliação é nova).
    if (notificar) {
      exibirMensagem(dados?.conduta ? "Avaliação da IA concluída. Revise o rascunho antes de confirmar."
        : "Avaliação da IA concluída.", "sucesso", 4000);
      await contexto?.aoConcluir?.();
    }
  } catch (erro) {
    if (minha !== geracao || erro?.name === "AbortError") return;
    fase = FASE.OCIOSO;
    redesenhar();
    exibirMensagem(mensagemDeErro(erro, "Não foi possível abrir a avaliação."), "erro");
  }
}