// prescricaoIA.js
//
// "Gerar com a IA" dentro da página de prescrição. Reaproveita Api, Polling e Helpers da pasta
// avaliacaoBion/ (a mesma avaliação da aba "Avaliação IA" do atendimento); só a tela é daqui.
//
//   POST (sem dado clínico) -> polling na rota LEVE de status -> ao concluir, aoConcluir()
//   recarrega a lista: o rascunho da IA (origem 'bion_ia') já foi gravado pelo back e aparece
//   no mesmo editor do modo manual. O conteúdo da avaliação (explicação, perguntas) fica na
//   aba "Avaliação IA" do atendimento; aqui só um link.
//
// O estado vive no módulo (não no DOM) para sobreviver aos re-renders da página.

import { iniciarAvaliacao, ultimaAvaliacao } from "../atendimento/avaliacaoBion/avaliacaoBionApi.js";
import { aguardarConclusao, PollingTimeout } from "../atendimento/avaliacaoBion/avaliacaoBionPolling.js";
import { STATUS_BACK, podeAvaliar, textoErro } from "../atendimento/avaliacaoBion/avaliacaoBionHelpers.js";
import { el, mensagemDeErro } from "./prescricaoHelpers.js";
import { exibirMensagem } from "../../../../shared/feedback.js";

const FASE = { OCIOSO: "ocioso", ENVIANDO: "enviando", PROCESSANDO: "processando", DEMORANDO: "demorando", FALHOU: "falhou" };

let fase = FASE.OCIOSO;
let mensagemFalha = "";
let geracao = 0;
let controlador = null;
let contexto = null;   // { alvo, uuidAtendimento, aoConcluir, visivel, temRascunhoIA, urlAvaliacao }

export function cancelarIA() {
  geracao += 1;
  controlador?.abort();
  controlador = null;
  fase = FASE.OCIOSO;
}

/** Desenha o painel (idempotente). `visivel=false` limpa o bloco (rascunho do médico em edição, etc.). */
export function renderIA(opcoes) {
  contexto = { ...contexto, ...opcoes };
  const { alvo, visivel, temRascunhoIA, urlAvaliacao } = contexto;
  alvo.replaceChildren();
  if (!visivel || !podeAvaliar()) return;

  const painel = el("section", "cons-panel presc-bloco");
  painel.appendChild(el("h2", "cons-panel-titulo", "Gerar com a IA"));
  painel.appendChild(el("p", "field-hint",
    "A IA analisa os dados já registrados neste atendimento e cria um rascunho de prescrição para você revisar. "
    + "Nada é prescrito automaticamente."));
  if (temRascunhoIA) {
    painel.appendChild(el("p", "field-hint",
      "Uma nova geração substitui o rascunho da IA que você ainda não editou."));
  }

  const ocupado = fase === FASE.ENVIANDO || fase === FASE.PROCESSANDO;
  const acoes = el("div", "cons-panel-acoes");
  const gerar = el("button", "btn-primary", temRascunhoIA ? "Gerar novamente com a IA" : "Gerar rascunho com a IA");
  gerar.type = "button";
  gerar.disabled = ocupado || fase === FASE.DEMORANDO;
  gerar.addEventListener("click", gerarComIA);
  acoes.appendChild(gerar);
  if (fase === FASE.DEMORANDO) {
    const verificar = el("button", "btn-ghost", "Verificar novamente");
    verificar.type = "button";
    verificar.addEventListener("click", () => retomarIA());
    acoes.appendChild(verificar);
  }
  if (urlAvaliacao) {
    const link = el("a", "btn-ghost cons-btn-link", "Ver a avaliação no atendimento");
    link.href = urlAvaliacao;
    acoes.appendChild(link);
  }
  painel.appendChild(acoes);

  const textos = {
    [FASE.ENVIANDO]: "Enviando para a IA…",
    [FASE.PROCESSANDO]: "A IA está avaliando o atendimento. Isso pode levar alguns instantes.",
    [FASE.DEMORANDO]: "A avaliação está demorando mais que o esperado.",
    [FASE.FALHOU]: mensagemFalha || "A avaliação não pôde ser concluída.",
  };
  if (textos[fase]) {
    const linha = el("p", `presc-estado presc-estado--${fase}`);
    if (ocupado) linha.appendChild(el("span", "presc-spinner"));
    linha.appendChild(el("span", null, textos[fase]));
    painel.appendChild(linha);
    painel.lastChild.setAttribute("role", "status");
  }
  alvo.appendChild(painel);
}

const redesenhar = () => contexto && renderIA({});

/** Ao abrir a página: se já há avaliação em andamento (pedida na aba do atendimento), volta a esperar. */
export async function retomarIA() {
  if (!contexto?.uuidAtendimento || !podeAvaliar()) return;
  const minha = ++geracao;
  controlador?.abort();
  try {
    const resp = await ultimaAvaliacao(contexto.uuidAtendimento);
    if (minha !== geracao) return;
    if (resp.data?.status === STATUS_BACK.PROCESSANDO) return esperar(resp.data.uuid_output, minha);
    fase = FASE.OCIOSO;
    redesenhar();
  } catch {
    if (minha === geracao) { fase = FASE.OCIOSO; redesenhar(); }
  }
}

async function gerarComIA() {
  if (fase === FASE.ENVIANDO || fase === FASE.PROCESSANDO || !contexto?.uuidAtendimento) return;
  const minha = ++geracao;
  controlador?.abort();
  fase = FASE.ENVIANDO;
  redesenhar();
  try {
    const resp = await iniciarAvaliacao(contexto.uuidAtendimento);
    if (minha !== geracao) return;
    await esperar(resp.data.uuid_output, minha);
  } catch (erro) {
    if (minha !== geracao || erro?.name === "AbortError") return;
    if (erro?.status === 409) {                     // pode ser "já em andamento": retoma sem alarde
      try {
        const ultima = await ultimaAvaliacao(contexto.uuidAtendimento);
        if (minha !== geracao) return;
        if (ultima.data?.status === STATUS_BACK.PROCESSANDO) {
          exibirMensagem("Já existe uma avaliação em andamento; acompanhando.", "sucesso");
          return esperar(ultima.data.uuid_output, minha);
        }
      } catch { /* cai na mensagem do back */ }
    }
    fase = FASE.OCIOSO;
    redesenhar();
    exibirMensagem(mensagemDeErro(erro, "Não foi possível iniciar a avaliação."), "erro");
  }
}

async function esperar(uuidOutput, minha) {
  fase = FASE.PROCESSANDO;
  redesenhar();
  controlador = new AbortController();
  try {
    const final = await aguardarConclusao(uuidOutput, { signal: controlador.signal });
    if (minha !== geracao) return;
    if (final?.status === STATUS_BACK.CONCLUIDO) {
      fase = FASE.OCIOSO;
      redesenhar();
      await contexto?.aoConcluir?.();
      return;
    }
    fase = FASE.FALHOU;
    mensagemFalha = textoErro(final?.erro_codigo);
    redesenhar();
  } catch (erro) {
    if (minha !== geracao || erro?.name === "AbortError") return;
    if (erro instanceof PollingTimeout) { fase = FASE.DEMORANDO; redesenhar(); return; }
    fase = FASE.OCIOSO;
    redesenhar();
    exibirMensagem(mensagemDeErro(erro, "Perdemos o acompanhamento da avaliação."), "erro");
  }
}