// examesDetalhe.js
//
// Detalhe de um exame (uuid em ?uuid=): dados do catálogo e conteúdo de
// apoio do MedlinePlus (o que é, para que serve, preparo, resultados).
//
// Página só para médico: <body data-requer="avaliarMedicamente">, igual
// ao back (GET /exames/<uuid> e /conteudo exigem papel médico).
//
// O conteúdo de apoio é texto voltado ao paciente e de base americana,
// em inglês/espanhol: a tela sempre mostra o aviso, a fonte e a
// atribuição que vêm do servidor, e o link da fonte.

import { iniciarPagina } from "../../../../sharedConfig/loaders/initPagina.js";
import { ROTAS } from "../../../../sharedConfig/loaders/rotas.js";
import { ApiError } from "./requisitar.js";
import { el, estadoVazio, formatarData } from "./listaHelpers.js";
import { buscarExame, buscarConteudoApoio } from "./examesApi.js";

const ROTULO_TIPO = {
  laboratorial: "Laboratorial",
  imagem: "Imagem",
  funcional: "Funcional",
  outro: "Outro",
};

let uuidAtual = null;

document.addEventListener("DOMContentLoaded", async () => {
  const ctx = await iniciarPagina();
  if (!ctx) return;

  document.getElementById("btn-voltar")?.addEventListener("click", () => {
    window.location.href = ROTAS.exames; // a lista restaura os filtros
  });

  uuidAtual = new URLSearchParams(window.location.search).get("uuid");
  if (!uuidAtual) {
    mostrarErro("Exame não informado.");
    document.getElementById("secao-conteudo")?.remove();
    return;
  }

  document.getElementById("idioma-conteudo")?.addEventListener("change", carregarConteudo);

  const carregou = await carregarExame();
  if (carregou) carregarConteudo();
  else document.getElementById("secao-conteudo")?.remove();
});

// ============================================
// Dados do catálogo
// ============================================
async function carregarExame() {
  document.getElementById("detalhe-conteudo")
    ?.replaceChildren(el("p", "empty-state-text", "Carregando exame…"));
  try {
    renderizarExame(await buscarExame(uuidAtual));
    return true;
  } catch (erro) {
    mostrarErro(erro instanceof ApiError ? erro.message : "Não foi possível carregar o exame.");
    return false;
  }
}

function bloco(titulo) {
  const b = el("section", "detalhe-bloco");
  b.appendChild(el("h2", null, titulo));
  return b;
}

function linha(rotulo, valor) {
  const p = el("p");
  p.append(el("strong", null, `${rotulo}: `), document.createTextNode(valor));
  return p;
}

function textoJejum(horas) {
  if (horas === null || horas === undefined) return "não informado";
  return horas > 0 ? `${horas} h` : "não precisa";
}

function renderizarExame(e) {
  document.getElementById("detalhe-titulo").textContent = e.nome_exame ?? "Exame";
  document.getElementById("detalhe-subtitulo").textContent = e.nome_exame_en ?? "";
  document.title = `B-íon — ${e.nome_exame ?? "Exame"}`;

  const area = document.getElementById("detalhe-conteudo");
  area.replaceChildren();

  const bDados = bloco("Dados do exame");
  bDados.append(
    linha("Tipo", ROTULO_TIPO[e.tipo] ?? e.tipo ?? "não informado"),
    linha("Material", e.material ?? "não informado"),
    linha("Jejum", textoJejum(e.jejum_horas)),
    linha("Código TUSS", e.codigo_tuss ?? "não informado"),
    linha("Código LOINC", e.codigo_loinc ?? "não informado"),
  );
  area.appendChild(bDados);

  const sinonimos = Array.isArray(e.sinonimos) ? e.sinonimos.filter((s) => typeof s === "string") : [];
  if (sinonimos.length) {
    const bSin = bloco("Também chamado de");
    const chips = el("div", "chip-list");
    sinonimos.forEach((s) => chips.appendChild(el("span", "chip chip--neutro", s)));
    bSin.appendChild(chips);
    area.appendChild(bSin);
  }

  if (e.observacoes) {
    const bObs = bloco("Observações");
    bObs.appendChild(el("p", null, e.observacoes));
    area.appendChild(bObs);
  }
}

function mostrarErro(texto) {
  document.getElementById("detalhe-conteudo")
    ?.replaceChildren(estadoVazio("Não foi possível carregar", texto, "alerta"));
}

// ============================================
// Conteúdo de apoio (MedlinePlus)
// ============================================
async function carregarConteudo() {
  const area = document.getElementById("lista-conteudo");
  if (!area) return;
  const idioma = document.getElementById("idioma-conteudo")?.value || "en";
  area.replaceChildren(el("p", "empty-state-text", "Carregando conteúdo de apoio…"));

  try {
    const dados = await buscarConteudoApoio(uuidAtual, idioma);
    renderizarConteudo(area, dados);
  } catch (erro) {
    area.replaceChildren(estadoVazio(
      "Não foi possível carregar o conteúdo de apoio",
      erro instanceof ApiError ? erro.message : "Tente novamente em instantes.",
      "alerta",
    ));
  }
}

/** Só abre link http(s): o endereço vem do servidor, mas nunca vira href sem checar. */
function linkSeguro(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

function renderizarConteudo(area, dados) {
  area.replaceChildren();

  if (!dados.disponivel) {
    area.appendChild(el(
      "p",
      null,
      "Ainda não há conteúdo de apoio guardado para este exame neste idioma.",
    ));
    return;
  }

  area.appendChild(el("p", "detalhe-aviso", dados.aviso ?? ""));
  area.appendChild(el("p", null, `Fonte: ${dados.fonte ?? "não informada"}`));

  dados.paginas.forEach((p) => area.appendChild(criarPagina(p)));
}

function criarPagina(p) {
  const bl = bloco(p.titulo ?? "Conteúdo");

  if (p.outros_nomes?.length) {
    const chips = el("div", "chip-list");
    p.outros_nomes.forEach((n) => chips.appendChild(el("span", "chip chip--neutro", String(n))));
    bl.appendChild(chips);
  }

  (p.secoes ?? []).forEach((s) => {
    const item = el("div", "detalhe-item");
    if (s.titulo) item.appendChild(el("strong", null, s.titulo));
    String(s.texto ?? "")
      .split(/\n+/)
      .filter((t) => t.trim())
      .forEach((t) => item.appendChild(el("p", null, t)));
    bl.appendChild(item);
  });

  const rodape = el("p");
  const href = p.url ? linkSeguro(p.url) : null;
  if (href) {
    const a = el("a", null, "Ver na fonte original");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    rodape.append(a, document.createTextNode(" · "));
  }
  rodape.append(document.createTextNode(
    `${p.atribuicao ? `${p.atribuicao} · ` : ""}Obtido em ${formatarData(p.buscado_em)}`,
  ));
  bl.appendChild(rodape);

  return bl;
}