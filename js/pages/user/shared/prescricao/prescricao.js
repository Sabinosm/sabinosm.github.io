// prescricao.js
//
// Entry point da página de Prescrição (prescricao.html). Reúne tudo: carrega consulta, atendimento
// e prescrições, mantém o estado e entrega cada bloco a um módulo de tela:
//
//   prescricaoApi.js         -> fetch (espelha os blueprints em /v1/api/prescricoes)
//   prescricaoHelpers.js     -> estado, rótulos dos enums, validação, links
//   prescricaoIA.js          -> "Gerar com a IA" (reaproveita a pasta atendimento/avaliacaoBion/)
//   prescricaoDiagnostico.js -> CID-10, certeza e tipo (criar manual / corrigir / resumo)
//   prescricaoItens.js       -> medicamentos e exames, com busca embutida
//   prescricaoAlertas.js     -> interações medicamentosas + cobertura
//   prescricaoFim.js         -> confirmar/descartar, finalizar atendimento, atalho para encerrar consulta
//
// Dois caminhos, UM mesmo objeto: no modo manual o front cria o rascunho (POST); no modo IA o back
// já gravou o rascunho (origem 'bion_ia') e o front só o lê (GET da lista). Dali em diante é o
// mesmo editor, confirmar e finalizar. Qualquer alteração do médico passa a prescrição a ser dele
// (o back troca a origem; o banner daqui acompanha).
//
// O acesso é declarado no <body> de prescricao.html: data-requer="avaliarMedicamente" (só médico).
// Quem pode escrever (dono + atendimento em andamento) o front só espelha; o back é a cerca.

import { iniciarPagina } from "../../../../sharedConfig/loaders/initPagina.js";
import { buscarConsulta } from "../../clinico/consulta/consultaApi.js";
import {
  criarChipStatus, criarEstadoVazio, formatarDataHora, nomePaciente, urlAtendimento, urlLista, urlDetalhe,
} from "../../clinico/consulta/consultaHelpers.js";
import { listarAtendimentosDaConsulta } from "../atendimento/atendimentoApi.js";
import { TIPOS_ATENDIMENTO_LABELS, souDono } from "../atendimento/atendimentoHelpers.js";
import { listarDoAtendimento, buscarAlertas } from "./prescricaoApi.js";
import {
  el, estadoAtendimento, estadoPrescricao, podeEscrever, podeEditar, uuidConsultaDaUrl, uuidAtendimentoDaUrl,
  escolherAtual, historicoDe, iaPodeGerar, mensagemDeErro, rotulo,
  STATUS_LABELS, ORIGEM_LABELS, CERTEZA_LABELS,
} from "./prescricaoHelpers.js";
import { renderDiagnostico } from "./prescricaoDiagnostico.js";
import { renderItens } from "./prescricaoItens.js";
import { renderAlertas } from "./prescricaoAlertas.js";
import { renderFim } from "./prescricaoFim.js";
import { renderIA, retomarIA, cancelarIA } from "./prescricaoIA.js";
import { exibirMensagem } from "../../../../shared/feedback.js";

const $ = (id) => document.getElementById(id);
let seq = 0;             // descarta resposta atrasada (recarregou no meio)
let primeiraCarga = true;

document.addEventListener("DOMContentLoaded", async () => {
  await iniciarPagina();
  carregarPagina();
});

// ============================================
// Carregamento
// ============================================
async function carregarPagina() {
  const uuidConsulta = uuidConsultaDaUrl();
  const uuidAtendimento = uuidAtendimentoDaUrl();
  if (!uuidConsulta || !uuidAtendimento) {
    mostrarErro("Atendimento não informado", "Abra a prescrição a partir do atendimento.");
    return;
  }

  const minha = ++seq;
  try {
    const [rConsulta, rAtendimentos] = await Promise.all([
      buscarConsulta(uuidConsulta),
      listarAtendimentosDaConsulta(uuidConsulta),
    ]);
    if (minha !== seq) return;

    const atendimento = (rAtendimentos.data ?? []).find((a) => a.uuid === uuidAtendimento);
    if (!atendimento) {
      mostrarErro("Atendimento não encontrado", "Este atendimento não pertence à consulta informada.");
      return;
    }

    // Mesmo estado compartilhado do atendimento: podeEscrever()/souDono() funcionam aqui também.
    estadoAtendimento.consulta = rConsulta.data;
    estadoAtendimento.atendimento = atendimento;
    estadoAtendimento.somenteLeitura = atendimento.status !== "em-andamento" || !souDono();

    desenharCabecalho();
    if (!souDono()) {                 // o back responde 403 aos demais: nem chama
      limparBlocos();
      return;
    }
    await carregarResultados(minha);
  } catch (erro) {
    if (minha !== seq) return;
    mostrarErro("Não foi possível carregar a prescrição", mensagemDeErro(erro, "Erro inesperado."));
  }
}

/** Relê só as prescrições (depois de qualquer escrita) e redesenha os blocos. */
async function carregarResultados(minha = ++seq) {
  const resp = await listarDoAtendimento(estadoAtendimento.atendimento.uuid);
  if (minha !== seq) return;

  estadoPrescricao.resultados = resp.data ?? [];
  estadoPrescricao.atual = escolherAtual(estadoPrescricao.resultados);
  estadoPrescricao.verificacao = null;
  renderTudo();

  const atual = estadoPrescricao.atual;
  if (atual?.status === "rascunho" && atual.medicamentos?.length) await carregarAlertas(minha, atual.uuid);

  if (primeiraCarga) {                // avaliação pedida na aba do atendimento e ainda em curso
    primeiraCarga = false;
    if (podeEscrever() && iaPodeGerar(estadoPrescricao.atual)) retomarIA();
  }
}

async function carregarAlertas(minha, uuidResultado) {
  try {
    const resp = await buscarAlertas(uuidResultado);
    estadoPrescricao.verificacao = resp.data;
  } catch {
    estadoPrescricao.verificacao = {
      alertas: [], cobertura: { aviso: "Não foi possível verificar as interações agora.", escopo: [] },
    };
  }
  if (minha !== seq || estadoPrescricao.atual?.uuid !== uuidResultado) return;
  desenharAlertasEFim();
}

const recarregar = async () => {
  try {
    await carregarResultados();
  } catch (erro) {
    mostrarErro("Não foi possível atualizar a prescrição", mensagemDeErro(erro, "Erro inesperado."));
  }
};

// ============================================
// Renderização
// ============================================
function mostrarErro(titulo, texto) {
  cancelarIA();
  $("presc-conteudo").hidden = true;
  const caixa = $("presc-erro");
  caixa.hidden = false;
  caixa.replaceChildren(criarEstadoVazio(titulo, texto));

  const uuidConsulta = uuidConsultaDaUrl();
  const voltar = el("a", "btn-ghost cons-btn-link", "Voltar");
  voltar.href = uuidConsulta ? urlDetalhe(uuidConsulta) : urlLista();
  caixa.appendChild(voltar);
}

function desenharCabecalho() {
  const c = estadoAtendimento.consulta;
  const a = estadoAtendimento.atendimento;

  $("presc-conteudo").hidden = false;
  $("presc-erro").hidden = true;

  const { texto, especial } = nomePaciente(c);
  const titulo = $("presc-nome");
  titulo.textContent = texto;
  titulo.classList.toggle("cons-nome--especial", especial);
  $("presc-subtitulo").textContent =
    `${TIPOS_ATENDIMENTO_LABELS[a.tipo_atendimento] ?? a.tipo_atendimento} · iniciado em ${formatarDataHora(a.data_hora_inicio)}`;
  $("presc-chip-status").replaceChildren(criarChipStatus(c.status_consulta));
  $("presc-voltar").href = urlAtendimento(c.uuid);

  const leitura = estadoAtendimento.somenteLeitura;
  $("presc-banner-leitura").hidden = !leitura;
  if (leitura) {
    $("presc-banner-leitura-texto").textContent = !souDono()
      ? "Somente o profissional que abriu o atendimento acessa a prescrição."
      : "Atendimento fora de andamento: a prescrição está em modo de leitura.";
  }
}

function limparBlocos() {
  ["presc-banner", "presc-ia", "presc-diag", "presc-itens", "presc-alertas", "presc-fim", "presc-historico"]
    .forEach((id) => $(id).replaceChildren());
}

function renderTudo() {
  const atual = estadoPrescricao.atual;
  const ctx = {
    editavel: podeEditar(atual),
    recarregar,
    aoEditado,
  };

  desenharBanner();
  desenharIA();

  renderDiagnostico($("presc-diag"), atual, {
    uuidAtendimento: estadoAtendimento.atendimento.uuid,
    editavel: atual ? podeEditar(atual) : podeEscrever(),
    recarregar,
    aoEditado,
  });
  renderItens($("presc-itens"), atual, ctx);
  desenharAlertasEFim();
  desenharHistorico();
}

function desenharAlertasEFim() {
  const atual = estadoPrescricao.atual;
  renderAlertas($("presc-alertas"), estadoPrescricao.verificacao, atual);
  renderFim($("presc-fim"), atual, {
    verificacao: estadoPrescricao.verificacao,
    recarregar,
    recarregarTudo: carregarPagina,
  });
}

function desenharIA() {
  const atual = estadoPrescricao.atual;
  renderIA({
    alvo: $("presc-ia"),
    uuidAtendimento: estadoAtendimento.atendimento.uuid,
    aoConcluir: async () => {
      await recarregar();
      if (estadoPrescricao.atual?.status !== "rascunho") {   // a IA terminou, mas não propôs prescrição
        exibirMensagem(
          "A IA terminou sem propor prescrição. Veja a explicação e as perguntas na aba Avaliação IA do atendimento.",
          "sucesso");
      }
    },
    visivel: podeEscrever() && atual?.status !== "confirmado" && iaPodeGerar(atual),
    temRascunhoIA: atual?.status === "rascunho" && atual.origem_sugestao === "bion_ia",
    urlAvaliacao: urlAtendimento(estadoAtendimento.consulta.uuid),
  });
}

/** O médico mexeu (campo de item ou diagnóstico): o back já trocou a origem; acompanhamos sem recarregar. */
function aoEditado() {
  const atual = estadoPrescricao.atual;
  if (atual?.status === "rascunho") atual.origem_sugestao = "medico";
  desenharBanner();
  desenharIA();
}

function desenharBanner() {
  const alvo = $("presc-banner");
  alvo.replaceChildren();
  const a = estadoPrescricao.atual;
  if (!a) return;

  const caixa = el("div", "presc-banner");
  if (a.status === "rascunho" && a.origem_sugestao === "bion_ia") {
    caixa.appendChild(el("strong", null, "Rascunho gerado pela IA. "));
    caixa.appendChild(el("span", null,
      "Revise com atenção: qualquer alteração sua passa a prescrição a ser sua."));
  } else if (a.status === "rascunho") {
    caixa.appendChild(el("strong", null, "Rascunho do médico. "));
    caixa.appendChild(el("span", null, "Ainda não confirmado: confirme ou descarte para poder finalizar o atendimento."));
  } else {
    const quando = a.confirmado_em ? ` em ${formatarDataHora(a.confirmado_em)}` : "";
    caixa.appendChild(el("strong", null, `Prescrição confirmada${quando}. `));
    caixa.appendChild(el("span", null, `Origem do conteúdo: ${rotulo(ORIGEM_LABELS, a.origem_sugestao)}.`));
  }
  alvo.appendChild(caixa);
}

function desenharHistorico() {
  const alvo = $("presc-historico");
  alvo.replaceChildren();
  const outros = historicoDe(estadoPrescricao.resultados, estadoPrescricao.atual);
  if (!outros.length) return;

  const detalhes = el("details", "cons-panel presc-bloco presc-historico");
  detalhes.appendChild(el("summary", "presc-historico-titulo", `Outras prescrições deste atendimento (${outros.length})`));
  outros.forEach((r) => {
    const item = el("div", "presc-item");
    const topo = el("div", "presc-item-topo");
    topo.appendChild(el("h4", "presc-item-titulo",
      [r.codigo_cid10_principal, r.descricao_cid10_principal].filter(Boolean).join(" — ") || "Prescrição"));
    const chips = el("div", "presc-chips");
    chips.appendChild(el("span", "presc-chip", rotulo(STATUS_LABELS, r.status)));
    chips.appendChild(el("span", "presc-chip", rotulo(ORIGEM_LABELS, r.origem_sugestao)));
    topo.appendChild(chips);
    item.appendChild(topo);

    const quando = r.status === "descartado" ? r.descartado_em : (r.confirmado_em ?? r.data_hora_formulacao);
    const partes = [
      quando ? formatarDataHora(quando) : null,
      `Certeza: ${rotulo(CERTEZA_LABELS, r.certeza_diagnostica)}`,
      `${r.medicamentos?.length ?? 0} medicamento(s), ${r.exames?.length ?? 0} exame(s)`,
    ].filter(Boolean).join(" · ");
    item.appendChild(el("p", "field-hint", partes));
    if (r.motivo_descarte) item.appendChild(el("p", "presc-texto", `Motivo do descarte: ${r.motivo_descarte}`));
    detalhes.appendChild(item);
  });
  alvo.appendChild(detalhes);
}