import { buscarEstatistica } from "./estatisticasApi.js";

/**
 * Renderização dos blocos de gráfico (.chart-card) full-width da
 * página de estatísticas -- reusa os mesmos 4 estados dos cards
 * numéricos (loading/ok/indisponível/erro), mas o conteúdo em "ok" é
 * um canvas com Chart.js em vez de um número. Requer Chart.js já
 * carregado globalmente (script CDN no HTML).
 */

function lerVarCss(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

export function criarCardGraficoLoading(grafico) {
  const card = document.createElement("div");
  card.className = "chart-card chart-card--loading";
  card.id = `chart-card-${grafico.id}`;
  card.innerHTML = `
    <div class="chart-card-titulo">${grafico.titulo}</div>
    <div class="chart-card-skeleton"></div>
  `;
  return card;
}

function renderizarGraficoIndisponivel(card, grafico) {
  card.className = "chart-card chart-card--indisponivel";
  card.innerHTML = `
    <div class="chart-card-titulo">${grafico.titulo}</div>
    <span class="metric-card-tag">Em breve</span>
  `;
}

function renderizarGraficoErro(card, grafico, aoTentarNovamente) {
  card.className = "chart-card chart-card--erro";
  card.innerHTML = `
    <div class="chart-card-titulo">${grafico.titulo}</div>
    <button type="button" class="metric-card-retry">Tentar novamente</button>
  `;
  card.querySelector(".metric-card-retry").addEventListener("click", aoTentarNovamente);
}

function renderizarGraficoOk(card, grafico, dados) {
  card.className = "chart-card chart-card--ok";
  const canvasId = `canvas-${grafico.id}`;
  card.innerHTML = `
    <div class="chart-card-titulo">${grafico.titulo}</div>
    <div class="chart-card-canvas-wrap"><canvas id="${canvasId}"></canvas></div>
  `;

  const ctx = document.getElementById(canvasId);
  const dadosGrafico = grafico.montarDados(dados);

  const corAccent = lerVarCss("--accent") || "#5b7fe0";
  const corBorda = lerVarCss("--border") || "rgba(255,255,255,0.08)";
  const corTextoMuted = lerVarCss("--text-muted") || "#7c8792";

  if (grafico.tipo === "barra-horizontal") {
    // eslint-disable-next-line no-undef -- Chart vem do script CDN carregado no HTML
    new Chart(ctx, {
      type: "bar",
      data: {
        labels: dadosGrafico.labels,
        datasets: [{ data: dadosGrafico.valores, backgroundColor: corAccent, borderRadius: 4 }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: corBorda }, ticks: { color: corTextoMuted } },
          y: { grid: { display: false }, ticks: { color: corTextoMuted } },
        },
      },
    });
  } else if (grafico.tipo === "barra-empilhada") {
    // séries via var de status já existentes no tema (não inventa
    // cor nova) -- limitado a 4 pela paleta de status disponível
    const cores = [
      lerVarCss("--palette-status-blue") || "#5b8fe0",
      lerVarCss("--palette-status-amber") || "#e0894a",
      lerVarCss("--palette-status-green") || "#4bc17d",
      lerVarCss("--palette-status-red") || "#e05a5a",
    ];
    // eslint-disable-next-line no-undef
    new Chart(ctx, {
      type: "bar",
      data: {
        labels: dadosGrafico.labels,
        datasets: dadosGrafico.series.map((serie, i) => ({
          label: serie.nome,
          data: serie.valores,
          backgroundColor: cores[i % cores.length],
          borderRadius: 4,
        })),
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top", labels: { color: corTextoMuted } } },
        scales: {
          x: {
            stacked: true,
            max: 100,
            grid: { color: corBorda },
            ticks: { color: corTextoMuted, callback: (v) => `${v}%` },
          },
          y: { stacked: true, grid: { display: false }, ticks: { color: corTextoMuted } },
        },
      },
    });
  }
}

/**
 * Carrega e renderiza um gráfico dentro do card já presente no DOM.
 * Mesma lógica de carregarMetrica (estatisticasCards.js): gráficos
 * não implementados nunca disparam fetch.
 */
export async function carregarGrafico(grafico, card) {
  if (!grafico.implementada) {
    renderizarGraficoIndisponivel(card, grafico);
    return;
  }

  try {
    const dados = await buscarEstatistica(grafico.rota);
    renderizarGraficoOk(card, grafico, dados);
  } catch (erro) {
    console.error(`[adminEstatisticas] Erro ao carregar gráfico ${grafico.id}:`, erro);
    renderizarGraficoErro(card, grafico, () => {
      card.className = "chart-card chart-card--loading";
      card.innerHTML = `
        <div class="chart-card-titulo">${grafico.titulo}</div>
        <div class="chart-card-skeleton"></div>
      `;
      carregarGrafico(grafico, card);
    });
  }
}