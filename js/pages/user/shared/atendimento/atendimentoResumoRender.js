// atendimentoResumoRender.js
//
// Resumo de CONFERÊNCIA do atendimento (aba Finalizar e página de prescrição): o profissional revê
// o que informou e o resultado do protocolo antes de finalizar. Sem fetch e sem estado: recebe o JSON
// do GET /atendimentos/<uuid>/detalhe e devolve nós. TUDO que vem do back entra por textContent.
//
// Ordem:
//   1. "Resumo da prescrição"  -> só quando há prescrição CONFIRMADA
//   2. "Resumo do atendimento" -> paciente, queixa, sinais, contexto clínico, protocolo (com o
//                                 significado do resultado), condutas e observações
//
// Regra: o que não foi informado NÃO aparece (nada de "—" nem "Nenhum dado..."). Exceções que
// mudam a leitura e por isso aparecem: seção do contexto clínico "requer revisão" e resultado
// de protocolo parcial (dados faltando).

import { el } from "../historico/historicoHelpers.js";
import { ficha, tabela, secao, secaoPrescricao } from "./atendimentoDetalhe/atendimentoDetalheRender.js";

const CLASSIFICACAO_MULTIPLOS = "multiplos-resultados";
const humanizar = (s) => String(s).replace(/[_-]+/g, " ");
const tem = (v) => v !== null && v !== undefined && String(v).trim() !== "";
const pares = (lista) => lista.filter(([, v]) => tem(v));
const sub = (t) => el("h3", "det-subtitulo", t);
const aviso = (t) => el("p", "field-hint", t);

// ---------------------------------------------------------------- prescrição
function blocoPrescricao(d) {
  const confirmadas = (d.resultados ?? []).filter((r) => r.status === "confirmado");
  if (!confirmadas.length) return null;
  const no = secaoPrescricao({ ...d, resultados: confirmadas }, null);
  const titulo = no?.querySelector("h2");
  if (titulo) titulo.textContent = "Resumo da prescrição";
  return no;
}

// ---------------------------------------------------------------- partes do atendimento
function partePaciente(d) {
  const p = d.paciente ?? {};
  const medidas = [p.peso != null ? `${String(p.peso).replace(".", ",")} kg` : null,
    p.altura != null ? `${p.altura} cm` : null].filter(Boolean).join(" / ");
  const itens = pares([
    ["Paciente", p.nome],
    ["Idade / sexo", [p.idade, p.sexo].filter(Boolean).join(" / ")],
    ["Peso / altura", medidas],
  ]);
  return itens.length ? [sub("Paciente"), ficha(itens)] : [];
}

function parteQueixa(d) {
  const q = d.queixa ?? {};
  const itens = pares([
    ["Queixa principal", q.principal],
    ["Sintomas há", q.sintomas_ha_horas != null ? `${q.sintomas_ha_horas} h` : null],
    ["Nível de consciência (AVPU)", q.avpu],
  ]);
  return itens.length ? [sub("Queixa"), ficha(itens)] : [];
}

function parteSinais(d) {
  if (!d.sinais_resumo?.length) return [];
  const grade = el("div", "det-vitais");
  d.sinais_resumo.forEach((s) => {
    const card = el("div", `det-vital${s.fora ? " det-vital--fora" : ""}`);
    card.append(el("span", "det-vital-rotulo", s.rotulo), el("strong", "det-vital-valor", s.valor));
    if (s.fora) card.appendChild(el("span", "det-vital-aviso", "fora do limite esperado"));
    grade.appendChild(card);
  });
  return [sub("Sinais vitais (última medição)"), grade];
}

function parteContexto(d) {
  const secoes = d.binario ?? [];
  const comRegistro = secoes.filter((b) => b.itens?.length);
  const nega = secoes.filter((b) => b.estado_codigo === "nega" && !b.itens?.length);
  const revisar = secoes.filter((b) => b.estado_codigo === "requer-revisao");
  const nos = [];
  if (comRegistro.length) nos.push(ficha(comRegistro.map((b) => [b.rotulo, b.itens.join("; ")])));
  if (nega.length) nos.push(aviso(`Nega: ${nega.map((b) => b.rotulo.toLowerCase()).join(", ")}.`));
  if (revisar.length) {
    nos.push(el("p", "resumo-alerta",
      `Requer revisão: ${revisar.map((b) => b.rotulo.toLowerCase()).join(", ")}.`));
  }
  return nos.length ? [sub("Contexto clínico do paciente"), ...nos] : [];
}

// ---------------------------------------------------------------- protocolo
function execucao(ex) {
  const nos = [];
  const status = ex.status === "incompleta" ? " · resultado parcial" : "";
  nos.push(el("h3", "det-subtitulo", `${ex.nome} · versão ${ex.versao}${status}`));

  const classificacao = tem(ex.classificacao) && ex.classificacao !== CLASSIFICACAO_MULTIPLOS
    ? humanizar(ex.classificacao) : null;
  const linhas = pares([
    ["Classificação", classificacao],
    ["Escore total", ex.escore_total],
  ]);
  if (linhas.length) nos.push(ficha(linhas));
  if (ex.override_disparado) {
    nos.push(aviso("Regra de override aplicada: um parâmetro isolado elevou a classificação."));
  }

  // composto: um resultado por módulo (só os calculados)
  const modulos = (ex.modulos ?? []).filter((m) => tem(m.saida));
  if (modulos.length) {
    nos.push(tabela(["Módulo", "Resultado", "Observação"],
      modulos.map((m) => [m.sigla, humanizar(m.saida), m.motivo ?? ""])));
  }
  (ex.alertas ?? []).forEach((a) => {
    nos.push(el("p", "resumo-alerta",
      [`Alerta: ${a.modulo}`, a.classificacao ? humanizar(a.classificacao) : null, a.motivo].filter(Boolean).join(" · ")));
  });

  // significado do resultado
  if (tem(ex.acao_recomendada)) {
    const c = el("div", "resumo-significado");
    c.append(el("strong", null, "O que fazer: "), document.createTextNode(ex.acao_recomendada));
    nos.push(c);
  }
  const expl = ex.explicacao;
  if (tem(expl?.como_interpretar)) {
    const c = el("div", "resumo-significado resumo-significado--neutro");
    c.append(el("strong", null, "Como interpretar: "), document.createTextNode(expl.como_interpretar));
    nos.push(c);
  }
  if (tem(expl?.o_que_e) || tem(expl?.quando_usar)) {
    const det = el("details", "det-recolhivel");
    det.appendChild(el("summary", null, "Sobre este protocolo"));
    if (tem(expl.o_que_e)) det.appendChild(el("p", "det-texto", `O que é: ${expl.o_que_e}`));
    if (tem(expl.quando_usar)) det.appendChild(el("p", "det-texto", `Quando usar: ${expl.quando_usar}`));
    nos.push(det);
  }
  if (ex.trilha?.length) {
    const det = el("details", "det-recolhivel");
    det.appendChild(el("summary", null, "Como o resultado foi calculado"));
    det.appendChild(tabela(["#", "Critério", "Valor observado", "Resultado"],
      ex.trilha.map((t) => [t.ordem, t.rotulo, t.valor_observado, t.resultado])));
    nos.push(det);
  }
  // incompleto: o resultado pode estar subestimado, então avisa (único caso em que "ausente" aparece)
  if (ex.status === "incompleta" || ex.resultado_parcial) {
    const faltou = ex.dados_ausentes?.length ? ` Faltou: ${ex.dados_ausentes.join(", ")}.` : "";
    nos.push(el("p", "resumo-alerta", `Resultado parcial: pode estar subestimado.${faltou}`));
  }
  return nos;
}

function parteProtocolo(d) {
  const p = d.protocolo;
  if (!p?.execucoes?.length) return [];
  const nos = [sub("Execução do protocolo")];
  p.execucoes.forEach((ex) => nos.push(...execucao(ex)));
  const respostas = (p.respostas ?? []).filter((r) => tem(r.resposta));
  if (respostas.length) {
    const det = el("details", "det-recolhivel");
    det.appendChild(el("summary", null, `Respostas ao protocolo (${respostas.length})`));
    det.appendChild(tabela(["Campo", "Resposta"], respostas.map((r) => [r.campo, r.resposta])));
    nos.push(det);
  }
  return nos;
}

function parteCondutas(d) {
  if (!d.condutas?.length) return [];
  const ul = el("ul", "det-lista");
  d.condutas.forEach((c) => {
    ul.appendChild(el("li", null,
      [c.autor, c.funcao ? `(${c.funcao})` : null].filter(Boolean).join(" ") + `: ${c.descricao}`));
  });
  return [sub("Condutas de enfermagem"), ul];
}

function parteObservacoes(d) {
  return tem(d.observacoes) ? [sub("Observações do profissional"), el("p", "det-texto", d.observacoes)] : [];
}

// ---------------------------------------------------------------- API do módulo
/** @returns {DocumentFragment} blocos do resumo (vazio se não houver nada a mostrar). */
export function renderResumo(d) {
  const frag = document.createDocumentFragment();
  const presc = blocoPrescricao(d);
  if (presc) frag.appendChild(presc);

  const partes = [partePaciente, parteQueixa, parteSinais, parteContexto, parteProtocolo, parteCondutas, parteObservacoes]
    .flatMap((f) => f(d));
  if (partes.length) frag.appendChild(secao("Resumo do atendimento", partes));
  return frag;
}
