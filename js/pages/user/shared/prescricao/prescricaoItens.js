// prescricaoItens.js
//
// Medicamentos e exames da prescrição, com busca embutida (sem sair da página):
//   - busca: listarMedicamentos / listarExames (catálogos que já existem), mínimo 2 letras, com debounce
//   - "Adicionar" cria o item vazio; dose/frequência/duração/orientações (ou urgência/justificativa)
//     salvam sozinhos ao sair do campo (PATCH só do campo alterado), sem re-renderizar a lista:
//     assim digitar em um campo não é interrompido pelo retorno do anterior
//   - adicionar e remover recarregam a página (recarregar) para refletir o que o back gravou
// Toda mutação passa por UMA fila (enfileirar), na ordem em que o médico fez.
// Tudo o que vem do back entra no DOM por textContent.

import {
  adicionarMedicamento, atualizarMedicamento, removerMedicamento,
  adicionarExame, atualizarExame, removerExame,
} from "./prescricaoApi.js";
import {
  el, rotulo, ORIGEM_LABELS, URGENCIA_LABELS, LIMITES, textoOuNull, mensagemDeErro,
  nomeMedicamento, nomeExame,
} from "./prescricaoHelpers.js";
import { listarMedicamentos } from "../../clinico/medicamentos/medicamentosApi.js";
import { listarExames } from "../../clinico/exames/examesApi.js";
import { exibirMensagem } from "../../../../shared/feedback.js";

const MIN_BUSCA = 2;
const POR_BUSCA = 8;

// ----------------------------------------------------------------- fila
const fila = { p: Promise.resolve() };
function enfileirar(fn) {
  const rodar = fila.p.then(fn);
  fila.p = rodar.catch(() => {});
  return rodar;
}

// ------------------------------------------------------------- pequenos
const classeOrigem = (o) => `presc-chip presc-chip--${o === "bion_ia" ? "ia" : "medico"}`;

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Campo de item com salvamento automático ao sair do campo. */
function campoItem({ titulo, tipo, valor, max, opcoes, aoSalvar }) {
  const caixa = el("div", "presc-campo");
  const rotuloEl = el("label", "field-label", titulo);
  let controle;
  if (tipo === "select") {
    controle = el("select", "field-input");
    Object.entries(opcoes).forEach(([v, t]) => controle.appendChild(new Option(t, v)));
  } else if (tipo === "textarea") {
    controle = el("textarea", "field-input");
    controle.rows = 2;
  } else {
    controle = el("input", "field-input");
    controle.type = "text";
  }
  if (max) controle.maxLength = max;
  controle.value = valor ?? "";
  const status = el("span", "presc-salvo");
  status.setAttribute("aria-live", "polite");

  let ultimo = controle.value;
  controle.addEventListener("change", async () => {
    const novo = controle.value;
    if (novo === ultimo) return;
    controle.disabled = true;
    status.textContent = "Salvando…";
    try {
      await aoSalvar(novo);
      ultimo = novo;
      status.textContent = "Salvo";
    } catch (erro) {
      controle.value = ultimo;                     // volta ao que o back tem
      status.textContent = "";
      exibirMensagem(mensagemDeErro(erro, "Não foi possível salvar a alteração."), "erro");
    } finally {
      controle.disabled = false;
    }
  });

  caixa.append(rotuloEl, controle, status);
  return caixa;
}

/** Remoção em dois cliques (o segundo confirma), para não apagar item por engano. */
function botaoRemover(aoConfirmar) {
  const b = el("button", "btn-ghost presc-remover", "Remover");
  b.type = "button";
  let armado = false;
  let timer;
  b.addEventListener("click", async () => {
    if (!armado) {
      armado = true;
      b.textContent = "Confirmar remoção";
      timer = setTimeout(() => { armado = false; b.textContent = "Remover"; }, 4000);
      return;
    }
    clearTimeout(timer);
    b.disabled = true;
    try {
      await aoConfirmar();
    } catch (erro) {
      exibirMensagem(mensagemDeErro(erro, "Não foi possível remover o item."), "erro");
      armado = false;
      b.textContent = "Remover";
      b.disabled = false;
    }
  });
  return b;
}

function cabecalhoItem(titulo, chipsTexto, item) {
  const topo = el("div", "presc-item-topo");
  topo.appendChild(el("h4", "presc-item-titulo", titulo));
  const chips = el("div", "presc-chips");
  chipsTexto.filter(Boolean).forEach((t) => chips.appendChild(el("span", "presc-chip", t)));
  const origem = el("span", classeOrigem(item.origem_sugestao), rotulo(ORIGEM_LABELS, item.origem_sugestao));
  chips.appendChild(origem);
  topo.appendChild(chips);
  return { topo, origem };
}

const sincronizarOrigem = (item, chip, dados) => {
  item.origem_sugestao = dados?.origem_sugestao ?? "medico";
  chip.textContent = rotulo(ORIGEM_LABELS, item.origem_sugestao);
  chip.className = classeOrigem(item.origem_sugestao);
};

// ------------------------------------------------------------ cartões
function cartaoMedicamento(item, resultado, ctx) {
  const card = el("article", "presc-item");
  const { topo, origem } = cabecalhoItem(nomeMedicamento(item), [item.medicamento?.classe_farmaceutica], item);
  card.appendChild(topo);

  const campos = [
    ["dose", "Dose", "input", LIMITES.itemCurto],
    ["frequencia", "Frequência", "input", LIMITES.itemCurto],
    ["duracao", "Duração", "input", LIMITES.itemCurto],
    ["orientacoes", "Orientações", "textarea", LIMITES.itemLongo],
  ];

  if (!ctx.editavel) {
    campos.forEach(([chave, titulo]) => {
      if (item[chave]) {
        const p = el("p", "presc-linha");
        p.append(el("span", "presc-linha-nome", `${titulo}: `), el("span", null, item[chave]));
        card.appendChild(p);
      }
    });
    return card;
  }

  const grade = el("div", "presc-grade");
  campos.forEach(([chave, titulo, tipo, max]) => {
    grade.appendChild(campoItem({
      titulo, tipo, max, valor: item[chave],
      aoSalvar: async (novo) => {
        const resp = await enfileirar(() =>
          atualizarMedicamento(resultado.uuid, item.uuid, { [chave]: textoOuNull(novo) }));
        item[chave] = textoOuNull(novo);
        sincronizarOrigem(item, origem, resp.data);
        ctx.aoEditado();
      },
    }));
  });
  card.appendChild(grade);
  card.appendChild(botaoRemover(async () => {
    await enfileirar(() => removerMedicamento(resultado.uuid, item.uuid));
    await ctx.recarregar();
  }));
  return card;
}

function cartaoExame(item, resultado, ctx) {
  const card = el("article", "presc-item");
  const { topo, origem } = cabecalhoItem(nomeExame(item), [item.exame?.tipo, item.exame?.material], item);
  card.appendChild(topo);

  if (!ctx.editavel) {
    const l1 = el("p", "presc-linha");
    l1.append(el("span", "presc-linha-nome", "Urgência: "), el("span", null, rotulo(URGENCIA_LABELS, item.urgencia)));
    card.appendChild(l1);
    if (item.justificativa) {
      const l2 = el("p", "presc-linha");
      l2.append(el("span", "presc-linha-nome", "Justificativa: "), el("span", null, item.justificativa));
      card.appendChild(l2);
    }
    return card;
  }

  const salvar = (chave, converter) => async (novo) => {
    const valor = converter(novo);
    const resp = await enfileirar(() => atualizarExame(resultado.uuid, item.uuid, { [chave]: valor }));
    item[chave] = valor;
    sincronizarOrigem(item, origem, resp.data);
    ctx.aoEditado();
  };

  const grade = el("div", "presc-grade");
  grade.appendChild(campoItem({
    titulo: "Urgência", tipo: "select", valor: item.urgencia, opcoes: URGENCIA_LABELS,
    aoSalvar: salvar("urgencia", (v) => v),
  }));
  grade.appendChild(campoItem({
    titulo: "Justificativa", tipo: "textarea", valor: item.justificativa, max: LIMITES.itemLongo,
    aoSalvar: salvar("justificativa", textoOuNull),
  }));
  card.appendChild(grade);
  card.appendChild(botaoRemover(async () => {
    await enfileirar(() => removerExame(resultado.uuid, item.uuid));
    await ctx.recarregar();
  }));
  return card;
}

// --------------------------------------------------------------- busca
function criarBusca({ placeholder, buscar, titulo, meta, jaAdicionado, adicionar, recarregar }) {
  const caixa = el("div", "presc-busca");
  const entrada = el("input", "field-input");
  entrada.type = "search";
  entrada.placeholder = placeholder;
  entrada.autocomplete = "off";
  entrada.setAttribute("aria-label", placeholder);
  const status = el("p", "field-hint");
  const lista = el("div", "presc-busca-lista");
  caixa.append(entrada, status, lista);

  let seq = 0;
  async function pesquisar() {
    const termo = entrada.value.trim();
    const minha = ++seq;
    lista.replaceChildren();
    if (termo.length < MIN_BUSCA) {
      status.textContent = termo ? `Digite ao menos ${MIN_BUSCA} letras.` : "";
      return;
    }
    status.textContent = "Buscando…";
    try {
      const dados = await buscar(termo);
      if (minha !== seq) return;                       // resposta atrasada de uma busca anterior
      const itens = dados?.itens ?? [];
      status.textContent = itens.length ? "" : "Nenhum resultado.";
      itens.forEach((c) => {
        const linha = el("div", "presc-busca-linha");
        const texto = el("div", "presc-busca-texto");
        texto.appendChild(el("p", "presc-item-titulo", titulo(c)));
        const m = meta(c);
        if (m) texto.appendChild(el("p", "field-hint", m));
        const botao = el("button", "btn-ghost", jaAdicionado(c) ? "Já na prescrição" : "Adicionar");
        botao.type = "button";
        botao.disabled = jaAdicionado(c);
        botao.addEventListener("click", async () => {
          botao.disabled = true;
          try {
            await enfileirar(() => adicionar(c));
            await recarregar();
          } catch (erro) {
            exibirMensagem(mensagemDeErro(erro, "Não foi possível adicionar o item."), "erro");
            botao.disabled = jaAdicionado(c);
          }
        });
        linha.append(texto, botao);
        lista.appendChild(linha);
      });
    } catch (erro) {
      if (minha !== seq) return;
      status.textContent = mensagemDeErro(erro, "Não foi possível buscar agora.");
    }
  }
  entrada.addEventListener("input", debounce(pesquisar, 300));
  return caixa;
}

const resumoMeta = (partes) => partes.filter(Boolean).join(" · ");

function secao({ titulo, vazio, itens, cartao, busca, editavel }) {
  const painel = el("section", "cons-panel presc-bloco");
  painel.appendChild(el("h2", "cons-panel-titulo", titulo));
  if (itens.length) itens.forEach((i) => painel.appendChild(cartao(i)));
  else painel.appendChild(el("p", "field-hint", vazio));
  if (editavel && busca) painel.appendChild(busca);
  return painel;
}

/**
 * @param {HTMLElement} alvo
 * @param {object|null} resultado  resultado em foco; sem ele não há itens
 * @param {{editavel:boolean, recarregar:()=>Promise<void>, aoEditado:()=>void}} ctx
 */
export function renderItens(alvo, resultado, ctx) {
  alvo.replaceChildren();
  if (!resultado) return;

  const meds = resultado.medicamentos ?? [];
  const exames = resultado.exames ?? [];

  alvo.appendChild(secao({
    titulo: "Medicamentos",
    vazio: ctx.editavel ? "Nenhum medicamento ainda. Busque abaixo para adicionar." : "Nenhum medicamento prescrito.",
    itens: meds,
    cartao: (i) => cartaoMedicamento(i, resultado, ctx),
    editavel: ctx.editavel,
    busca: criarBusca({
      placeholder: "Buscar medicamento (princípio ativo ou nome comercial)",
      buscar: (q) => listarMedicamentos({ q, porPagina: POR_BUSCA }),
      titulo: (c) => c.principio_ativo ?? "—",
      meta: (c) => resumoMeta([c.classe_farmaceutica,
        (Array.isArray(c.nomes_comerciais) ? c.nomes_comerciais : [])
          .map((n) => (typeof n === "string" ? n : n?.nome)).filter(Boolean).slice(0, 2).join(", ")]),
      jaAdicionado: (c) => meds.some((m) => m.medicamento?.uuid === c.uuid),
      adicionar: (c) => adicionarMedicamento(resultado.uuid, { uuid_catalogo: c.uuid }),
      recarregar: ctx.recarregar,
    }),
  }));

  alvo.appendChild(secao({
    titulo: "Exames",
    vazio: ctx.editavel ? "Nenhum exame ainda. Busque abaixo para adicionar." : "Nenhum exame prescrito.",
    itens: exames,
    cartao: (i) => cartaoExame(i, resultado, ctx),
    editavel: ctx.editavel,
    busca: criarBusca({
      placeholder: "Buscar exame (nome ou sinônimo)",
      buscar: (q) => listarExames({ q, porPagina: POR_BUSCA }),
      titulo: (c) => c.nome_exame ?? "—",
      meta: (c) => resumoMeta([c.tipo, c.material]),
      jaAdicionado: (c) => exames.some((e) => e.exame?.uuid === c.uuid),
      adicionar: (c) => adicionarExame(resultado.uuid, { uuid_exame: c.uuid }),
      recarregar: ctx.recarregar,
    }),
  }));
}