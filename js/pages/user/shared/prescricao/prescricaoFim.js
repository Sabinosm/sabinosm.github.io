// prescricaoFim.js
//
// Fim do fluxo na página de prescrição, em ordem:
//   1. rascunho:  [Confirmar prescrição] (pede reconhecer_alertas se houver alerta) ou [Descartar]
//   2. sem rascunho (confirmada ou sem prescrição): [Finalizar atendimento]
//   3. atendimento finalizado: atalhos para a consulta e para ENCERRAR a consulta
// Sem step-up aqui (decisão: não interromper o médico durante o atendimento). O ENCERRAR da
// consulta continua na página da consulta (exige step-up e desfecho): este módulo só leva até lá.
// Quem decide é o back: aqui só se mostra a mensagem do 409 (binário incompleto, IA processando,
// rascunho pendente, atendimento fora de andamento).

import { confirmarPrescricao, descartarPrescricao } from "./prescricaoApi.js";
import { finalizarAtendimento } from "../atendimento/atendimentoApi.js";
import { el, estadoAtendimento, podeEscrever, mensagemDeErro } from "./prescricaoHelpers.js";
import { urlDetalhe, urlAtendimento } from "../../clinico/consulta/consultaHelpers.js";
import { exibirMensagem } from "../../../../shared/feedback.js";

let enviando = false;

async function executar(botao, rodar, erroPadrao) {
  if (enviando) return;
  enviando = true;
  botao.disabled = true;
  try {
    await rodar();
  } catch (erro) {
    exibirMensagem(mensagemDeErro(erro, erroPadrao), "erro");
    botao.disabled = false;
  } finally {
    enviando = false;
  }
}

function painelRascunho(resultado, { verificacao, recarregar }) {
  const painel = el("section", "cons-panel presc-bloco");
  painel.appendChild(el("h2", "cons-panel-titulo", "Concluir prescrição"));
  painel.appendChild(el("p", "field-hint",
    "Ao confirmar, você passa a responder pela prescrição e ela não pode mais ser alterada."));

  const alertas = verificacao?.alertas?.length ?? 0;
  let reconhecer = null;
  if (alertas) {
    const rotuloEl = el("label", "presc-reconhecer");
    reconhecer = el("input");
    reconhecer.type = "checkbox";
    rotuloEl.append(reconhecer, el("span", null,
      ` Revisei os ${alertas} alerta(s) de interação e quero confirmar mesmo assim.`));
    painel.appendChild(rotuloEl);
  }

  const acoes = el("div", "cons-panel-acoes");
  const confirmar = el("button", "btn-primary", "Confirmar prescrição");
  confirmar.type = "button";
  const descartar = el("button", "btn-ghost", "Descartar rascunho");
  descartar.type = "button";
  acoes.append(confirmar, descartar);
  painel.appendChild(acoes);

  if (reconhecer) {
    confirmar.disabled = true;
    reconhecer.addEventListener("change", () => { confirmar.disabled = !reconhecer.checked; });
  }

  confirmar.addEventListener("click", () => executar(confirmar, async () => {
    await confirmarPrescricao(resultado.uuid, Boolean(reconhecer?.checked));
    exibirMensagem("Prescrição confirmada.", "sucesso");
    await recarregar();
  }, "Não foi possível confirmar a prescrição."));

  // descarte em duas etapas: o primeiro clique abre o motivo (opcional)
  const area = el("div", "presc-descartar");
  area.hidden = true;
  const motivo = el("input", "field-input");
  motivo.type = "text"; motivo.maxLength = 255; motivo.placeholder = "Motivo (opcional)";
  const confirmarDescarte = el("button", "btn-ghost", "Confirmar descarte");
  confirmarDescarte.type = "button";
  area.append(motivo, confirmarDescarte);
  painel.appendChild(area);

  descartar.addEventListener("click", () => { area.hidden = !area.hidden; if (!area.hidden) motivo.focus(); });
  confirmarDescarte.addEventListener("click", () => executar(confirmarDescarte, async () => {
    await descartarPrescricao(resultado.uuid, motivo.value.trim() || null);
    exibirMensagem("Rascunho descartado.", "sucesso");
    await recarregar();
  }, "Não foi possível descartar o rascunho."));

  painel.appendChild(el("p", "field-hint",
    "Para finalizar o atendimento, confirme ou descarte o rascunho primeiro."));
  return painel;
}

function painelFinalizar(resultado, { recarregarTudo }) {
  const a = estadoAtendimento.atendimento;
  const painel = el("section", "cons-panel presc-bloco");
  painel.appendChild(el("h2", "cons-panel-titulo", "Finalizar atendimento"));
  painel.appendChild(el("p", "field-hint", resultado?.status === "confirmado"
    ? "Prescrição confirmada. Você já pode finalizar o atendimento."
    : "Não há prescrição confirmada: o atendimento será finalizado sem prescrição."));

  const rotuloEl = el("label", "field-label");
  rotuloEl.htmlFor = "presc-observacoes";
  rotuloEl.append(el("span", null, "Observações"), el("span", "field-optional", " (opcional)"));
  const obs = el("textarea", "field-input");
  obs.id = "presc-observacoes"; obs.rows = 3;
  painel.append(rotuloEl, obs);

  const acoes = el("div", "cons-panel-acoes");
  const finalizar = el("button", "btn-primary", "Finalizar atendimento");
  finalizar.type = "button";
  const voltar = el("a", "btn-ghost cons-btn-link", "Voltar ao atendimento");
  voltar.href = urlAtendimento(estadoAtendimento.consulta.uuid);
  acoes.append(finalizar, voltar);
  painel.appendChild(acoes);

  finalizar.addEventListener("click", () => executar(finalizar, async () => {
    const texto = obs.value.trim();
    await finalizarAtendimento(a.uuid, texto ? { observacoes: texto } : {});
    exibirMensagem("Atendimento finalizado.", "sucesso");
    await recarregarTudo();
  }, "Não foi possível finalizar o atendimento."));
  return painel;
}

function painelPosFinalizacao() {
  const c = estadoAtendimento.consulta;
  const painel = el("section", "cons-panel presc-bloco");
  painel.appendChild(el("h2", "cons-panel-titulo", "Atendimento finalizado"));
  const encerrada = c.status_consulta === "encerrada";
  painel.appendChild(el("p", "field-hint", encerrada
    ? "A consulta está encerrada."
    : "A consulta continua aberta. Na página da consulta você pode encerrá-la (com o desfecho) ou abrir uma reavaliação."));
  const acoes = el("div", "cons-panel-acoes");
  if (!encerrada) {
    const encerrar = el("a", "btn-primary cons-btn-link", "Encerrar consulta");
    encerrar.href = urlDetalhe(c.uuid, "encerrar");
    acoes.appendChild(encerrar);
  }
  const consulta = el("a", "btn-ghost cons-btn-link", "Ir para a consulta");
  consulta.href = urlDetalhe(c.uuid);
  acoes.appendChild(consulta);
  painel.appendChild(acoes);
  return painel;
}

/**
 * @param {HTMLElement} alvo
 * @param {object|null} resultado  em foco (rascunho, confirmado ou null)
 * @param {{verificacao:object|null, recarregar:()=>Promise<void>, recarregarTudo:()=>Promise<void>}} ctx
 */
export function renderFim(alvo, resultado, ctx) {
  alvo.replaceChildren();
  const a = estadoAtendimento.atendimento;
  if (!a) return;

  if (a.status === "finalizado") {
    alvo.appendChild(painelPosFinalizacao());
    return;
  }
  if (!podeEscrever()) return;

  alvo.appendChild(resultado?.status === "rascunho" ? painelRascunho(resultado, ctx) : painelFinalizar(resultado, ctx));
}