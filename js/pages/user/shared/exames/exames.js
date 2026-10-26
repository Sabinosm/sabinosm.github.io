// exames.js
//
// Lista de exames para consulta/solicitação. Busca, filtros e paginação
// são resolvidos no servidor (a busca cobre o catálogo inteiro).
//
// Filtros: busca (nome pt/en ou sinônimo), tipo, material e jejum.
//
// Acesso à PÁGINA: <body data-requer="atenderClinicamente"> (médico e
// enfermeiro). O botão "Detalhes" só aparece para quem tem
// avaliarMedicamente (médico), porque GET /exames/<uuid> exige papel
// médico no back -- o enfermeiro nunca bate num 403.

import { iniciarPagina } from "../../../../sharedConfig/loaders/initPagina.js";
import { ROTAS } from "../../../../sharedConfig/loaders/rotas.js";
import { temAlguma } from "../../../../sharedConfig/userCacheHelpers/userCachePermissoes.js";
import { ApiError } from "./requisitar.js";
import {
  el, debounce, estadoVazio, renderizarPaginacao, lerEstado, salvarEstado,
} from "./listaHelpers.js";
import { listarExames, listarFiltros } from "./examesApi.js";

const POR_PAGINA = 20;
const CHAVE_ESTADO = "bion:exames:filtros";

const ROTULO_TIPO = {
  laboratorial: "Laboratorial",
  imagem: "Imagem",
  funcional: "Funcional",
  outro: "Outro",
};

// jejum: "" (todos) | "true" | "false"
const estado = { q: "", tipo: "", material: "", jejum: "", pagina: 1 };
let podeDetalhar = false;
let contadorRequisicao = 0; // descarta resposta atrasada (digitação rápida)

document.addEventListener("DOMContentLoaded", async () => {
  const ctx = await iniciarPagina();
  if (!ctx) return;
  podeDetalhar = temAlguma(ctx.permissoes, "avaliarMedicamente");

  restaurarEstado();
  aplicarEstadoNosCampos();
  configurarBusca();
  configurarFiltros();
  carregarFiltros();
  carregar();
});

// ============================================
// Estado
// ============================================
function restaurarEstado() {
  const salvo = lerEstado(CHAVE_ESTADO);
  if (!salvo || typeof salvo !== "object") return;
  const texto = (v) => (typeof v === "string" ? v : "");
  estado.q = texto(salvo.q);
  estado.tipo = texto(salvo.tipo);
  estado.material = texto(salvo.material);
  estado.jejum = ["true", "false"].includes(salvo.jejum) ? salvo.jejum : "";
  estado.pagina = Number.isInteger(salvo.pagina) && salvo.pagina > 0 ? salvo.pagina : 1;
}

function aplicarEstadoNosCampos() {
  document.getElementById("busca-exame").value = estado.q;
  document.getElementById("filtro-jejum").value = estado.jejum;
  if (estado.tipo || estado.material || estado.jejum) abrirPainelFiltros(true);
}

// ============================================
// Busca e filtros
// ============================================
function configurarBusca() {
  const input = document.getElementById("busca-exame");
  input.addEventListener("input", debounce(() => {
    estado.q = input.value.trim();
    estado.pagina = 1;
    carregar();
  }, 300));
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

  const ligar = (id, campo) => {
    document.getElementById(id)?.addEventListener("change", (e) => {
      estado[campo] = e.target.value;
      estado.pagina = 1;
      carregar();
    });
  };
  ligar("filtro-tipo", "tipo");
  ligar("filtro-material", "material");
  ligar("filtro-jejum", "jejum");

  document.getElementById("btn-limpar-filtros")?.addEventListener("click", () => {
    estado.tipo = estado.material = estado.jejum = "";
    estado.pagina = 1;
    ["filtro-tipo", "filtro-material", "filtro-jejum"].forEach((id) => {
      document.getElementById(id).value = "";
    });
    carregar();
  });
}

function preencherSelect(select, valores, rotular = (v) => v) {
  valores.forEach((valor) => {
    const opcao = document.createElement("option");
    opcao.value = valor;
    opcao.textContent = rotular(valor);
    select.appendChild(opcao);
  });
}

async function carregarFiltros() {
  try {
    const { tipos, materiais } = await listarFiltros();
    const selTipo = document.getElementById("filtro-tipo");
    const selMaterial = document.getElementById("filtro-material");

    preencherSelect(selTipo, tipos, (t) => ROTULO_TIPO[t] ?? t);
    preencherSelect(selMaterial, materiais);

    selTipo.value = estado.tipo;
    selMaterial.value = estado.material;
    // valor salvo que não existe mais: tira o filtro e recarrega
    if (selTipo.value !== estado.tipo || selMaterial.value !== estado.material) {
      estado.tipo = selTipo.value;
      estado.material = selMaterial.value;
      carregar();
    }
  } catch {
    /* sem os selects; a busca por nome continua funcionando */
  }
}

// ============================================
// Carregamento
// ============================================
async function carregar() {
  const minhaVez = ++contadorRequisicao;
  mostrarCarregando();

  try {
    const dados = await listarExames({
      q: estado.q,
      tipo: estado.tipo,
      material: estado.material,
      exigeJejum: estado.jejum === "" ? undefined : estado.jejum === "true",
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
    mostrarErro(erro instanceof ApiError ? erro.message : "Não foi possível carregar os exames.");
  }
}

// ============================================
// Renderização
// ============================================
const listaEl = () => document.getElementById("lista-exames");

function mostrarCarregando() {
  listaEl()?.replaceChildren(el("p", "empty-state-text", "Carregando exames…"));
}

function mostrarErro(texto) {
  listaEl()?.replaceChildren(estadoVazio("Não foi possível carregar", texto, "alerta"));
  document.getElementById("paginacao")?.replaceChildren();
}

function renderizar(dados) {
  const lista = listaEl();
  if (!lista) return;
  lista.replaceChildren();

  if (dados.itens.length === 0) {
    lista.appendChild(estadoVazio(
      "Nenhum exame encontrado",
      "Tente outro termo ou remova algum filtro.",
    ));
  } else {
    dados.itens.forEach((e) => lista.appendChild(criarCard(e)));
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

function descreverJejum(horas) {
  if (horas === null || horas === undefined) return null;
  return horas > 0 ? `Jejum de ${horas} h` : "Sem jejum";
}

function descreverMeta(e) {
  const partes = [
    ROTULO_TIPO[e.tipo] ?? e.tipo,
    e.material,
    descreverJejum(e.jejum_horas),
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : "Sem detalhes cadastrados";
}

function criarCard(e) {
  const card = el("article", "consult-card");

  const principal = el("div", "consult-main");
  principal.appendChild(el("h3", "consult-patient", e.nome_exame ?? "—"));
  if (e.nome_exame_en) principal.appendChild(el("p", "consult-meta", e.nome_exame_en));
  principal.appendChild(el("p", "consult-meta", descreverMeta(e)));
  card.appendChild(principal);

  if (podeDetalhar) {
    const detalhes = el("button", "btn-ghost", "Detalhes");
    detalhes.type = "button";
    detalhes.addEventListener("click", () => {
      window.location.href = `${ROTAS.examesDetalhe}?uuid=${encodeURIComponent(e.uuid)}`;
    });
    card.appendChild(detalhes);
  }

  return card;
}