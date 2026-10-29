// avaliacaoBionRender.js
//
// Desenha o output_front da avaliação. TODO texto vindo do back/IA entra no DOM
// por textContent (via el()), nunca por innerHTML: a saída da IA é dado não
// confiável. Sem fetch e sem estado: recebe o objeto e devolve um nó.

import { el, formatarDataHora } from "../atendimento/atendimentoHelpers.js";
import {
  percentual, rotulo, CERTEZA_LABELS, TIPO_PRESCRICAO_LABELS, STATUS_CONDUTA_LABELS,
} from "./avaliacaoBionHelpers.js";

const painel = (titulo) => {
  const p = el("section", "cons-panel aten-bion-bloco");
  p.appendChild(el("h3", "cons-panel-titulo", titulo));
  return p;
};

const linhaMeta = (partes) => {
  const texto = partes.filter((x) => x != null && x !== "").join(" · ");
  return texto ? el("p", "field-hint", texto) : null;
};

const paragrafos = (texto) =>
  String(texto ?? "").split(/\n{2,}/).map((t) => t.trim()).filter(Boolean).map((t) => el("p", "aten-bion-texto", t));

function lista(itens) {
  const ul = el("ul", "aten-bion-lista");
  itens.forEach((t) => ul.appendChild(el("li", null, t)));
  return ul;
}

function blocoPerguntas(perguntas) {
  const p = painel("A IA precisa de mais informações");
  p.appendChild(el("p", "field-hint",
    "Complete estes dados no atendimento e peça uma nova avaliação."));
  perguntas.forEach((q) => {
    const item = el("div", "aten-bion-item");
    item.appendChild(el("p", "aten-bion-item-titulo", q.pergunta));
    if (q.motivo) item.appendChild(el("p", "field-hint", `Por quê: ${q.motivo}`));
    if (q.bloco_relacionado) item.appendChild(el("span", "aten-bion-chip", q.bloco_relacionado));
    p.appendChild(item);
  });
  return p;
}

function itemMedicamento(m) {
  const item = el("div", "aten-bion-item");
  item.appendChild(el("p", "aten-bion-item-titulo", m.nome ?? "Medicamento"));
  const meta = linhaMeta([m.classe, m.dose, m.frequencia, m.duracao]);
  if (meta) item.appendChild(meta);
  if (m.orientacoes) item.appendChild(el("p", "aten-bion-texto", m.orientacoes));
  if (m.justificativa) item.appendChild(el("p", "field-hint", `Justificativa da IA: ${m.justificativa}`));
  return item;
}

function itemExame(e) {
  const item = el("div", "aten-bion-item");
  item.appendChild(el("p", "aten-bion-item-titulo", e.nome ?? "Exame"));
  const meta = linhaMeta([e.tipo, e.urgencia ? `urgência: ${e.urgencia}` : null]);
  if (meta) item.appendChild(meta);
  if (e.justificativa) item.appendChild(el("p", "field-hint", `Justificativa: ${e.justificativa}`));
  return item;
}

function blocoConduta(c) {
  const p = painel("Conduta proposta");
  const topo = el("div", "aten-bion-topo");
  topo.appendChild(el("span", "aten-bion-chip aten-bion-chip--destaque", rotulo(STATUS_CONDUTA_LABELS, c.status)));
  p.appendChild(topo);

  const d = c.diagnostico ?? {};
  if (d.cid10 || d.descricao) {
    const item = el("div", "aten-bion-item");
    item.appendChild(el("p", "aten-bion-item-titulo", [d.cid10, d.descricao].filter(Boolean).join(" — ")));
    const meta = linhaMeta([d.certeza ? `Certeza: ${rotulo(CERTEZA_LABELS, d.certeza)}` : null,
      c.tipo_prescricao ? `Prescrição ${rotulo(TIPO_PRESCRICAO_LABELS, c.tipo_prescricao).toLowerCase()}` : null]);
    if (meta) item.appendChild(meta);
    p.appendChild(item);
  }
  if (c.medicamentos?.length) {
    p.appendChild(el("h4", "aten-bion-subtitulo", "Medicamentos"));
    c.medicamentos.forEach((m) => p.appendChild(itemMedicamento(m)));
  }
  if (c.exames?.length) {
    p.appendChild(el("h4", "aten-bion-subtitulo", "Exames"));
    c.exames.forEach((e) => p.appendChild(itemExame(e)));
  }
  return p;
}

function blocoSemConduta(dados) {
  const p = painel("Conduta proposta");
  // O back não distingue "substituído por avaliação mais nova" de "rascunho excluído à mão":
  // o texto não afirma nenhum dos dois.
  p.appendChild(el("p", "field-hint", dados.conduta_substituida
    ? "O rascunho desta avaliação não está mais disponível (foi substituído por uma avaliação mais nova ou removido)."
    : "A IA não propôs conduta de prescrição nesta avaliação."));
  return p;
}

function blocoQualidade(dados) {
  const q = dados.qualidade ?? {};
  const p = painel("Qualidade da avaliação");
  const grade = el("div", "aten-bion-metricas");
  [["Completude dos dados", q.completude], ["Confiança da IA", q.confianca]].forEach(([nome, v]) => {
    const m = el("div", "aten-bion-metrica");
    m.appendChild(el("span", "aten-bion-metrica-valor", percentual(v)));
    m.appendChild(el("span", "field-hint", nome));
    grade.appendChild(m);
  });
  p.appendChild(grade);
  if (q.motivos?.length) {
    p.appendChild(el("h4", "aten-bion-subtitulo", "Motivos da confiança"));
    p.appendChild(lista(q.motivos));
  }
  if (dados.lacunas?.length) {
    p.appendChild(el("h4", "aten-bion-subtitulo", "Dados que faltaram no envio"));
    p.appendChild(lista(dados.lacunas));
  }
  return p;
}

/** Monta o resultado completo (DocumentFragment). `dados` = resposta do GET completo. */
export function renderResultado(dados) {
  const frag = document.createDocumentFragment();

  const data = dados.criado_em ? `Avaliação de ${formatarDataHora(dados.criado_em)}` : null;
  const cab = linhaMeta([data, "Rascunho gerado por IA: a decisão clínica é sua."]);
  if (cab) frag.appendChild(cab);

  if (dados.precisa_mais_informacao && dados.perguntas?.length) frag.appendChild(blocoPerguntas(dados.perguntas));
  frag.appendChild(dados.conduta ? blocoConduta(dados.conduta) : blocoSemConduta(dados));

  const explicacao = paragrafos(dados.explicacao);
  if (explicacao.length) {
    const p = painel("Explicação para o profissional");
    explicacao.forEach((n) => p.appendChild(n));
    frag.appendChild(p);
  }

  frag.appendChild(blocoQualidade(dados));

  if (dados.blocos_considerados?.length) {
    const p = painel("Blocos considerados");
    const linha = el("div", "aten-bion-chips");
    dados.blocos_considerados.forEach((b) => linha.appendChild(el("span", "aten-bion-chip", b)));
    p.appendChild(linha);
    frag.appendChild(p);
  }
  return frag;
}