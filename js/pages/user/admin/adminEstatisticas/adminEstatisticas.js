import { URL_BASE_API } from "../../../../config.js";
import { animarOdometro, animarSetaTendencia } from "../../estatisticasAnimacoes.js";

/**
 * Registry central: cada entrada descreve uma métrica da página de
 * estatísticas. Isso é a "estrutura pronta para caber mesmo sem ter"
 * -- adicionar uma métrica nova é só adicionar uma entrada aqui, sem
 * mexer no HTML ou na lógica de renderização.
 *
 * campos:
 *  - id: usado no DOM (metric-<id>) e como key de cache
 *  - categoria: qual grid ela populasse (bate com o data-categoria das abas)
 *  - rota: caminho sob /estatisticas (sem barra inicial de query)
 *  - label: texto abaixo do valor
 *  - extrairValor(dados): como pegar o valor de exibição a partir do `data`
 *  - implementada: false = nunca dispara fetch, cai direto no estado
 *    "indisponível". Lista única de features bloqueadas (B3, E1, E4);
 *    quando destravar no backend, é só virar `true`.
 */
const REGISTRY_METRICAS = [
  // ===== Resumo executivo (categoria E) =====
  {
    id: "e1-indice-qualidade",
    categoria: "resumo-executivo",
    rota: "/geral/indice-qualidade", // placeholder -- rota real ainda não definida (depende de B3)
    label: "Índice de qualidade total",
    implementada: false,
  },
  {
    id: "e2-tendencia-eficiencia",
    categoria: "resumo-executivo",
    rota: "/atendimentos/tendencia-eficiencia",
    label: "Tendência de eficiência",
    implementada: true,
    extrairValor: (d) => formatarPercentual(d?.variacao_percentual),
    // campos usados só pelo odômetro (ver estatisticasAnimacoes.js) --
    // valor numérico cru, sem formatação, pra animar de 0 até ele
    animacao: {
      valorNumerico: (d) => d?.variacao_percentual,
      sufixo: "%",
      casasDecimais: 1,
    },
  },
  {
    id: "e3-correlacao",
    categoria: "resumo-executivo",
    rota: "/ia/correlacao-completude-confianca",
    label: "Correlação completude × confiança",
    implementada: true,
    extrairValor: (d) => (typeof d?.coeficiente === "number" ? `r = ${d.coeficiente}` : "—"),
    animacao: {
      valorNumerico: (d) => d?.coeficiente,
      prefixo: "r = ",
      casasDecimais: 2,
    },
  },
  {
    id: "e4-alerta-epidemiologico",
    categoria: "resumo-executivo",
    rota: "/epidemiologico/alerta-composto", // placeholder -- critério "composto" ainda não definido
    label: "Alerta epidemiológico composto",
    implementada: false,
  },

  // ===== Atendimentos (categoria A) =====
  {
    id: "a1-volume",
    categoria: "atendimentos",
    rota: "/atendimentos/volume",
    label: "Volume de atendimentos",
    implementada: true,
    extrairValor: (d) => (typeof d?.total_periodo === "number" ? d.total_periodo : "—"),
  },
  {
    id: "a2-tempo-medio",
    categoria: "atendimentos",
    rota: "/atendimentos/tempo-medio",
    label: "Tempo médio de atendimento",
    implementada: true,
    // O array `por_tipo` não vem ordenado por relevância -- o back
    // (estatisticas_atendimentos.py) escolhe o tipo "principal" por
    // maior `total` só para montar a `leitura`, mas devolve o array
    // cru. Replicamos aqui o mesmo critério (maior total), em vez de
    // pegar por_tipo[0], que dependeria da ordem não garantida do
    // banco.
    extrairValor: (d) => {
      const porTipo = d?.por_tipo ?? [];
      if (porTipo.length === 0) return "—";
      const principal = porTipo.reduce((maior, atual) => (atual.total > maior.total ? atual : maior));
      return principal.media_formatada ?? "—";
    },
    extrairLabel: (d) => {
      const porTipo = d?.por_tipo ?? [];
      if (porTipo.length === 0) return "Tempo médio de atendimento";
      const principal = porTipo.reduce((maior, atual) => (atual.total > maior.total ? atual : maior));
      return `Tempo médio (${principal.tipo_atendimento})`;
    },
  },
  {
    id: "a3-taxa-conclusao",
    categoria: "atendimentos",
    rota: "/atendimentos/taxa-conclusao",
    label: "Taxa de conclusão",
    implementada: true,
    extrairValor: (d) => formatarPercentual(d?.percentual),
  },
  {
    id: "a4-efetivo",
    categoria: "atendimentos",
    rota: "/equipe/efetivo",
    label: "Efetivo ativo por papel",
    implementada: true,
    extrairValor: (d) => {
      const porPapel = d?.por_papel ?? {};
      const total = Object.values(porPapel).reduce((s, n) => s + n, 0);
      return total > 0 ? total : "—";
    },
  },
  {
    id: "a5-engajamento",
    categoria: "atendimentos",
    rota: "/equipe/engajamento",
    label: "Profissionais inativos (7d)",
    implementada: true,
    extrairValor: (d) => (typeof d?.total_inativos === "number" ? d.total_inativos : "—"),
  },

  // ===== Desempenho da IA (categoria B) =====
  {
    id: "b1-confianca",
    categoria: "ia",
    rota: "/ia/confianca-media",
    label: "Confiança média da IA",
    implementada: true,
    extrairValor: (d) => formatarPercentual(d?.media),
  },
  {
    id: "b2-completude",
    categoria: "ia",
    rota: "/ia/completude-media",
    label: "Completude média dos dados",
    implementada: true,
    extrairValor: (d) => formatarPercentual(d?.media),
  },
  {
    id: "b3-concordancia",
    categoria: "ia",
    rota: "/ia/concordancia-medico", // placeholder -- falta feedback_medico no model
    label: "Concordância médico × IA",
    implementada: false,
  },
  {
    id: "b4-versoes",
    categoria: "ia",
    rota: "/ia/versoes-em-uso",
    label: "Versão de IA predominante",
    implementada: true,
    extrairValor: (d) => {
      const versoes = d?.versoes ?? [];
      if (versoes.length === 0) return "—";
      const predominante = versoes.reduce((maior, atual) => (atual.total > maior.total ? atual : maior));
      return predominante.versao_modelo_ia ?? "—";
    },
  },

  // ===== Panorama regional (categoria C) =====
  {
    id: "c3-incidencia",
    categoria: "epidemiologico",
    rota: "/epidemiologico/incidencia-regiao",
    label: "Maior incidência (por 100 mil hab.)",
    implementada: true,
    extrairValor: (d) => {
      const top = d?.ranking?.[0];
      return top ? `${top.incidencia_por_100mil} / 100k` : "—";
    },
  },
  {
    id: "c4-tempo-busca",
    categoria: "epidemiologico",
    rota: "/epidemiologico/tempo-ate-atendimento",
    label: "Tempo médio até buscar atendimento",
    implementada: true,
    extrairValor: (d) => (typeof d?.media_horas === "number" ? `${d.media_horas}h` : "—"),
  },

  // ===== Medicamentos e alergias (categoria D) =====
  {
    id: "f4-gravidade-alergias",
    categoria: "medicamentos",
    rota: "/alergias/gravidade-geral",
    label: "Reações classificadas como graves",
    implementada: true,
    extrairValor: (d) => {
      const porGravidade = d?.por_gravidade ?? {};
      const total = Object.values(porGravidade).reduce((s, n) => s + n, 0);
      return total > 0 ? formatarPercentual((porGravidade.grave / total) * 100) : "—";
    },
  },

  // ===== Perfil de pacientes (categoria F) =====
  {
    id: "f2-uso-continuo",
    categoria: "pacientes",
    rota: "/pacientes/uso-continuo-medicacao",
    label: "Pacientes em uso contínuo de medicação",
    implementada: true,
    extrairValor: (d) => formatarPercentual(d?.percentual),
  },
  {
    id: "f3-tipo-sanguineo",
    categoria: "pacientes",
    rota: "/pacientes/tipo-sanguineo",
    label: "Tipo sanguíneo mais comum",
    implementada: true,
    extrairValor: (d) => {
      const dist = d?.distribuicao ?? {};
      const entradas = Object.entries(dist);
      if (entradas.length === 0) return "—";
      return entradas.reduce((maior, atual) => (atual[1] > maior[1] ? atual : maior))[0];
    },
  },
];

function formatarPercentual(valor) {
  return typeof valor === "number" ? `${valor}%` : "—";
}

/**
 * Registry de blocos de gráfico -- métricas cuja resposta é uma lista
 * ou matriz, e que perdem informação se forem reduzidas a um único
 * número num metric-card (ver discussão sobre D2/D3: comparar
 * percentuais de grupos diferentes num só card resumido confunde
 * mais do que ajuda). Cada entrada aqui vira um bloco full-width
 * dentro do grid da categoria, com seu próprio Chart.js.
 */
const REGISTRY_GRAFICOS = [
  {
    id: "d2-top-alergias",
    categoria: "medicamentos",
    rota: "/alergias/top-substancias",
    titulo: "Substâncias alérgenas mais reportadas",
    tipo: "barra-horizontal",
    implementada: true,
    // ranking já vem ordenado desc pelo back; limitamos a 8 pra não
    // esticar o card verticalmente demais
    montarDados: (d) => {
      const ranking = (d?.ranking ?? []).slice(0, 8);
      return {
        labels: ranking.map((r) => r.substancia),
        valores: ranking.map((r) => r.total),
      };
    },
  },
  {
    id: "d3-urgencia-exames",
    categoria: "medicamentos",
    rota: "/exames/urgencia-por-origem",
    titulo: "Urgência de exames — IA vs. profissional",
    tipo: "barra-empilhada",
    implementada: true,
    // matriz cruza urgencia x origem_sugestao; agrupamos por
    // urgencia (eixo Y) com uma série por origem (empilhada), assim
    // cada percentual continua comparável dentro do seu próprio
    // grupo -- em vez do card resumido que misturava as 4 linhas.
    montarDados: (d) => {
      const matriz = d?.matriz ?? [];
      const categoriasUrgencia = [...new Set(matriz.map((m) => m.urgencia))];
      const origens = [...new Set(matriz.map((m) => m.origem_sugestao))];

      const series = origens.map((origem) => ({
        nome: origem,
        valores: categoriasUrgencia.map((urgencia) => {
          const item = matriz.find((m) => m.urgencia === urgencia && m.origem_sugestao === origem);
          return item?.percentual ?? 0;
        }),
      }));

      return { labels: categoriasUrgencia, series };
    },
  },
  {
    id: "c1-top-cid-regiao",
    categoria: "epidemiologico",
    rota: "/epidemiologico/top-cid-regiao",
    titulo: "Doenças mais comuns por região",
    tipo: "barra-horizontal",
    implementada: true,
    // cada linha do ranking já é um par (CID, região) específico --
    // rotulamos com os dois juntos, senão a mesma doença em regiões
    // diferentes vira barras sem distinção (mesmo cuidado do D3: não
    // esconder a dimensão que dá sentido ao número).
    montarDados: (d) => {
      const ranking = (d?.ranking ?? []).slice(0, 8);
      return {
        labels: ranking.map((r) => `${r.descricao_cid10} (${r.regiao})`),
        valores: ranking.map((r) => r.total),
      };
    },
  },
  {
    id: "c5-queixas",
    categoria: "epidemiologico",
    rota: "/epidemiologico/queixas-frequentes",
    titulo: "Queixas principais mais frequentes",
    tipo: "barra-horizontal",
    implementada: true,
    montarDados: (d) => {
      const termos = (d?.termos ?? []).slice(0, 8);
      return {
        labels: termos.map((t) => t.termo),
        valores: termos.map((t) => t.total),
      };
    },
  },
  {
    id: "d4-top-classe",
    categoria: "medicamentos",
    rota: "/medicamentos/top-por-classe",
    titulo: "Medicamentos mais prescritos por classe",
    tipo: "barra-horizontal",
    implementada: true,
    montarDados: (d) => {
      const ranking = (d?.ranking ?? []).slice(0, 8);
      return {
        labels: ranking.map((r) => r.classe_farmaceutica),
        valores: ranking.map((r) => r.total),
      };
    },
  },
  {
    id: "f1-doencas-cronicas",
    categoria: "pacientes",
    rota: "/pacientes/doencas-cronicas-top",
    titulo: "Doenças crônicas mais comuns na base",
    tipo: "barra-horizontal",
    implementada: true,
    montarDados: (d) => {
      const ranking = (d?.ranking ?? []).slice(0, 8);
      return {
        labels: ranking.map((r) => r.descricao_cid10),
        valores: ranking.map((r) => r.total),
      };
    },
  },
];

/**
 * Chama uma rota de estatísticas e devolve só o `data` do envelope
 * padrão ({status, message, data}), já validado.
 */
async function buscarEstatistica(caminho, params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = `${URL_BASE_API}/estatisticas${caminho}${query ? `?${query}` : ""}`;

  const resposta = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  const corpo = await resposta.json();

  if (!resposta.ok || corpo.status !== "success") {
    throw new Error(corpo.message || `Falha ao buscar ${caminho} (status ${resposta.status})`);
  }

  return corpo.data;
}

/**
 * Extrai o sinal (+/-) do texto de `comparacao` e cruza com
 * `direcao` para decidir se o número é bom (verde) ou ruim
 * (vermelho) -- não é fixo por sinal: um "queda" pode ser boa
 * (direcao alto_ruim) ou ruim (direcao alto_bom), dependendo da
 * métrica. Ver ESTATISTICAS_VISAO_TECNICA.md, campo interpretacao.
 */
function calcularClasseComparacao(comparacao, direcao) {
  if (!comparacao) return "neutro";

  const ehAumento = /aumento/i.test(comparacao);
  const ehQueda = /queda/i.test(comparacao);

  if (!ehAumento && !ehQueda) return "neutro"; // "Sem variação..." ou frase fora do padrão

  if (direcao === "neutro") return "neutro";

  const aumentoEhBom = direcao === "alto_bom";
  const foiBom = ehAumento ? aumentoEhBom : !aumentoEhBom;

  return foiBom ? "positivo" : "negativo";
}

/**
 * Monta o markup interno de um card em estado "ok", incluindo o
 * bloco de interpretação quando presente. O card em si (wrapper
 * .metric-card) já existe no DOM -- essa função só substitui o
 * conteúdo.
 */
function montarConteudoOk(metrica, dados) {
  const valor = metrica.extrairValor(dados);
  const label = metrica.extrairLabel ? metrica.extrairLabel(dados) : metrica.label;
  const interpretacao = dados?.interpretacao;

  // id no metric-value só quando a métrica tem animação registrada
  // (ver estatisticasAnimacoes.js) -- é o gancho que renderizarOk usa
  // pra animar o odômetro por cima do valor já formatado por texto.
  const idValor = metrica.animacao ? ` id="valor-${metrica.id}"` : "";
  const setaTendencia = metrica.animacao
    ? `<span class="metric-card-seta" id="seta-${metrica.id}"></span>`
    : "";

  let html = `
    <div class="metric-value-row">
      <div class="metric-value"${idValor}>${valor}</div>
      ${setaTendencia}
    </div>
    <div class="metric-label">${label}</div>
  `;

  if (interpretacao) {
    if (interpretacao.comparacao) {
      const classe = calcularClasseComparacao(interpretacao.comparacao, interpretacao.direcao);
      html += `<div class="metric-card-comparacao metric-card-comparacao--${classe}">${interpretacao.comparacao}</div>`;
    }

    if (interpretacao.nivel) {
      html += `<span class="metric-card-nivel nivel--${interpretacao.nivel}">${formatarNivel(interpretacao.nivel)}</span>`;
    } else if (interpretacao.direcao === "neutro") {
      html += `<span class="metric-card-nivel nivel--neutro">Informativo</span>`;
    }

    if (interpretacao.texto) {
      html += `
        <span class="metric-card-info" tabindex="0" aria-label="O que significa esta métrica">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 16v-4M12 8h.01" stroke-linecap="round"/>
          </svg>
          <span class="metric-card-info-tooltip">${interpretacao.texto}</span>
        </span>
      `;
    }
  }

  return html;
}

function formatarNivel(nivel) {
  const mapa = {
    otimo: "Ótimo",
    bom: "Bom",
    ok: "Ok",
    medio: "Médio",
    medio_ruim: "Médio-ruim",
    ruim: "Ruim",
  };
  return mapa[nivel] ?? nivel;
}

/**
 * Cria o elemento .metric-card no estado "loading" e o insere no
 * grid da categoria. Retorna o elemento para ser atualizado depois.
 */
function criarCardLoading(metrica) {
  const card = document.createElement("div");
  card.className = "metric-card metric-card--stat metric-card--loading";
  card.id = `metric-card-${metrica.id}`;
  card.innerHTML = `
    <div class="metric-value">000</div>
    <div class="metric-label">${metrica.label}</div>
  `;
  return card;
}

function renderizarOk(card, metrica, dados) {
  card.className = "metric-card metric-card--stat metric-card--ok";
  card.innerHTML = montarConteudoOk(metrica, dados);

  // resumo executivo (E1-E4): índice único, sem trajetória real --
  // anima como odômetro (contagem), nunca como curva. Ver
  // estatisticasAnimacoes.js para a justificativa completa.
  if (metrica.animacao) {
    const valorNumerico = metrica.animacao.valorNumerico(dados);
    const elValor = document.getElementById(`valor-${metrica.id}`);
    const elSeta = document.getElementById(`seta-${metrica.id}`);

    if (elValor) {
      animarOdometro(elValor, valorNumerico, {
        sufixo: metrica.animacao.sufixo ?? "",
        prefixo: metrica.animacao.prefixo ?? "",
        casasDecimais: metrica.animacao.casasDecimais ?? 1,
      });
    }

    if (elSeta && dados?.interpretacao?.comparacao) {
      const classe = calcularClasseComparacao(dados.interpretacao.comparacao, dados.interpretacao.direcao);
      animarSetaTendencia(elSeta, classe);
    }
  }
}

function renderizarIndisponivel(card, metrica) {
  card.className = "metric-card metric-card--stat metric-card--indisponivel";
  card.innerHTML = `
    <div class="metric-value">—</div>
    <div class="metric-label">${metrica.label}</div>
    <span class="metric-card-tag">
      <i aria-hidden="true">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="9"/>
          <path d="M12 7v5l3 3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </i>
      Em breve
    </span>
  `;
}

function renderizarErro(card, metrica, aoTentarNovamente) {
  card.className = "metric-card metric-card--stat metric-card--erro";
  card.innerHTML = `
    <div class="metric-value">—</div>
    <div class="metric-label">${metrica.label}</div>
    <button type="button" class="metric-card-retry">Tentar novamente</button>
  `;
  card.querySelector(".metric-card-retry").addEventListener("click", aoTentarNovamente);
}

/**
 * Carrega e renderiza uma métrica dentro do card já presente no DOM.
 * Métricas não implementadas nunca disparam fetch -- pulam direto
 * pro estado indisponível (ver comentário no REGISTRY_METRICAS).
 */
async function carregarMetrica(metrica, card) {
  if (!metrica.implementada) {
    renderizarIndisponivel(card, metrica);
    return;
  }

  try {
    const dados = await buscarEstatistica(metrica.rota);
    renderizarOk(card, metrica, dados);
  } catch (erro) {
    console.error(`[adminEstatisticas] Erro ao carregar ${metrica.id}:`, erro);
    renderizarErro(card, metrica, () => {
      card.className = "metric-card metric-card--stat metric-card--loading";
      card.innerHTML = `
        <div class="metric-value">000</div>
        <div class="metric-label">${metrica.label}</div>
      `;
      carregarMetrica(metrica, card);
    });
  }
}

// Categorias já carregadas nesta sessão de página -- evita refazer
// fetch toda vez que o usuário troca de aba e volta.
const categoriasCarregadas = new Set();

function criarCardGraficoLoading(grafico) {
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

function lerVarCss(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
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
          x: { stacked: true, max: 100, grid: { color: corBorda }, ticks: { color: corTextoMuted, callback: (v) => `${v}%` } },
          y: { stacked: true, grid: { display: false }, ticks: { color: corTextoMuted } },
        },
      },
    });
  }
}

async function carregarGrafico(grafico, card) {
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