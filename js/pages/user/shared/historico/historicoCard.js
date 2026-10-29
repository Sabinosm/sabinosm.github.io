// historicoCard.js
//
// Card de uma consulta no histórico + linha do tempo dos atendimentos (carregada só ao expandir).
//
//   [chip status] paciente · início · origem · desfecho                    (badge: atendimento em andamento)
//   [Continuar] [Abrir consulta] [PDF resumo] [PDF detalhado] [Atendimentos ▾]
//   └ linha do tempo: tipo · status · profissional · início → fim (duração)
//        [Detalhes*] [Prescrição] [PDF resumo] [PDF detalhado]      * quando a página de detalhe existir
//
// Regras: "Continuar" só quando o back diz que dá (pode_continuar) e leva à página certa; "PDF resumo"
// de atendimento só habilitado se finalizado (o back devolve 409 nos demais); "Prescrição" só para o
// dono do atendimento (o back responde 403 aos outros). Tudo que vem do back entra por textContent.

import {
  criarChipStatus, formatarDataHora, label, nomePaciente, urlDetalhe, ORIGEM_LABELS, DESFECHO_LABELS,
} from "../../clinico/consulta/consultaHelpers.js";
import { listarAtendimentosDaConsulta } from "./historicoApi.js";
import { executarDownload, pdfAtendimento, pdfConsulta } from "../../../../shared/downloadPdf.js";
import { exibirMensagem } from "../../../../shared/feedback.js";
import {
  el, ACAO_LABELS, FUNCAO_LABELS, MOTIVO_BLOQUEIO_LABELS, STATUS_ATENDIMENTO_LABELS, TIPO_ATENDIMENTO_LABELS,
  duracaoTexto, ehMeu, humanizar, linkPrescricao, resumoDisponivel, temPrescricao, urlAtendimentoDetalhe, urlContinuar,
} from "./historicoHelpers.js";

function botao(texto, classe = "btn-ghost") {
  const b = el("button", classe, texto);
  b.type = "button";
  return b;
}

function link(texto, href, classe = "btn-ghost") {
  const a = el("a", `${classe} cons-btn-link`, texto);
  a.href = href;
  return a;
}

// ---------------------------------------------------------------- timeline
function itemAtendimento(a, consulta) {
  const item = el("li", "hist-atend");
  item.dataset.status = a.status;

  const topo = el("div", "hist-atend-topo");
  topo.appendChild(el("strong", null, label(TIPO_ATENDIMENTO_LABELS, a.tipo_atendimento)));
  topo.appendChild(el("span", `hist-badge hist-badge--${a.status}`, label(STATUS_ATENDIMENTO_LABELS, a.status)));
  item.appendChild(topo);

  const p = a.profissional;
  const quem = p ? `${p.nome_completo}${p.funcao_clinica ? ` (${label(FUNCAO_LABELS, p.funcao_clinica)})` : ""}` : null;
  const duracao = duracaoTexto(a.data_hora_inicio, a.data_hora_fim);
  const quando = a.data_hora_fim
    ? `${formatarDataHora(a.data_hora_inicio)} → ${formatarDataHora(a.data_hora_fim)}${duracao ? ` (${duracao})` : ""}`
    : `${formatarDataHora(a.data_hora_inicio)} → em andamento`;
  item.appendChild(el("p", "hist-meta", [quem, quando].filter(Boolean).join(" · ")));
  if (a.status === "cancelado" && a.motivo_cancelamento) {
    item.appendChild(el("p", "hist-meta", `Motivo do cancelamento: ${humanizar(a.motivo_cancelamento)}`));
  }

  const acoes = el("div", "hist-acoes");
  const detalhe = urlAtendimentoDetalhe(consulta.uuid, a.uuid);
  if (detalhe) acoes.appendChild(link("Detalhes", detalhe));
  if (temPrescricao(a) && ehMeu(a)) acoes.appendChild(link("Prescrição", linkPrescricao(consulta.uuid, a)));

  const resumo = botao("PDF resumo");
  if (resumoDisponivel(a)) {
    resumo.addEventListener("click", () => executarDownload(resumo, () => pdfAtendimento(a.uuid, "resumo")));
  } else {
    resumo.disabled = true;
    resumo.title = "O resumo só existe para atendimento finalizado.";
  }
  const detalhado = botao("PDF detalhado");
  detalhado.addEventListener("click", () => executarDownload(detalhado, () => pdfAtendimento(a.uuid, "detalhado")));
  acoes.append(resumo, detalhado);
  item.appendChild(acoes);
  return item;
}

async function carregarTimeline(consulta, alvo) {
  alvo.replaceChildren(el("p", "hist-meta", "Carregando atendimentos…"));
  try {
    const resp = await listarAtendimentosDaConsulta(consulta.uuid);
    const itens = resp.data ?? [];
    if (!itens.length) {
      alvo.replaceChildren(el("p", "hist-meta", "Esta consulta ainda não tem atendimentos."));
      return true;
    }
    const lista = el("ol", "hist-timeline");
    itens.forEach((a) => lista.appendChild(itemAtendimento(a, consulta)));
    alvo.replaceChildren(lista);
    return true;
  } catch (erro) {
    const aviso = el("p", "hist-meta hist-erro", erro?.name === "ApiError" ? erro.message : "Não foi possível carregar os atendimentos.");
    const tentar = botao("Tentar de novo");
    tentar.addEventListener("click", () => carregarTimeline(consulta, alvo));
    alvo.replaceChildren(aviso, tentar);
    return false;
  }
}

// -------------------------------------------------------------------- card
export function criarCardHistorico(c) {
  const card = el("article", "consult-card hist-card");

  const main = el("div", "consult-main");
  const { texto, especial } = nomePaciente(c);
  main.appendChild(el("h3", especial ? "consult-patient cons-nome--especial" : "consult-patient", texto));

  const partes = [`Início ${formatarDataHora(c.data_hora_inicio)}`, label(ORIGEM_LABELS, c.origem_encaminhamento)];
  if (c.status_consulta === "encerrada") {
    if (c.data_hora_fim) partes.push(`Fim ${formatarDataHora(c.data_hora_fim)}`);
    if (c.desfecho_final) partes.push(`Desfecho: ${label(DESFECHO_LABELS, c.desfecho_final)}`);
  }
  main.appendChild(el("p", "consult-meta", partes.join(" · ")));

  const em = c.atendimento_em_andamento;
  if (em) {
    const badges = el("div", "cons-badges");
    badges.appendChild(el("span", "hist-badge hist-badge--em-andamento",
      `${label(TIPO_ATENDIMENTO_LABELS, em.tipo_atendimento)} em andamento${em.meu ? " (seu)" : ""}`));
    main.appendChild(badges);
  }
  if (!c.pode_continuar && c.motivo_bloqueio && c.status_consulta !== "encerrada") {
    main.appendChild(el("p", "hist-meta", label(MOTIVO_BLOQUEIO_LABELS, c.motivo_bloqueio)));
  }
  card.append(criarChipStatus(c.status_consulta), main);

  // ---- ações
  const acoes = el("div", "hist-acoes hist-acoes--card");
  if (c.pode_continuar && c.proxima_acao) {
    acoes.appendChild(link(label(ACAO_LABELS, c.proxima_acao), urlContinuar(c), "btn-primary"));
  }
  acoes.appendChild(link("Abrir consulta", urlDetalhe(c.uuid)));
  const resumo = botao("PDF resumo");
  resumo.addEventListener("click", () => executarDownload(resumo, () => pdfConsulta(c.uuid, "resumo")));
  const detalhado = botao("PDF detalhado");
  detalhado.addEventListener("click", () => executarDownload(detalhado, () => pdfConsulta(c.uuid, "detalhado")));
  const expandir = botao("Atendimentos ▾");
  expandir.setAttribute("aria-expanded", "false");
  acoes.append(resumo, detalhado, expandir);
  card.appendChild(acoes);

  // ---- linha do tempo (carrega na primeira abertura; "Tentar de novo" cobre falha)
  const painel = el("div", "hist-painel");
  painel.hidden = true;
  card.appendChild(painel);
  let carregado = false;
  expandir.addEventListener("click", async () => {
    const abrir = painel.hidden;
    painel.hidden = !abrir;
    expandir.setAttribute("aria-expanded", String(abrir));
    expandir.textContent = abrir ? "Atendimentos ▴" : "Atendimentos ▾";
    if (abrir && !carregado) {
      carregado = await carregarTimeline(c, painel);
      if (!carregado) exibirMensagem("Não foi possível carregar os atendimentos desta consulta.", "erro");
    }
  });
  return card;
}