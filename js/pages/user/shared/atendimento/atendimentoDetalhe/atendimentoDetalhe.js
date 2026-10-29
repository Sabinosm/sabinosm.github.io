// atendimentoDetalhe.js
//
// Entry point da página "Detalhes do atendimento" (atendimentoDetalhe.html): um resumo de como foi (ou
// é) o atendimento, com a MESMA fonte do PDF detalhado.
//
//   atendimentoDetalheApi.js    -> GET /atendimentos/<uuid>/detalhe (leitura auditada, 1 por abertura)
//   atendimentoDetalheRender.js -> uma função por seção (visão geral, queixa, sinais, binário, protocolo,
//                                  condutas, IA, prescrição, observações)
//   shared/downloadPdf.js       -> PDF do atendimento (resumo/detalhado) e da prescrição confirmada
//
// URL: ?atendimento=<uuid>&consulta=<uuid> (a consulta só serve para o "voltar"). Acesso: médico ou
// enfermeiro. Atalho da prescrição só para o dono do atendimento (o back responde 403 aos demais).

import { iniciarPagina } from "../../../../../sharedConfig/loaders/initPagina.js";
import { ROTAS } from "../../../../../sharedConfig/loaders/rotas.js";
import { criarEstadoVazio, urlDetalhe } from "../../../clinico/consulta/consultaHelpers.js";
import { el, linkPrescricao, temPrescricao } from "../../historico/historicoHelpers.js";
import { executarDownload, pdfAtendimento, pdfPrescricao } from "../../../../../shared/downloadPdf.js";
import { buscarDetalheAtendimento } from "./atendimentoDetalheApi.js";
import {
  bannerEstado, secaoBinario, secaoCondutas, secaoIA, secaoObservacoes, secaoPrescricao, secaoProtocolo,
  secaoQueixa, secaoSinais, secaoVisaoGeral,
} from "./atendimentoDetalheRender.js";

const $ = (id) => document.getElementById(id);
const params = () => new URLSearchParams(window.location.search);

document.addEventListener("DOMContentLoaded", async () => {
  await iniciarPagina();
  carregar();
});

function mostrarErro(titulo, textoErro) {
  $("det-conteudo").hidden = true;
  const caixa = $("det-erro");
  caixa.hidden = false;
  caixa.replaceChildren(criarEstadoVazio(titulo, textoErro));
  const voltar = el("a", "btn-ghost cons-btn-link", "Voltar ao histórico");
  voltar.href = ROTAS.historico ?? "historico.html";
  caixa.appendChild(voltar);
}

async function carregar() {
  const uuid = params().get("atendimento");
  if (!uuid) {
    mostrarErro("Atendimento não informado", "Abra os detalhes a partir do histórico.");
    return;
  }
  try {
    const d = await buscarDetalheAtendimento(uuid);
    desenhar(d);
  } catch (erro) {
    mostrarErro("Não foi possível abrir o atendimento", erro?.name === "ApiError" ? erro.message : "Erro inesperado.");
  }
}

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

/** PDFs do atendimento: o resumo só existe para finalizado (o back devolve 409 nos demais). */
function barraDocumentos(d) {
  const barra = el("div", "cons-panel-acoes det-acoes");
  const resumo = botao("PDF resumo");
  if (d.status === "finalizado") {
    resumo.addEventListener("click", () => executarDownload(resumo, () => pdfAtendimento(d.uuid, "resumo")));
  } else {
    resumo.disabled = true;
    resumo.title = "O resumo só existe para atendimento finalizado.";
  }
  const detalhado = botao(`PDF detalhado${d.parcial ? " (parcial)" : ""}`);
  detalhado.addEventListener("click", () => executarDownload(detalhado, () => pdfAtendimento(d.uuid, "detalhado")));
  barra.append(resumo, detalhado);
  return barra;
}

/** Botões de cada prescrição: PDF (só confirmada) e atalho para a página de prescrição (só o dono). */
function acoesDaPrescricao(d) {
  return (r) => {
    const barra = el("div", "cons-panel-acoes det-acoes");
    if (r.status === "confirmado") {
      const pdf = botao("PDF da prescrição");
      pdf.addEventListener("click", () => executarDownload(pdf, () => pdfPrescricao(r.uuid)));
      barra.appendChild(pdf);
    }
    if (d.e_meu && temPrescricao({ tipo_atendimento: d.tipo }) && d.consulta_uuid) {
      barra.appendChild(link("Abrir prescrição", linkPrescricao(d.consulta_uuid, { uuid: d.uuid })));
    }
    return barra.children.length ? barra : null;
  };
}

function desenhar(d) {
  $("det-erro").hidden = true;
  $("det-conteudo").hidden = false;

  $("det-titulo").textContent = d.tipo_rotulo;
  $("det-nome").textContent = d.paciente?.nome ?? "—";
  $("det-subtitulo").textContent =
    [d.inicio_texto ? `Iniciado em ${d.inicio_texto}` : null, d.profissional?.nome].filter(Boolean).join(" · ");
  const status = $("det-status");
  status.textContent = d.status_rotulo;
  status.className = `det-badge det-badge--${d.status}`;

  const voltar = $("det-voltar");
  voltar.href = ROTAS.historico ?? "historico.html";
  const consulta = $("det-consulta");
  consulta.hidden = !d.consulta_uuid;
  if (d.consulta_uuid) consulta.href = urlDetalhe(d.consulta_uuid);

  const corpo = $("det-corpo");
  corpo.replaceChildren();
  [
    bannerEstado(d), barraDocumentos(d), secaoVisaoGeral(d), secaoQueixa(d), secaoSinais(d), secaoBinario(d),
    secaoProtocolo(d), secaoCondutas(d), secaoIA(d), secaoPrescricao(d, acoesDaPrescricao(d)), secaoObservacoes(d),
  ].filter(Boolean).forEach((no) => corpo.appendChild(no));
}