/**
 * Animações reutilizáveis para os cards de estatística.
 *
 * Regra de honestidade de dados (ver discussão sobre E1/E2/E3 vs
 * A1/C2): uma métrica só ganha curva/linha suave quando ela É uma
 * série real no tempo (vários pontos verdadeiros). Um índice único
 * (dois números: antes/depois, ou um coeficiente) nunca vira curva
 * suave -- os pontos do meio seriam inventados. Por isso este
 * arquivo separa as animações em dois grupos, cada um com seu
 * contrato de quando usar.
 *
 * Todas as funções são independentes de framework, recebem o
 * elemento/canvas já existente no DOM e não fazem fetch -- só
 * animação. Import individual, conforme o card precisar.
 */

// =====================================================================
// GRUPO 1 — ÍNDICE ÚNICO (E1, E2, E3, e qualquer card "metrics--destaque"
// que mostre um número/coeficiente, não uma série)
// =====================================================================

/**
 * animarOdometro(elemento, valorFinal, opcoes)
 *
 * Conta de um valor inicial até `valorFinal`, como um odômetro.
 * Usar em vez de gráfico de linha quando a métrica é um número único
 * (E1 índice de qualidade, E2 variação percentual, E3 coeficiente de
 * correlação, ou qualquer metric-value de destaque). Não desenha
 * trajetória -- só o número sobe/desce até o valor real, que é a
 * única coisa que sabemos de verdade.
 *
 * @param {HTMLElement} elemento - onde escrever o número (ex: a div.metric-value)
 * @param {number} valorFinal - valor real de chegada
 * @param {Object} opcoes
 * @param {number} [opcoes.valorInicial=0] - de onde a contagem começa
 * @param {number} [opcoes.duracaoMs=1500] - duração da animação (2-5s pedido no design, aqui default mais curto pro card menor -- ajustar por caso)
 * @param {number} [opcoes.casasDecimais=1] - arredondamento do valor exibido
 * @param {string} [opcoes.sufixo=""] - texto após o número (ex: "%", "/100k")
 * @param {string} [opcoes.prefixo=""] - texto antes do número (ex: "r = ")
 * @param {(t:number)=>number} [opcoes.easing] - função de easing (default: ease-out cúbico, sensação de "chegando", não constante)
 */
export function animarOdometro(elemento, valorFinal, opcoes = {}) {
  const {
    valorInicial = 0,
    duracaoMs = 1500,
    casasDecimais = 1,
    sufixo = "",
    prefixo = "",
    easing = easeOutCubic,
  } = opcoes;

  if (!elemento || typeof valorFinal !== "number" || Number.isNaN(valorFinal)) {
    // métrica indisponível/não numérica -- não anima, só escreve o
    // traço que o card já usa no estado indisponível
    if (elemento) elemento.textContent = "—";
    return;
  }

  // respeita quem pediu menos movimento na tela (acessibilidade) --
  // exibe o valor final direto, sem contagem
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    elemento.textContent = `${prefixo}${valorFinal.toFixed(casasDecimais)}${sufixo}`;
    return;
  }

  const inicio = performance.now();

  function passo(agora) {
    const decorrido = agora - inicio;
    const t = Math.min(decorrido / duracaoMs, 1);
    const progresso = easing(t);
    const valorAtual = valorInicial + (valorFinal - valorInicial) * progresso;

    elemento.textContent = `${prefixo}${valorAtual.toFixed(casasDecimais)}${sufixo}`;

    if (t < 1) {
      requestAnimationFrame(passo);
    } else {
      // garante que o valor final exibido é exatamente o real, sem
      // resíduo de arredondamento do easing
      elemento.textContent = `${prefixo}${valorFinal.toFixed(casasDecimais)}${sufixo}`;
    }
  }

  requestAnimationFrame(passo);
}

/**
 * animarSetaTendencia(elemento, direcao)
 *
 * Acompanha animarOdometro nos cards de índice: uma seta que
 * desliza/aparece indicando se o índice subiu ou desceu, colorida
 * pela MESMA lógica de calcularClasseComparacao usada no resto da
 * página (verde/vermelho dependem de direcao + sinal, não do sinal
 * sozinho -- ver adminEstatisticas.js).
 *
 * @param {HTMLElement} elemento - container onde a seta é inserida
 * @param {"positivo"|"negativo"|"neutro"} classe - já calculada por
 *   calcularClasseComparacao, não recalculamos aqui pra não duplicar
 *   a regra de negócio em dois arquivos
 */
export function animarSetaTendencia(elemento, classe) {
  if (!elemento) return;

  const icones = {
    positivo: '<path d="M12 19V5M5 12l7-7 7 7" stroke-linecap="round" stroke-linejoin="round"/>',
    negativo: '<path d="M12 5v14M19 12l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"/>',
    neutro: '<path d="M5 12h14" stroke-linecap="round"/>',
  };

  const svg = icones[classe] ?? icones.neutro;

  // a cor vem da classe metric-card-seta--{positivo|negativo|neutro}
  // (definida em adminEstatisticas.css), não de --status-fg -- esse
  // token só existe dentro do escopo de .nivel--*, que é um elemento
  // irmão, não ancestral da seta.
  elemento.classList.add(`metric-card-seta--${classe}`);
  elemento.innerHTML = `
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"
         style="opacity:0; transform: translateY(4px); transition: opacity 0.4s ease 0.3s, transform 0.4s ease 0.3s;">
      ${svg}
    </svg>
  `;

  // força reflow antes de aplicar a classe visível -- sem isso a
  // transição CSS não dispara (o browser já pintaria no estado final)
  void elemento.offsetWidth;

  const svgEl = elemento.querySelector("svg");
  requestAnimationFrame(() => {
    svgEl.style.opacity = "1";
    svgEl.style.transform = "translateY(0)";
  });
}

// =====================================================================
// GRUPO 2 — SÉRIE REAL NO TEMPO (A1 volume, C2 evolução de CID, e
// qualquer rota que devolva `serie: [{data, total}, ...]`)
// =====================================================================

/**
 * animarLinhaComPonto(canvas, pontos, opcoes)
 *
 * Desenha a linha (Chart.js) já com todos os pontos reais, mas anima
 * o "reveal": a linha se desenha da esquerda pra direita e um ponto
 * final some/aparece "perseguindo" até o último valor real -- é
 * puramente uma animação de entrada sobre dados verdadeiros, não
 * uma trajetória inventada. Diferente do odômetro: aqui os pontos
 * intermediários EXISTEM de verdade (um por dia da série).
 *
 * Requer Chart.js já carregado globalmente (script CDN no HTML).
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{label: string, valor: number}>} pontos - série real, em ordem
 * @param {Object} opcoes
 * @param {number} [opcoes.duracaoMs=1800] - duração do desenho da linha
 * @param {string} [opcoes.corLinha] - lida de CSS var se não informada
 * @param {string} [opcoes.corPreenchimento]
 */
export function animarLinhaComPonto(canvas, pontos, opcoes = {}) {
  if (!canvas || !pontos || pontos.length === 0) return;

  const { duracaoMs = 1800 } = opcoes;

  const corLinha = opcoes.corLinha || lerVarCss("--accent") || "#5b7fe0";
  const corPreenchimento = opcoes.corPreenchimento || hexParaRgba(corLinha, 0.08);
  const corMuted = lerVarCss("--text-muted") || "#7c8792";
  const corBorda = lerVarCss("--border") || "rgba(255,255,255,0.08)";

  const semMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // eslint-disable-next-line no-undef -- Chart vem do script CDN carregado no HTML
  return new Chart(canvas, {
    type: "line",
    data: {
      labels: pontos.map((p) => p.label),
      datasets: [
        {
          data: pontos.map((p) => p.valor),
          borderColor: corLinha,
          backgroundColor: corPreenchimento,
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          // ponto visível só no último índice -- é o "ponto perseguindo
          // a linha" que termina exatamente onde a série real acaba
          pointRadius: (ctx) => (ctx.dataIndex === pontos.length - 1 ? 5 : 0),
          pointBackgroundColor: corLinha,
          pointBorderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: semMovimento
        ? false
        : {
            duration: duracaoMs,
            easing: "easeOutCubic",
          },
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: { grid: { color: corBorda }, ticks: { color: corMuted } },
      },
    },
  });
}

// =====================================================================
// Helpers internos (não exportados -- uso só dentro deste arquivo)
// =====================================================================

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function lerVarCss(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

function hexParaRgba(hex, alpha) {
  const limpo = hex.replace("#", "");
  if (limpo.length !== 6) return `rgba(91, 127, 224, ${alpha})`; // fallback --accent conhecido
  const r = parseInt(limpo.slice(0, 2), 16);
  const g = parseInt(limpo.slice(2, 4), 16);
  const b = parseInt(limpo.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}