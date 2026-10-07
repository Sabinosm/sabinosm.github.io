/**
 * Registries centrais da página de estatísticas: cada entrada
 * descreve uma métrica (card numérico ou gráfico) de forma
 * declarativa. Isso é a "estrutura pronta para caber mesmo sem ter"
 * -- adicionar uma métrica nova é só adicionar uma entrada aqui, sem
 * mexer no HTML ou na lógica de renderização (ver
 * estatisticasCards.js / estatisticasGraficos.js).
 */

// =====================================================================
// Helpers de cálculo -- compartilhados entre extrairValor (texto) e
// animacao.valorNumerico (odômetro) de uma mesma métrica, pra
// garantir que as duas nunca divirjam se alguém editar uma sem a
// outra (ver A4 e F4 abaixo).
// =====================================================================

export function formatarPercentual(valor) {
  return typeof valor === "number" ? `${valor}%` : "—";
}

/**
 * Soma os valores de `por_papel` (ex: {medico: 12, enfermeiro: 8}).
 */
export function somarPorPapel(dados) {
  const porPapel = dados?.por_papel ?? {};
  return Object.values(porPapel).reduce((soma, n) => soma + n, 0);
}

/**
 * Percentual de reações "grave" sobre o total de por_gravidade.
 * Retorna null (não 0) quando não há dados, pra animarOdometro cair
 * no fallback "—" em vez de animar até zero.
 */
export function percentualGraves(dados) {
  const porGravidade = dados?.por_gravidade ?? {};
  const total = Object.values(porGravidade).reduce((s, n) => s + n, 0);
  return total > 0 ? (porGravidade.grave / total) * 100 : null;
}

// =====================================================================
// REGISTRY_METRICAS -- cards numéricos (grid .metrics)
//
// campos:
//  - id: usado no DOM (metric-<id>) e como key de cache
//  - categoria: qual grid ela popula (bate com o data-categoria das abas)
//  - rota: caminho sob /estatisticas (sem barra inicial de query)
//  - label: texto abaixo do valor
//  - extrairValor(dados): como pegar o valor de exibição a partir do `data`
//  - extrairLabel(dados): opcional, quando o rótulo depende dos dados
//    (ex: A2, onde o tipo de atendimento principal pode variar)
//  - animacao: opcional -- presença deste campo ativa o odômetro (ver
//    estatisticasAnimacoes.js). Só cabe em métricas de número puro
//    (não texto como B4/F3/A2). valorNumerico(dados) devolve o
//    número cru, sem formatação; sufixo/prefixo/casasDecimais
//    espelham a formatação usada em extrairValor.
//  - implementada: false = nunca dispara fetch, cai direto no estado
//    "indisponível". Lista única de features bloqueadas (B3, E1, E4);
//    quando destravar no backend, é só virar `true`.
// =====================================================================
export const REGISTRY_METRICAS = [
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
    animacao: {
      valorNumerico: (d) => d?.percentual,
      sufixo: "%",
      casasDecimais: 1,
    },
  },
  {
    id: "a4-efetivo",
    categoria: "atendimentos",
    rota: "/equipe/efetivo",
    label: "Efetivo ativo por papel",
    implementada: true,
    extrairValor: (d) => {
      const total = somarPorPapel(d);
      return total > 0 ? total : "—";
    },
    animacao: {
      valorNumerico: (d) => {
        const total = somarPorPapel(d);
        return total > 0 ? total : null;
      },
      casasDecimais: 0,
    },
  },
  {
    id: "a5-engajamento",
    categoria: "atendimentos",
    rota: "/equipe/engajamento",
    label: "Profissionais inativos (7d)",
    implementada: true,
    extrairValor: (d) => (typeof d?.total_inativos === "number" ? d.total_inativos : "—"),
    animacao: {
      valorNumerico: (d) => d?.total_inativos,
      casasDecimais: 0,
    },
  },

  // ===== Desempenho da IA (categoria B) =====
  {
    id: "b1-confianca",
    categoria: "ia",
    rota: "/ia/confianca-media",
    label: "Confiança média da IA",
    implementada: true,
    extrairValor: (d) => formatarPercentual(d?.media),
    animacao: {
      valorNumerico: (d) => d?.media,
      sufixo: "%",
      casasDecimais: 1,
    },
  },
  {
    id: "b2-completude",
    categoria: "ia",
    rota: "/ia/completude-media",
    label: "Completude média dos dados",
    implementada: true,
    extrairValor: (d) => formatarPercentual(d?.media),
    animacao: {
      valorNumerico: (d) => d?.media,
      sufixo: "%",
      casasDecimais: 1,
    },
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
    animacao: {
      valorNumerico: (d) => d?.ranking?.[0]?.incidencia_por_100mil ?? null,
      sufixo: " / 100k",
      casasDecimais: 1,
    },
  },
  {
    id: "c4-tempo-busca",
    categoria: "epidemiologico",
    rota: "/epidemiologico/tempo-ate-atendimento",
    label: "Tempo médio até buscar atendimento",
    implementada: true,
    extrairValor: (d) => (typeof d?.media_horas === "number" ? `${d.media_horas}h` : "—"),
    animacao: {
      valorNumerico: (d) => d?.media_horas,
      sufixo: "h",
      casasDecimais: 1,
    },
  },

  // ===== Medicamentos e alergias (categoria D) =====
  {
    id: "f4-gravidade-alergias",
    categoria: "medicamentos",
    rota: "/alergias/gravidade-geral",
    label: "Reações classificadas como graves",
    implementada: true,
    extrairValor: (d) => {
      const pct = percentualGraves(d);
      return pct !== null ? formatarPercentual(pct) : "—";
    },
    animacao: {
      valorNumerico: (d) => percentualGraves(d),
      sufixo: "%",
      casasDecimais: 1,
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
    animacao: {
      valorNumerico: (d) => d?.percentual,
      sufixo: "%",
      casasDecimais: 1,
    },
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

// =====================================================================
// REGISTRY_GRAFICOS -- blocos de gráfico full-width (Chart.js)
//
// Métricas cuja resposta é uma lista ou matriz, e que perdem
// informação se forem reduzidas a um único número num metric-card
// (ver discussão sobre D2/D3: comparar percentuais de grupos
// diferentes num só card resumido confunde mais do que ajuda). Cada
// entrada aqui vira um bloco full-width dentro do grid da categoria.
// =====================================================================
export const REGISTRY_GRAFICOS = [
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