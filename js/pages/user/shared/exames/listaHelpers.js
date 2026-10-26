// listaHelpers.js
//
// Pequenos helpers comuns às listas clínicas (medicamentos e exames):
// criação de elementos (sempre com textContent, sem innerHTML com dado
// de API), debounce, estado vazio, paginação numerada e guarda dos
// filtros em sessionStorage (para o "Voltar" do detalhe não perder a busca).

const NS_SVG = "http://www.w3.org/2000/svg";

/** Cria um elemento com classe e texto (textContent: seguro contra XSS). */
export function el(tag, classe, texto) {
  const no = document.createElement(tag);
  if (classe) no.className = classe;
  if (texto !== undefined && texto !== null) no.textContent = texto;
  return no;
}

export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Marcação SVG estática (nenhum dado de API entra aqui).
const ICONES = {
  busca:
    '<circle cx="11" cy="11" r="7" stroke-linecap="round"/><path d="M21 21l-4.3-4.3" stroke-linecap="round"/>',
  alerta:
    '<circle cx="12" cy="12" r="9" stroke-linecap="round"/><path d="M12 8v5M12 16h.01" stroke-linecap="round" stroke-linejoin="round"/>',
  anterior: '<path d="M15 6l-6 6 6 6" stroke-linecap="round" stroke-linejoin="round"/>',
  proxima: '<path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/>',
};

function criarSvg(nome, classe, espessura = 2) {
  const svg = document.createElementNS(NS_SVG, "svg");
  if (classe) svg.setAttribute("class", classe);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", String(espessura));
  svg.innerHTML = ICONES[nome];
  return svg;
}

/** Bloco de "nada para mostrar" / "erro". icone: "busca" | "alerta". */
export function estadoVazio(titulo, texto, icone = "busca") {
  const div = el("div", "empty-state");
  div.append(
    criarSvg(icone, "empty-state-icon", 1.5),
    el("p", "empty-state-title", titulo),
    el("p", "empty-state-text", texto),
  );
  return div;
}

function botaoPagina(icone, rotulo, desabilitado, aoClicar) {
  const btn = el("button", "page-btn");
  btn.type = "button";
  btn.setAttribute("aria-label", rotulo);
  btn.disabled = desabilitado;
  btn.appendChild(criarSvg(icone));
  btn.addEventListener("click", aoClicar);
  return btn;
}

/**
 * Paginação com total (o back devolve pagina, paginas e total).
 * @param {HTMLElement} container
 * @param {{pagina:number, paginas:number, total:number}} dados
 * @param {(pagina:number)=>void} irPara
 */
export function renderizarPaginacao(container, { pagina, paginas, total }, irPara) {
  container.replaceChildren();

  const info = el(
    "span",
    "pagination-info",
    total === 0
      ? "Nenhum resultado"
      : `Página ${pagina} de ${Math.max(paginas, 1)} · ${total} ${total === 1 ? "resultado" : "resultados"}`,
  );

  const controles = el("div", "pagination-controls");
  controles.append(
    botaoPagina("anterior", "Página anterior", pagina <= 1, () => irPara(pagina - 1)),
    botaoPagina("proxima", "Próxima página", pagina >= paginas, () => irPara(pagina + 1)),
  );

  container.append(info, controles);
}

// ---- estado dos filtros (sessionStorage; falha silenciosa) ----

export function lerEstado(chave) {
  try {
    return JSON.parse(sessionStorage.getItem(chave));
  } catch {
    return null;
  }
}

export function salvarEstado(chave, valor) {
  try {
    sessionStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* modo privado / cota cheia: o filtro só não sobrevive à navegação */
  }
}

/** Data ISO -> "dd/mm/aaaa"; "—" se vazia ou inválida. */
export function formatarData(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}