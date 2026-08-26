import { REGISTRY_METRICAS, REGISTRY_GRAFICOS } from "./estatisticasRegistry.js";
import { criarCardLoading, carregarMetrica } from "./estatisticasCards.js";
import { criarCardGraficoLoading, carregarGrafico } from "./estatisticasGraficos.js";

/**
 * Orquestração da página de estatísticas: abas por categoria, lazy
 * load (só busca dados da categoria quando ela entra em foco) e
 * bootstrap inicial. A definição de cada métrica/gráfico está em
 * estatisticasRegistry.js; a renderização de cada tipo de card está
 * em estatisticasCards.js e estatisticasGraficos.js.
 */

// Categorias já carregadas nesta sessão de página -- evita refazer
// fetch toda vez que o usuário troca de aba e volta.
const categoriasCarregadas = new Set();

/**
 * Popula e carrega todas as métricas (cards numéricos + gráficos) de
 * uma categoria. Chamado na primeira vez que a aba/seção entra em
 * foco (lazy load real: as outras categorias nunca disparam
 * requisição enquanto não forem abertas).
 */
function iniciarCardsCategoria(categoria) {
  if (categoriasCarregadas.has(categoria)) return;
  categoriasCarregadas.add(categoria);

  const grid = document.getElementById(`grid-${categoria}`);
  if (grid) {
    const metricas = REGISTRY_METRICAS.filter((m) => m.categoria === categoria);
    metricas.forEach((metrica) => {
      const card = criarCardLoading(metrica);
      grid.appendChild(card);
      carregarMetrica(metrica, card);
    });
  }

  const containerGraficos = document.getElementById(`graficos-${categoria}`);
  if (containerGraficos) {
    const graficos = REGISTRY_GRAFICOS.filter((g) => g.categoria === categoria);
    graficos.forEach((grafico) => {
      const card = criarCardGraficoLoading(grafico);
      containerGraficos.appendChild(card);
      carregarGrafico(grafico, card);
    });
  }
}

/**
 * Configura a troca de abas: mostra o painel selecionado, esconde os
 * demais, e dispara o carregamento (lazy) da categoria correspondente.
 */
function iniciarAbas() {
  const abas = document.querySelectorAll(".stat-tab");

  abas.forEach((aba) => {
    aba.addEventListener("click", () => {
      const categoria = aba.dataset.categoria;

      abas.forEach((a) => {
        a.classList.toggle("stat-tab--active", a === aba);
        a.setAttribute("aria-selected", a === aba ? "true" : "false");
      });

      document.querySelectorAll(".stat-panel").forEach((painel) => {
        const ativo = painel.id === `painel-${categoria}`;
        painel.classList.toggle("stat-panel--active", ativo);
        painel.hidden = !ativo;
      });

      iniciarCardsCategoria(categoria);
    });
  });
}

export function iniciarPaginaEstatisticas() {
  iniciarAbas();
  // Resumo executivo (categoria E) fica sempre visível no topo,
  // então carrega de cara -- não espera clique de aba.
  iniciarCardsCategoria("resumo-executivo");
  // Primeira aba (Atendimentos) já começa ativa no HTML, então
  // carrega junto.
  iniciarCardsCategoria("atendimentos");
}