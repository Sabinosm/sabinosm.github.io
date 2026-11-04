// prescricao.js
//
// Entry point da página de Prescrição (prescricao.html). Reúne tudo: carrega consulta, atendimento
// e prescrições, mantém o estado e entrega cada bloco a um módulo de tela:
//
//   prescricaoApi.js         -> fetch (espelha os blueprints em /v1/api/prescricoes)
//   prescricaoHelpers.js     -> estado, rótulos dos enums, validação, links
//   prescricaoModo.js        -> escolha IA x manual (avaliação médica / reavaliação), com troca a qualquer momento
//   prescricaoIa.js          -> "Prescrever com IA": pede, acompanha e MOSTRA a avaliação (explicação, perguntas,
//                               qualidade). Reaproveita a pasta avaliacaoBion/; a antiga aba "Avaliação IA" do
//                               atendimento não existe mais
//   prescricaoDiagnostico.js -> CID-10, certeza e tipo (criar manual / corrigir / resumo)
//   prescricaoItens.js       -> medicamentos e exames, com busca embutida
//   prescricaoAlertas.js     -> interações medicamentosas + cobertura
//   prescricaoFim.js         -> confirmar/descartar, finalizar atendimento, atalho para encerrar consulta
//   prescricaoDocumentos.js  -> baixar em PDF a prescrição e o atendimento (shared/downloadPdf.js)
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
import { listarDoAtendimento, buscarAlertas, descartarPrescricao } from "./prescricaoApi.js";
import {
  el, estadoAtendimento, estadoPrescricao, podeEscrever, podeEditar, uuidConsultaDaUrl, uuidAtendimentoDaUrl,
  escolherAtual, historicoDe, iaPodeGerar, mensagemDeErro, rotulo,
  STATUS_LABELS, ORIGEM_LABELS, CERTEZA_LABELS,
} from "./prescricaoHelpers.js";
import { renderDiagnostico } from "./prescricaoDiagnostico.js";
import { renderItens } from "./prescricaoItens.js";
import { renderAlertas } from "./prescricaoAlertas.js";
import { renderFim } from "./prescricaoFim.js";
import { renderDocumentos } from "./prescricaoDocumentos.js";
import { renderIA, retomarIA, cancelarIA, iaOcupada, iaIniciada } from "./prescricaoIa.js";
import { renderModo } from "./prescricaoModo.js";
import { tipoComAvaliacaoBion } from "../avaliacaoBion/avaliacaoBionHelpers.js";
import { exibirMensagem } from "../../../../shared/feedback.js";

const $ = (id) => document.getElementById(id);
let seq = 0;             // descarta resposta atrasada (recarregou no meio)
let primeiraCarga = true;
let modo = null;             // "ia" | "manual" | null (ainda não escolheu). Só existe em avaliação médica/reavaliação

/** Há escolha IA x manual: tipo com avaliação por IA, médico dono, atendimento em andamento. */
const temModos = () => tipoComAvaliacaoBion(estadoAtendimento.atendimento) && podeEscrever();
const modoDoRascunho = (r) => (r?.origem_sugestao === "bion_ia" ? "ia" : "manual");

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

    // Prescrição só existe em avaliação médica / reavaliação (triagem e demais tipos não prescrevem).
    if (!tipoComAvaliacaoBion(atendimento)) {
      mostrarErro("Prescrição não disponível", "Este tipo de atendimento não tem prescrição.");
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

  // Já existe rascunho e o médico ainda não escolheu (reabriu a página): o modo vem da origem do rascunho.
  // Fixado uma vez: editar um rascunho da IA muda a origem para "medico", mas o modo não pula sozinho.
  const atual = estadoPrescricao.atual;
  if (modo === null && temModos() && atual?.status === "rascunho") modo = modoDoRascunho(atual);
  renderTudo();

  if (atual?.status === "rascunho" && atual.medicamentos?.length) await carregarAlertas(minha, atual.uuid);

  if (primeiraCarga) {
    primeiraCarga = false;
    if (temModos() && atual?.status !== "confirmado") {
      // modo IA: volta ao estado da avaliação (em andamento / pronta / falhou);
      // senão só retoma se houver avaliação em curso (e então abre o modo IA).
      if (modo === "ia") retomarIA();
      else retomarIA({ soSeProcessando: true });
    }
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
  ["presc-modo", "presc-banner", "presc-ia", "presc-diag", "presc-itens", "presc-alertas", "presc-fim", "presc-docs", "presc-historico"]
    .forEach((id) => $(id).replaceChildren());
}

/**
 * O editor (diagnóstico + medicamentos/exames) aparece:
 *  - sem escolha de modo (triagem, não-dono...): sempre, como antes;
 *  - prescrição confirmada: sempre (resumo);
 *  - modo manual: sempre (sem rascunho mostra o formulário de criação);
 *  - modo IA: só quando já existe rascunho (o da IA, para revisar); antes disso só o painel da IA;
 *  - nada escolhido ainda: só os cartões de escolha.
 */
function editorVisivel() {
  if (!temModos()) return true;
  const atual = estadoPrescricao.atual;
  if (atual?.status === "confirmado") return true;
  if (modo === "manual") return true;
  return modo === "ia" && Boolean(atual);
}

function renderTudo() {
  const atual = estadoPrescricao.atual;
  const ctx = {
    editavel: podeEditar(atual),
    recarregar,
    aoEditado,
  };

  desenharModo();
  desenharBanner();
  desenharIA();

  if (editorVisivel()) {
    renderDiagnostico($("presc-diag"), atual, {
      uuidAtendimento: estadoAtendimento.atendimento.uuid,
      editavel: atual ? podeEditar(atual) : podeEscrever(),
      recarregar,
      aoEditado,
    });
    renderItens($("presc-itens"), atual, ctx);
  } else {
    $("presc-diag").replaceChildren();
    $("presc-itens").replaceChildren();
  }
  desenharAlertasEFim();
  renderDocumentos($("presc-docs"), atual);
  desenharHistorico();
}

// ---------------------------------------------------------------- modo IA x manual
function desenharModo() {
  const alvo = $("presc-modo");
  const confirmada = estadoPrescricao.atual?.status === "confirmado";
  if (!temModos() || confirmada) { alvo.replaceChildren(); return; }
  renderModo(alvo, { modo, bloqueado: iaOcupada(), aoEscolher: escolherModo });
}

function escolherModo(novo) {
  if (novo === modo || (novo === "manual" && iaOcupada())) return;
  modo = novo;
  renderTudo();
  // primeira vez no modo IA: pergunta ao back em que pé está a avaliação (e mostra a última, se houver)
  if (novo === "ia" && !iaIniciada()) retomarIA();
}

/** Troca manual -> IA com rascunho do médico em aberto: o back recusa (409), então descarta antes. */
async function descartarParaUsarIA() {
  const atual = estadoPrescricao.atual;
  if (atual?.status !== "rascunho") return;
  if (!window.confirm("Descartar o rascunho atual para gerar uma nova prescrição com a IA? "
    + "O descarte fica registrado e não pode ser desfeito.")) return;
  try {
    await descartarPrescricao(atual.uuid, null);
    exibirMensagem("Rascunho descartado.", "sucesso");
    await recarregar();
  } catch (erro) {
    exibirMensagem(mensagemDeErro(erro, "Não foi possível descartar o rascunho."), "erro");
  }
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
        exibirMensagem("A IA terminou sem propor prescrição. Veja a explicação e as perguntas abaixo.", "sucesso");
      }
    },
    visivel: temModos() && modo === "ia" && atual?.status !== "confirmado",
    bloqueado: !iaPodeGerar(atual),                    // rascunho do médico em aberto
    temRascunhoIA: atual?.status === "rascunho" && atual.origem_sugestao === "bion_ia",
    aoDescartarRascunho: descartarParaUsarIA,
    aoMudarFase: desenharModo,                         // o alternador trava enquanto a IA trabalha
    aoRetomarProcessando: () => {                      // reabriu a página com avaliação em curso
      if (modo !== "ia") { modo = "ia"; renderTudo(); }
    },
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