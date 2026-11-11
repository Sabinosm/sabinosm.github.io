// avaliacaoBionNotaModal.js
//
// Modal em que o médico avalia a resposta da IA: nota de 0,5 a 5 estrelas (meias estrelas) e um motivo
// de uma lista fechada. Tudo é opcional, mas ao menos um precisa estar preenchido para enviar; o médico
// pode simplesmente fechar (X, Esc ou "Agora não") e nada é enviado. Só fecha por ação dele: clicar fora
// não fecha. Erros e acertos do envio saem por exibirMensagem. Sem estado fora do modal aberto.

import { el } from "./atendimentoHelpers.js";
import { mensagemDeErro } from "../prescricao/prescricaoHelpers.js";
import { exibirMensagem } from "../../../../shared/feedback.js";
import { enviarAvaliacaoNota } from "./avaliacaoBionApi.js";
import {
  NOTA_DESCRICAO_LABELS, NOTA_DESCRICAO_NAO_USOU_IA, NOTA_MAX, NOTA_MIN, montarAvaliacao, notaTexto,
} from "../../../../../front_avaliacao_nota_v2/avaliacaoBionHelpers.js";

const ESTRELAS = [1, 2, 3, 4, 5];
let aberto = null;     // promessa do modal aberto: um por vez

/**
 * Abre o modal. Resolve com { avaliacao_nota, avaliacao_nota_descricao } do que o back gravou,
 * ou com null se o médico fechou sem enviar.
 */
export function abrirModalNota({ uuidOutput, notaAtual = null, descricaoAtual = null }) {
  if (aberto) return aberto;
  aberto = new Promise((resolver) => montar({ uuidOutput, notaAtual, descricaoAtual }, (r) => {
    aberto = null;
    resolver(r);
  }));
  return aberto;
}

function montar({ uuidOutput, notaAtual, descricaoAtual }, terminar) {
  let nota = notaAtual;
  let descricao = descricaoAtual;
  let previa = null;           // nota mostrada enquanto o mouse passa sobre as estrelas
  let enviando = false;
  const focoAnterior = document.activeElement;

  const fundo = el("div", "presc-modal-fundo");
  const caixa = el("div", "presc-modal");
  caixa.setAttribute("role", "dialog");
  caixa.setAttribute("aria-modal", "true");
  caixa.setAttribute("aria-labelledby", "presc-modal-titulo");

  const topo = el("div", "presc-modal-topo");
  const titulo = el("h2", "presc-modal-titulo", "Como foi a resposta da IA?");
  titulo.id = "presc-modal-titulo";
  const fechar = el("button", "presc-modal-fechar", "×");
  fechar.type = "button";
  fechar.setAttribute("aria-label", "Fechar sem avaliar");
  topo.append(titulo, fechar);

  const dica = el("p", "field-hint",
    "Opcional. Sua avaliação ajuda a melhorar a IA e não altera a prescrição.");

  // ---- estrelas
  const estrelas = el("div", "presc-estrelas");
  estrelas.tabIndex = 0;
  estrelas.setAttribute("role", "slider");
  estrelas.setAttribute("aria-label", "Nota da IA, de 0,5 a 5 estrelas");
  estrelas.setAttribute("aria-valuemin", String(NOTA_MIN));
  estrelas.setAttribute("aria-valuemax", String(NOTA_MAX));
  estrelas.setAttribute("aria-valuestep", "0.5");
  const preenchimentos = ESTRELAS.map((n) => {
    const estrela = el("span", "presc-estrela");
    const base = el("span", "presc-estrela-base", "★");
    const cheia = el("span", "presc-estrela-cheia", "★");
    const esquerda = el("span", "presc-estrela-metade presc-estrela-metade--esq");
    const direita = el("span", "presc-estrela-metade presc-estrela-metade--dir");
    for (const [metade, valor] of [[esquerda, n - 0.5], [direita, n]]) {
      metade.addEventListener("click", () => escolherNota(valor));
      metade.addEventListener("mouseenter", () => { previa = valor; desenharNota(); });
    }
    estrela.append(base, cheia, esquerda, direita);
    estrelas.appendChild(estrela);
    return { cheia, n };
  });
  estrelas.addEventListener("mouseleave", () => { previa = null; desenharNota(); });
  estrelas.addEventListener("keydown", (e) => {
    if (desabilitadaNota()) return;
    const passo = { ArrowRight: 0.5, ArrowUp: 0.5, ArrowLeft: -0.5, ArrowDown: -0.5 }[e.key];
    if (passo) {
      e.preventDefault();
      escolherNota(Math.min(NOTA_MAX, Math.max(NOTA_MIN, (nota ?? 0) + passo)));
    } else if (e.key === "Home") { e.preventDefault(); escolherNota(NOTA_MIN); }
    else if (e.key === "End") { e.preventDefault(); escolherNota(NOTA_MAX); }
  });
  const valorNota = el("span", "presc-estrelas-valor");
  valorNota.setAttribute("aria-live", "polite");
  const linhaNota = el("div", "presc-estrelas-linha");
  linhaNota.append(estrelas, valorNota);

  // ---- motivos
  const grupo = el("fieldset", "presc-motivos");
  grupo.appendChild(el("legend", "presc-motivos-legenda", "O que você achou? (opcional)"));
  const radios = Object.entries(NOTA_DESCRICAO_LABELS).map(([valor, texto]) => {
    const rotulo = el("label", "presc-motivo");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "presc-nota-motivo";
    radio.value = valor;
    radio.checked = valor === descricao;
    radio.addEventListener("change", () => {
      descricao = valor;
      if (valor === NOTA_DESCRICAO_NAO_USOU_IA) nota = null;     // sem IA não há nota
      desenhar();
    });
    rotulo.append(radio, el("span", null, texto));
    grupo.appendChild(rotulo);
    return radio;
  });

  // ---- ações
  const limpar = el("button", "btn-ghost", "Limpar");
  limpar.type = "button";
  const pular = el("button", "btn-ghost", "Agora não");
  pular.type = "button";
  const enviar = el("button", "btn-primary", "Enviar avaliação");
  enviar.type = "button";
  const acoes = el("div", "presc-modal-acoes");
  acoes.append(limpar, pular, enviar);

  caixa.append(topo, dica, linhaNota, grupo, acoes);
  fundo.appendChild(caixa);

  // ---- estado -> tela
  const desabilitadaNota = () => enviando || descricao === NOTA_DESCRICAO_NAO_USOU_IA;

  function desenharNota() {
    const mostrada = previa ?? nota ?? 0;
    for (const { cheia, n } of preenchimentos) {
      cheia.style.width = mostrada >= n ? "100%" : mostrada >= n - 0.5 ? "50%" : "0";
    }
    estrelas.classList.toggle("presc-estrelas--off", desabilitadaNota());
    estrelas.setAttribute("aria-disabled", String(desabilitadaNota()));
    if (nota != null) estrelas.setAttribute("aria-valuenow", String(nota));
    else estrelas.removeAttribute("aria-valuenow");
    estrelas.setAttribute("aria-valuetext", nota == null ? "sem nota" : `${notaTexto(nota)} de 5 estrelas`);
    valorNota.textContent = descricao === NOTA_DESCRICAO_NAO_USOU_IA ? "Sem nota"
      : (previa ?? nota) == null ? "Sem nota" : `${notaTexto(previa ?? nota)} de 5`;
  }

  function desenhar() {
    desenharNota();
    for (const r of radios) { r.checked = r.value === descricao; r.disabled = enviando; }
    enviar.disabled = enviando || montarAvaliacao(nota, descricao) === null;
    enviar.textContent = enviando ? "Enviando…" : "Enviar avaliação";
    limpar.disabled = enviando || (nota == null && descricao == null);
    pular.disabled = enviando;
    fechar.disabled = enviando;
  }

  function escolherNota(valor) {
    if (desabilitadaNota()) return;
    nota = valor;
    desenhar();
  }

  // ---- fechar / enviar
  function encerrar(resultado) {
    document.removeEventListener("keydown", aoTeclar, true);
    fundo.remove();
    document.body.classList.remove("presc-modal-aberto");
    if (focoAnterior?.isConnected) focoAnterior.focus?.();
    terminar(resultado);
  }

  async function aoEnviar() {
    const corpo = montarAvaliacao(nota, descricao);
    if (!corpo || enviando) return;
    enviando = true;
    desenhar();
    try {
      const resp = await enviarAvaliacaoNota(uuidOutput, corpo);
      exibirMensagem("Avaliação enviada. Obrigado!", "sucesso");
      encerrar({
        avaliacao_nota: resp.data?.avaliacao_nota ?? null,
        avaliacao_nota_descricao: resp.data?.avaliacao_nota_descricao ?? null,
      });
    } catch (erro) {
      enviando = false;
      desenhar();                                   // continua aberto para tentar de novo
      exibirMensagem(mensagemDeErro(erro, "Não foi possível enviar a avaliação."), "erro", 5000);
    }
  }

  function aoTeclar(e) {
    if (e.key === "Escape" && !enviando) { e.preventDefault(); encerrar(null); return; }
    if (e.key !== "Tab") return;                    // mantém o foco dentro do modal
    const itens = [...caixa.querySelectorAll("button:not(:disabled), input:not(:disabled), [tabindex='0']")];
    if (!itens.length) return;
    const primeiro = itens[0];
    const ultimo = itens[itens.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    else if (!caixa.contains(document.activeElement)) { e.preventDefault(); primeiro.focus(); }
  }

  fechar.addEventListener("click", () => encerrar(null));
  pular.addEventListener("click", () => encerrar(null));
  limpar.addEventListener("click", () => { nota = null; descricao = null; desenhar(); });
  enviar.addEventListener("click", aoEnviar);
  document.addEventListener("keydown", aoTeclar, true);

  document.body.appendChild(fundo);
  document.body.classList.add("presc-modal-aberto");
  desenhar();
  estrelas.focus();
}
