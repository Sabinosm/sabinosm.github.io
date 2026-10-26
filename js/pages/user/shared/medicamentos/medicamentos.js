// medicamentos.js
//
// Lista de medicamentos para consulta/prescrição. Tudo é resolvido no
// servidor (busca, filtros e paginação): a busca cobre o catálogo
// inteiro, não só a página carregada.
//
// Filtros:
//   - busca (q): princípio ativo, sinônimo ou nome comercial
//   - classe farmacêutica (select, valores vindos de /classes)
//   - indicação (uma): "o que trata ..."
//   - sem contraindicação (várias): exclui os contraindicados em qualquer uma
//
// O estado dos filtros fica em sessionStorage; o botão Voltar do detalhe
// só navega para esta página e ela restaura a busca de onde parou.
//
// Acesso: <body data-requer="atenderClinicamente"> (ver initPagina.js).

import { iniciarPagina } from "../../../../sharedConfig/loaders/initPagina.js";
import { ROTAS } from "../../../../sharedConfig/loaders/rotas.js";
import { exibirMensagem } from "../../../../shared/feedback.js";
import { ApiError } from "../exames/requisitar.js";
import {
  el, debounce, estadoVazio, renderizarPaginacao, lerEstado, salvarEstado,
} from "../exames/listaHelpers.js";
import {
  listarMedicamentos, listarClasses, sugerirIndicacoes, sugerirContraindicacoes,
} from "./medicamentosApi.js";

const POR_PAGINA = 20;
const MAX_SEM_CONTRAINDICACAO = 10; // mesmo limite do back
const CHAVE_ESTADO = "bion:medicamentos:filtros";
const MAX_COMERCIAIS_NO_CARD = 3;

// indicacao: {uuid, nome} | null    semContra: [{uuid, nome}]
const estado = { q: "", classe: "", indicacao: null, semContra: [], pagina: 1 };
let contadorRequisicao = 0; // descarta resposta atrasada (digitação rápida)

document.addEventListener("DOMContentLoaded", async () => {
  const ctx = await iniciarPagina();
  if (!ctx) return;

  restaurarEstado();
  aplicarEstadoNosCampos();
  configurarBusca();
  configurarFiltros();
  carregarClasses();
  carregar();
});

// ============================================
// Estado
// ============================================
function restaurarEstado() {
  const salvo = lerEstado(CHAVE_ESTADO);
  if (!salvo || typeof salvo !== "object") return;
  estado.q = typeof salvo.q === "string" ? salvo.q : "";
  estado.classe = typeof salvo.classe === "string" ? salvo.classe : "";
  estado.indicacao = salvo.indicacao?.uuid ? salvo.indicacao : null;
  estado.semContra = Array.isArray(salvo.semContra) ? salvo.semContra.filter((c) => c?.uuid) : [];
  estado.pagina = Number.isInteger(salvo.pagina) && salvo.pagina > 0 ? salvo.pagina : 1;
}

function aplicarEstadoNosCampos() {
  document.getElementById("busca-medicamento").value = estado.q;
  document.getElementById("filtro-indicacao").value = estado.indicacao?.nome ?? "";
  renderizarChips();
  if (estado.classe || estado.indicacao || estado.semContra.length) abrirPainelFiltros(true);
}

// ============================================
// Busca e filtros
// ============================================
function configurarBusca() {
  const input = document.getElementById("busca-medicamento");
  const aplicar = debounce(() => {
    estado.q = input.value.trim();
    estado.pagina = 1;
    carregar();
  }, 300);
  input.addEventListener("input", aplicar);
}

function abrirPainelFiltros(abrir) {
  document.getElementById("filter-panel")?.classList.toggle("filter-panel--visible", abrir);
  document.getElementById("btn-toggle-filtros")?.classList.toggle("btn-filter--active", abrir);
}

function configurarFiltros() {
  const painel = document.getElementById("filter-panel");
  document.getElementById("btn-toggle-filtros")?.addEventListener("click", () => {
    abrirPainelFiltros(!painel.classList.contains("filter-panel--visible"));
  });

  document.getElementById("filtro-classe")?.addEventListener("change", (e) => {
    estado.classe = e.target.value;
    estado.pagina = 1;
    carregar();
  });

  configurarSugestoes({
    input: document.getElementById("filtro-indicacao"),
    datalist: document.getElementById("sugestoes-indicacao"),
    buscar: sugerirIndicacoes,
    aoEscolher: (item) => {
      estado.indicacao = { uuid: item.uuid, nome: item.nome };
      estado.pagina = 1;
      carregar();
    },
    aoLimpar: () => {
      if (!estado.indicacao) return;
      estado.indicacao = null;
      estado.pagina = 1;
      carregar();
    },
  });

  const inputContra = document.getElementById("filtro-sem-contra");
  configurarSugestoes({
    input: inputContra,
    datalist: document.getElementById("sugestoes-contra"),
    buscar: sugerirContraindicacoes,
    aoEscolher: (item) => {
      inputContra.value = "";
      if (estado.semContra.some((c) => c.uuid === item.uuid)) return;
      if (estado.semContra.length >= MAX_SEM_CONTRAINDICACAO) {
        exibirMensagem(`Máximo de ${MAX_SEM_CONTRAINDICACAO} contraindicações no filtro.`, "info");
        return;
      }
      estado.semContra.push({ uuid: item.uuid, nome: item.nome });
      estado.pagina = 1;
      renderizarChips();
      carregar();
    },
  });

  document.getElementById("btn-limpar-filtros")?.addEventListener("click", () => {
    estado.classe = "";
    estado.indicacao = null;
    estado.semContra = [];
    estado.pagina = 1;
    document.getElementById("filtro-classe").value = "";
    document.getElementById("filtro-indicacao").value = "";
    document.getElementById("filtro-sem-contra").value = "";
    renderizarChips();
    carregar();
  });
}

/**
 * Autocomplete com <datalist>: busca sugestões ao digitar (2+ letras) e
 * só aplica o filtro quando o texto bate exatamente com uma sugestão.
 * Falha ao buscar sugestão é silenciosa: é conveniência, não função crítica.
 */
function configurarSugestoes({ input, datalist, buscar, aoEscolher, aoLimpar }) {
  if (!input || !datalist) return;
  const porNome = new Map(); // nome (minúsculo) -> item

  const sugerir = debounce(async () => {
    const termo = input.value.trim();
    if (termo.length < 2) return;
    try {
      const itens = await buscar(termo);
      datalist.replaceChildren();
      itens.forEach((item) => {
        porNome.set(item.nome.toLowerCase(), item);
        const opcao = document.createElement("option");
        opcao.value = item.nome;
        datalist.appendChild(opcao);
      });
    } catch {
      /* sem sugestões desta vez */
    }
  }, 250);

  input.addEventListener("input", () => {
    if (!input.value.trim()) aoLimpar?.();
    else sugerir();
  });

  input.addEventListener("change", () => {
    const item = porNome.get(input.value.trim().toLowerCase());
    if (item) aoEscolher(item);
  });
}

function renderizarChips() {
  const area = document.getElementById("chips-sem-contra");
  if (!area) return;
  area.replaceChildren();
  estado.semContra.forEach((c) => {
    const chip = el("span", "chip chip--perigo", c.nome);
    const remover = el("button", null, "×");
    remover.type = "button";
    remover.setAttribute("aria-label", `Remover ${c.nome}`);
    remover.addEventListener("click", () => {
      estado.semContra = estado.semContra.filter((x) => x.uuid !== c.uuid);
      estado.pagina = 1;
      renderizarChips();
      carregar();
    });
    chip.appendChild(remover);
    area.appendChild(chip);
  });
}

async function carregarClasses() {
  const select = document.getElementById("filtro-classe");
  if (!select) return;
  try {
    const classes = await listarClasses();
    classes.forEach((nome) => {
      const opcao = document.createElement("option");
      opcao.value = nome;
      opcao.textContent = nome;
      select.appendChild(opcao);
    });
    select.value = estado.classe;
    if (select.value !== estado.classe) {
      // a classe salva não existe mais: tira o filtro e recarrega
      estado.classe = "";
      carregar();
    }
  } catch {
    /* sem o filtro de classe; a busca continua funcionando */
  }
}

// ============================================
// Carregamento
// ============================================
async function carregar() {
  const minhaVez = ++contadorRequisicao;
  mostrarCarregando();

  try {
    const dados = await listarMedicamentos({
      q: estado.q,
      indicacao: estado.indicacao?.uuid,
      semContraindicacao: estado.semContra.map((c) => c.uuid),
      classe: estado.classe,
      pagina: estado.pagina,
      porPagina: POR_PAGINA,
    });
    if (minhaVez !== contadorRequisicao) return;

    // página além do fim (filtros mudaram): vai para a última existente
    if (dados.itens.length === 0 && dados.total > 0 && estado.pagina > 1) {
      estado.pagina = Math.max(dados.paginas, 1);
      return carregar();
    }

    salvarEstado(CHAVE_ESTADO, estado);
    renderizar(dados);
  } catch (erro) {
    if (minhaVez !== contadorRequisicao) return;

    // 404 aqui só vem de filtro por uuid que deixou de existir
    if (erro instanceof ApiError && erro.status === 404 && (estado.indicacao || estado.semContra.length)) {
      estado.indicacao = null;
      estado.semContra = [];
      estado.pagina = 1;
      aplicarEstadoNosCampos();
      exibirMensagem("Um dos filtros não existe mais e foi removido.", "info");
      return carregar();
    }

    mostrarErro(erro instanceof ApiError ? erro.message : "Não foi possível carregar os medicamentos.");
  }
}

// ============================================
// Renderização
// ============================================
function listaEl() {
  return document.getElementById("lista-medicamentos");
}

function mostrarCarregando() {
  const lista = listaEl();
  if (!lista) return;
  lista.replaceChildren(el("p", "empty-state-text", "Carregando medicamentos…"));
}

function mostrarErro(texto) {
  const lista = listaEl();
  if (!lista) return;
  lista.replaceChildren(estadoVazio("Não foi possível carregar", texto, "alerta"));
  document.getElementById("paginacao")?.replaceChildren();
}

function renderizar(dados) {
  const lista = listaEl();
  if (!lista) return;
  lista.replaceChildren();

  if (dados.itens.length === 0) {
    lista.appendChild(estadoVazio(
      "Nenhum medicamento encontrado",
      "Tente outro termo ou remova algum filtro.",
    ));
  } else {
    dados.itens.forEach((m) => lista.appendChild(criarCard(m)));
  }

  const paginacao = document.getElementById("paginacao");
  if (paginacao) {
    renderizarPaginacao(paginacao, dados, (pagina) => {
      estado.pagina = pagina;
      carregar();
      lista.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }
}

function nomesComerciais(m) {
  const bruto = Array.isArray(m.nomes_comerciais) ? m.nomes_comerciais : [];
  return bruto
    .map((n) => (typeof n === "string" ? n : n?.nome ?? ""))
    .filter(Boolean);
}

function descreverMeta(m) {
  const partes = [];
  if (m.classe_farmaceutica) partes.push(m.classe_farmaceutica);
  const comerciais = nomesComerciais(m);
  if (comerciais.length) {
    const mostrados = comerciais.slice(0, MAX_COMERCIAIS_NO_CARD).join(", ");
    const resto = comerciais.length - MAX_COMERCIAIS_NO_CARD;
    partes.push(resto > 0 ? `${mostrados} +${resto}` : mostrados);
  }
  return partes.length ? partes.join(" · ") : "Sem classe ou nome comercial cadastrado";
}

function criarCard(m) {
  const card = el("article", "consult-card");

  const principal = el("div", "consult-main");
  principal.append(
    el("h3", "consult-patient", m.principio_ativo ?? "—"),
    el("p", "consult-meta", descreverMeta(m)),
  );

  const detalhes = el("button", "btn-ghost", "Detalhes");
  detalhes.type = "button";
  detalhes.addEventListener("click", () => {
    window.location.href = `${ROTAS.medicamentosDetalhe}?uuid=${encodeURIComponent(m.uuid)}`;
  });

  card.append(principal, detalhes);
  return card;
}