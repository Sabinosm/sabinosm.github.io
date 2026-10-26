// medicamentosDetalhe.js
//
// Detalhe de um medicamento (uuid em ?uuid=): dados do catálogo,
// indicações, contraindicações e, só para médico, as interações.
//
// A seção de interações é declarada no HTML com data-requer="avaliarMedicamente";
// iniciarPagina() a remove para quem não é médico (o back também barra:
// GET /medicamentos/<uuid>/interacoes exige papel médico). Aqui só se
// carrega o conteúdo se a seção ainda existir.
//
// Sobre as interações: lista vazia NÃO significa ausência de interação
// clínica -- a base cobre só o que está cadastrado. Por isso o aviso de
// cobertura que vem do back é sempre exibido.

import { iniciarPagina } from "../../../../sharedConfig/loaders/initPagina.js";
import { ROTAS } from "../../../../sharedConfig/loaders/rotas.js";
import { ApiError } from "../exames/requisitar.js";
import { el, estadoVazio, formatarData } from "../exames/listaHelpers.js";
import { buscarMedicamento, listarInteracoes } from "./medicamentosApi.js";

document.addEventListener("DOMContentLoaded", async () => {
  const ctx = await iniciarPagina();
  if (!ctx) return;

  document.getElementById("btn-voltar")?.addEventListener("click", () => {
    window.location.href = ROTAS.medicamentos; // a lista restaura os filtros
  });

  const uuid = new URLSearchParams(window.location.search).get("uuid");
  if (!uuid) {
    mostrarErro("Medicamento não informado.");
    removerSecaoInteracoes();
    return;
  }

  const carregou = await carregarMedicamento(uuid);
  if (carregou && document.getElementById("secao-interacoes")) {
    carregarInteracoes(uuid);
  }
});

// ============================================
// Dados do catálogo
// ============================================
async function carregarMedicamento(uuid) {
  const area = document.getElementById("detalhe-conteudo");
  area?.replaceChildren(el("p", "empty-state-text", "Carregando medicamento…"));
  try {
    const m = await buscarMedicamento(uuid);
    renderizarMedicamento(m);
    return true;
  } catch (erro) {
    mostrarErro(erro instanceof ApiError ? erro.message : "Não foi possível carregar o medicamento.");
    removerSecaoInteracoes();
    return false;
  }
}

function bloco(titulo) {
  const b = el("section", "detalhe-bloco");
  b.appendChild(el("h2", null, titulo));
  return b;
}

function listaDeChips(textos, classeExtra = "") {
  const lista = el("div", "chip-list");
  textos.forEach((t) => lista.appendChild(el("span", `chip ${classeExtra}`.trim(), t)));
  return lista;
}

function renderizarMedicamento(m) {
  document.getElementById("detalhe-titulo").textContent = m.principio_ativo ?? "Medicamento";
  document.getElementById("detalhe-subtitulo").textContent =
    m.classe_farmaceutica ?? "Classe farmacêutica não informada";
  document.title = `B-íon — ${m.principio_ativo ?? "Medicamento"}`;

  const area = document.getElementById("detalhe-conteudo");
  area.replaceChildren();

  // nomes comerciais
  const comerciais = (Array.isArray(m.nomes_comerciais) ? m.nomes_comerciais : [])
    .map((n) => (typeof n === "string" ? n : n?.nome ?? ""))
    .filter(Boolean);
  const bNomes = bloco("Nomes comerciais");
  if (comerciais.length) bNomes.appendChild(listaDeChips(comerciais, "chip--neutro"));
  else bNomes.appendChild(el("p", null, "Nenhum nome comercial cadastrado."));

  // indicações
  const bInd = bloco("Indicações");
  const indicacoes = (m.indicacoes_terapeuticas ?? []).map((i) => i.nome);
  if (indicacoes.length) bInd.appendChild(listaDeChips(indicacoes));
  else bInd.appendChild(el("p", null, "Nenhuma indicação cadastrada."));

  // contraindicações (com a descrição, quando houver)
  const bContra = bloco("Contraindicações");
  const contras = m.contraindicacoes ?? [];
  if (contras.length) {
    contras.forEach((c) => {
      const item = el("div", "detalhe-item");
      item.appendChild(el("strong", null, c.nome));
      if (c.descricao) item.appendChild(el("p", null, c.descricao));
      bContra.appendChild(item);
    });
  } else {
    bContra.appendChild(el("p", null, "Nenhuma contraindicação cadastrada."));
  }

  // origem dos dados
  const bOrigem = bloco("Origem dos dados");
  bOrigem.appendChild(el(
    "p",
    null,
    `Fonte: ${m.fonte_origem ?? "não informada"} · Última verificação: ${formatarData(m.ultima_verificacao_em)}`,
  ));

  area.append(bNomes, bInd, bContra, bOrigem);
}

function mostrarErro(texto) {
  document.getElementById("detalhe-conteudo")
    ?.replaceChildren(estadoVazio("Não foi possível carregar", texto, "alerta"));
}

function removerSecaoInteracoes() {
  document.getElementById("secao-interacoes")?.remove();
}

// ============================================
// Interações (só médico)
// ============================================
async function carregarInteracoes(uuid) {
  const area = document.getElementById("lista-interacoes");
  if (!area) return;
  area.replaceChildren(el("p", "empty-state-text", "Carregando interações…"));

  try {
    const dados = await listarInteracoes(uuid);
    renderizarInteracoes(area, uuid, dados);
  } catch (erro) {
    area.replaceChildren(estadoVazio(
      "Não foi possível carregar as interações",
      erro instanceof ApiError ? erro.message : "Tente novamente em instantes.",
      "alerta",
    ));
  }
}

function linkMedicamento(med) {
  const a = el("a", null, med.principio_ativo ?? "—");
  a.href = `${ROTAS.medicamentosDetalhe}?uuid=${encodeURIComponent(med.uuid)}`;
  return a;
}

function renderizarInteracoes(area, uuidAtual, { interacoes, cobertura }) {
  area.replaceChildren();

  // sempre visível: lista vazia não prova ausência de interação
  area.appendChild(el("p", "detalhe-aviso", cobertura?.aviso ?? ""));

  if (!interacoes.length) {
    area.appendChild(el("p", null, "Nenhuma interação cadastrada para este medicamento."));
    return;
  }

  interacoes.forEach((i) => {
    const outro = i.medicamento_a.uuid === uuidAtual ? i.medicamento_b : i.medicamento_a;
    const item = el("div", "detalhe-item");

    const titulo = el("strong", null, "Interage com ");
    titulo.appendChild(linkMedicamento(outro));
    item.appendChild(titulo);

    const chips = el("div", "chip-list");
    chips.appendChild(el(
      "span",
      i.gravidade ? "chip chip--perigo" : "chip chip--neutro",
      i.gravidade ? `Gravidade: ${i.gravidade}` : "Gravidade não informada",
    ));
    item.appendChild(chips);

    if (i.mecanismo_efeito) item.appendChild(el("p", null, i.mecanismo_efeito));
    if (i.recomendacao) item.appendChild(el("p", null, `Recomendação: ${i.recomendacao}`));
    if (i.acao) item.appendChild(el("p", null, `Conduta sugerida pela fonte: ${i.acao}`));
    if (i.fonte_origem) {
      item.appendChild(el("p", null, `Fonte: ${i.fonte_origem} · verificada em ${formatarData(i.ultima_verificacao_em)}`));
    }

    area.appendChild(item);
  });
}