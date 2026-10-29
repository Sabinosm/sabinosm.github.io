// atendimentoDetalheRender.js
//
// Desenha cada seção do detalhe do atendimento a partir do JSON do back (já com textos prontos).
// Sem fetch e sem estado: cada função recebe os dados e devolve um nó (ou null quando a seção não
// se aplica). A ordem e o conteúdo seguem o PDF detalhado. TUDO que vem do back entra por
// textContent (nome, queixa, explicação da IA, respostas livres do protocolo...).

import { el } from "../../historico/historicoHelpers.js";

const TRACO = "—";
export const texto = (v) => (v === null || v === undefined || v === "" ? TRACO : String(v));

/** Índices da IA vão de 0 a 1 (escala do back); em %. */
export function percentual(v) {
  const n = Number(v);
  if (v === null || v === undefined || !Number.isFinite(n)) return TRACO;
  return `${Math.round(Math.min(Math.max(n, 0), 1) * 100)}%`;
}

// ---------------------------------------------------------------- blocos
export function secao(titulo, filhos, { classe = "" } = {}) {
  const s = el("section", `cons-panel det-secao ${classe}`.trim());
  s.appendChild(el("h2", "cons-panel-titulo", titulo));
  filhos.filter(Boolean).forEach((f) => s.appendChild(f));
  return s;
}

/** Lista de pares rótulo/valor (<dl>). */
export function ficha(pares) {
  const dl = el("dl", "det-ficha");
  pares.forEach(([rotulo, valor]) => {
    const item = el("div", "det-ficha-item");
    item.append(el("dt", null, rotulo), el("dd", null, texto(valor)));
    dl.appendChild(item);
  });
  return dl;
}

/** Tabela com rolagem horizontal própria (a página nunca rola de lado). `destacar(i)` marca a linha. */
export function tabela(cabecalhos, linhas, { destacar } = {}) {
  const envolucro = el("div", "det-tabela-wrap");
  const t = el("table", "det-tabela");
  const thead = el("thead");
  const trh = el("tr");
  cabecalhos.forEach((c) => { const th = el("th", null, c); th.scope = "col"; trh.appendChild(th); });
  thead.appendChild(trh);
  const tbody = el("tbody");
  linhas.forEach((linha, i) => {
    const tr = el("tr", destacar?.(i) ? "det-linha-alerta" : "");
    linha.forEach((c) => tr.appendChild(el("td", null, texto(c))));
    tbody.appendChild(tr);
  });
  t.append(thead, tbody);
  envolucro.appendChild(t);
  return envolucro;
}

const aviso = (txt) => el("p", "field-hint", txt);
const lista = (itens) => {
  const ul = el("ul", "det-lista");
  itens.forEach((i) => ul.appendChild(el("li", null, i)));
  return ul;
};
const paragrafos = (txt) =>
  String(txt ?? "").split(/\n{2,}/).map((t) => t.trim()).filter(Boolean).map((t) => el("p", "det-texto", t));

// ---------------------------------------------------------------- avisos
export function bannerEstado(d) {
  if (d.parcial) {
    return el("div", "det-banner det-banner--parcial",
      "Atendimento em andamento: os dados podem mudar até a finalização.");
  }
  if (d.status === "cancelado") {
    return el("div", "det-banner det-banner--cancelado", `Atendimento cancelado. Motivo: ${texto(d.motivo_cancelamento)}.`);
  }
  return null;
}

// ---------------------------------------------------------------- seções
export function secaoVisaoGeral(d) {
  const p = d.paciente ?? {};
  const pr = d.profissional ?? {};
  const medidas = [p.peso != null ? `${String(p.peso).replace(".", ",")} kg` : null,
    p.altura != null ? `${p.altura} cm` : null].filter(Boolean).join(" / ");
  return secao("Visão geral", [ficha([
    ["Paciente", p.nome],
    ["Idade / sexo", [p.idade, p.sexo].filter(Boolean).join(" / ")],
    ["Peso / altura", medidas || null],
    ["Profissional", [pr.nome, pr.funcao ? `(${pr.funcao})` : null].filter(Boolean).join(" ")],
    ["Registro", pr.registro ?? "não informado"],
    ["Tipo", d.tipo_rotulo],
    ["Status", d.status_rotulo],
    ["Início", d.inicio_texto],
    ["Fim / duração", d.fim_texto ? `${d.fim_texto} (${texto(d.duracao_texto)})` : "em andamento"],
  ])]);
}

export function secaoQueixa(d) {
  const q = d.queixa ?? {};
  const vazio = !q.principal && q.sintomas_ha_horas == null && !q.avpu;
  return secao("Queixa e início dos sintomas", vazio
    ? [aviso("Queixa ainda não registrada neste atendimento.")]
    : [ficha([
      ["Queixa principal", q.principal],
      ["Sintomas há", q.sintomas_ha_horas != null ? `${q.sintomas_ha_horas} h` : null],
      ["Nível de consciência (AVPU)", q.avpu],
    ])]);
}

export function secaoSinais(d) {
  if (!d.sinais?.length) return secao("Sinais vitais", [aviso("Nenhum sinal vital registrado neste atendimento.")]);

  const grade = el("div", "det-vitais");
  (d.sinais_resumo ?? []).forEach((s) => {
    const card = el("div", `det-vital${s.fora ? " det-vital--fora" : ""}`);
    card.append(el("span", "det-vital-rotulo", s.rotulo), el("strong", "det-vital-valor", s.valor));
    // "fora do limite" também em texto: não depende só de cor
    if (s.fora) card.appendChild(el("span", "det-vital-aviso", "fora do limite esperado"));
    grade.appendChild(card);
  });

  const todas = el("details", "det-recolhivel");
  todas.appendChild(el("summary", null, `Todas as medições (${d.sinais.length})`));
  todas.appendChild(tabela(
    ["Parâmetro", "Valor", "Un.", "Sítio", "Data/hora", "Coletado por", "Validação"],
    d.sinais.map((v) => [v.rotulo, v.valor, v.unidade, v.sitio, v.quando_texto, v.por, v.validacao]),
    { destacar: (i) => d.sinais[i].fora },
  ));
  return secao("Sinais vitais", [aviso("Última medição de cada parâmetro."), grade, todas]);
}

export function secaoBinario(d) {
  if (!d.binario?.length) return null;
  const linhas = d.binario.map((b) => [
    b.rotulo, b.estado, b.origem, b.itens?.length ? b.itens.join("\n") : TRACO,
  ]);
  const t = tabela(["Seção", "Conferência", "Origem", "Registros vigentes"], linhas,
    { destacar: (i) => d.binario[i].estado_codigo === "requer-revisao" });
  t.classList.add("det-multilinha");
  return secao("Contexto clínico do paciente (conferência)", [
    t, aviso("Os registros mostram o cadastro do paciente como estava ao fim do atendimento; alterações posteriores não aparecem."),
  ]);
}

export function secaoProtocolo(d) {
  const p = d.protocolo;
  if (!p) return null;
  const blocos = [];
  if (p.versoes_anteriores_input) {
    blocos.push(aviso(`O input foi reenviado ${p.versoes_anteriores_input} vez(es); abaixo, a versão vigente (a última).`));
  }
  if (p.respostas?.length) {
    blocos.push(el("h3", "det-subtitulo", "Respostas do profissional ao protocolo"));
    blocos.push(tabela(["Campo", "Resposta"], p.respostas.map((r) => [r.campo, r.resposta])));
  }
  (p.execucoes ?? []).forEach((ex) => {
    blocos.push(el("h3", "det-subtitulo",
      `${ex.nome} · versão ${texto(ex.versao)} · execução ${texto(ex.status)} em ${texto(ex.executado_texto)}`
      + (ex.executor ? ` por ${ex.executor}` : "")));
    blocos.push(ficha([["Classificação", ex.classificacao]]));
    if (ex.trilha?.length) {
      blocos.push(tabela(["#", "Critério", "Valor observado", "Resultado"],
        ex.trilha.map((t) => [t.ordem, t.rotulo, t.valor_observado, t.resultado])));
    }
    if (ex.dados_ausentes?.length) blocos.push(aviso(`Dados ausentes: ${ex.dados_ausentes.join(", ")}`));
  });
  return secao("Protocolo aplicado", blocos);
}

export function secaoCondutas(d) {
  if (!d.condutas?.length) return null;
  return secao("Condutas de enfermagem", [tabela(
    ["Data/hora", "Autor", "Função", "Protocolo", "Conduta"],
    d.condutas.map((c) => [c.quando_texto, c.autor, c.funcao, c.protocolo, c.descricao]),
  )]);
}

export function secaoIA(d) {
  if (!d.ia?.length) return null;
  const blocos = [];
  d.ia.forEach((o) => {
    const item = el("div", "det-item");
    item.appendChild(el("p", "det-item-titulo",
      `Avaliação Bion (IA) · ${texto(o.quando_texto)} · status ${texto(o.status)}`));
    item.appendChild(el("p", "field-hint",
      `Modelo ${texto(o.modelo)} · completude ${percentual(o.completude)} · confiança ${percentual(o.confianca)}`));
    if (o.erro) item.appendChild(el("p", "field-hint det-erro", `Falha: ${o.erro}`));
    paragrafos(o.explicacao).forEach((p) => item.appendChild(p));
    if (o.perguntas?.length) {
      item.appendChild(el("p", "det-subtitulo", "Perguntas pendentes"));
      item.appendChild(lista(o.perguntas));
    }
    if (o.blocos?.length) item.appendChild(el("p", "field-hint", `Blocos considerados: ${o.blocos.join(", ")}`));
    blocos.push(item);
  });
  blocos.push(aviso("A IA apenas propõe; o médico que confirma é o responsável pela conduta."));
  return secao("Apoio de IA", blocos);
}

const SITUACAO = { confirmado: "Confirmada", rascunho: "Rascunho (não confirmada)", descartado: "Descartada" };

/**
 * Diagnóstico e prescrição. `acoes(resultado)` devolve um nó com os botões (PDF, abrir) ou null:
 * quem monta a página decide o que é permitido; aqui só se posiciona.
 */
export function secaoPrescricao(d, acoes) {
  if (!d.resultados?.length) return null;
  const blocos = d.resultados.map((r) => {
    const item = el("div", "det-item");
    item.dataset.status = r.status;
    const topo = el("div", "det-item-topo");
    topo.appendChild(el("p", "det-item-titulo", `${texto(r.descricao)} (${texto(r.cid)})`));
    const chips = el("div", "det-chips");
    [r.certeza, r.tipo, SITUACAO[r.status] ?? r.status, r.origem ? `Origem: ${r.origem}` : null]
      .filter(Boolean).forEach((c) => chips.appendChild(el("span", "det-chip", c)));
    topo.appendChild(chips);
    item.appendChild(topo);

    const hist = [`Formulado por ${texto(r.formulado_por)} em ${texto(r.formulado_texto)}`];
    if (r.status === "confirmado") hist.push(`confirmado em ${texto(r.confirmado_texto)}`);
    if (r.status === "descartado") {
      hist.push(`descartado em ${texto(r.descartado_texto)} por ${texto(r.descartado_por)}`);
      hist.push(`motivo: ${r.motivo_descarte || "não informado"}`);
    }
    if (r.consistente !== null && r.consistente !== undefined) {
      hist.push(r.consistente ? "consistente com a classificação" : "DIVERGE da classificação do protocolo");
    }
    item.appendChild(el("p", "field-hint", hist.join(" · ")));

    if (r.medicamentos?.length) {
      item.appendChild(tabela(["Medicamento", "Dose", "Frequência", "Duração", "Orientações", "Origem"],
        r.medicamentos.map((m) => [m.nome, m.dose, m.frequencia, m.duracao, m.orientacoes, m.origem])));
    }
    if (r.exames?.length) {
      item.appendChild(tabela(["Exame", "Urgência", "Justificativa", "Origem"],
        r.exames.map((x) => [x.nome, x.urgencia, x.justificativa, x.origem])));
    }
    const botoes = acoes?.(r);
    if (botoes) item.appendChild(botoes);
    return item;
  });
  return secao("Diagnóstico e prescrição", blocos);
}

export function secaoObservacoes(d) {
  const blocos = [];
  if (d.observacoes) paragrafos(d.observacoes).forEach((p) => blocos.push(p));
  if (d.habitos?.length) {
    blocos.push(el("h3", "det-subtitulo", "Hábitos"));
    blocos.push(tabela(["Hábito", "Informação"], d.habitos.map((h) => [h.campo, h.informacao])));
  }
  return blocos.length ? secao("Observações do profissional", blocos) : null;
}