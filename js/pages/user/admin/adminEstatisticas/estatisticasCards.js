import { animarOdometro, animarSetaTendencia } from "../../estatisticasAnimacoes.js";
import { buscarEstatistica } from "./estatisticasApi.js";

/**
 * Renderização dos cards numéricos (.metric-card) da página de
 * estatísticas -- os 4 estados (loading/ok/indisponível/erro) mais o
 * bloco de interpretação (comparacao/nivel/texto) e a integração com
 * o odômetro (ver estatisticasAnimacoes.js) para métricas marcadas
 * com `animacao` no registry.
 */

/**
 * Extrai o sinal (+/-) do texto de `comparacao` e cruza com
 * `direcao` para decidir se o número é bom (verde) ou ruim
 * (vermelho) -- não é fixo por sinal: um "queda" pode ser boa
 * (direcao alto_ruim) ou ruim (direcao alto_bom), dependendo da
 * métrica. Ver ESTATISTICAS_VISAO_TECNICA.md, campo interpretacao.
 */
export function calcularClasseComparacao(comparacao, direcao) {
  if (!comparacao) return "neutro";

  const ehAumento = /aumento/i.test(comparacao);
  const ehQueda = /queda/i.test(comparacao);

  if (!ehAumento && !ehQueda) return "neutro"; // "Sem variação..." ou frase fora do padrão

  if (direcao === "neutro") return "neutro";

  const aumentoEhBom = direcao === "alto_bom";
  const foiBom = ehAumento ? aumentoEhBom : !aumentoEhBom;

  return foiBom ? "positivo" : "negativo";
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

/**
 * Cria o elemento .metric-card no estado "loading" e o insere no
 * grid da categoria. Retorna o elemento para ser atualizado depois.
 */
export function criarCardLoading(metrica) {
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

  // métricas de número puro marcadas com `animacao` no registry:
  // índice único, sem trajetória real -- anima como odômetro
  // (contagem), nunca como curva. Ver estatisticasAnimacoes.js.
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
export async function carregarMetrica(metrica, card) {
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