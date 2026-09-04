import { URL_BASE_API } from "../../../../urlConfig.js";

/**
 * Busca as estatísticas gerais da instituição (contagens de
 * profissionais, pacientes e consultas) para popular os cards
 * de métricas do painel de Gerenciamento.
 *
 * Endpoint: GET {URL_BASE_API}/estatisticas/geral
 * Auth: cookie de sessão (credentials: "include")
 *
 * Toda rota de estatísticas responde no envelope padrão do backend:
 *   { status: "success" | "error", message: string, data: {...} | null }
 * (via json_success / json_error). Aqui devolvemos só o `data` já
 * validado, para quem consome não precisar saber do envelope.
 */
async function buscarEstatisticasGeral() {
  const resposta = await fetch(`${URL_BASE_API}/estatisticas/geral`, {
    method: "GET",
    credentials: "include",
  });

  const corpo = await resposta.json();

  if (!resposta.ok || corpo.status !== "success") {
    throw new Error(corpo.message || `Falha ao buscar estatísticas (status ${resposta.status})`);
  }

  return corpo.data;
}

/**
 * Preenche os cards de métrica com os valores vindos da API.
 * Espera um objeto no formato:
 * {
 *   total_profissionais: number,
 *   profissionais_pendentes: number,
 *   profissionais_ativos: number,
 *   consultas_hoje: number,
 *   pacientes_cadastrados: number
 * }
 */
function preencherMetricas(estatisticas) {
  const elProfissionaisAtivos = document.getElementById("metric-profissionais-ativos");
  const elPacientesCadastrados = document.getElementById("metric-pacientes-cadastrados");
  const elConsultasHoje = document.getElementById("metric-consultas-hoje");
  const elConvitesPendentes = document.getElementById("metric-convites-pendentes");

  if (elProfissionaisAtivos) {
    elProfissionaisAtivos.textContent = estatisticas.profissionais_ativos ?? "—";
  }
  if (elPacientesCadastrados) {
    elPacientesCadastrados.textContent = estatisticas.pacientes_cadastrados ?? "—";
  }
  if (elConsultasHoje) {
    elConsultasHoje.textContent = estatisticas.consultas_hoje ?? "—";
  }
  if (elConvitesPendentes) {
    elConvitesPendentes.textContent = estatisticas.profissionais_pendentes ?? "—";
  }
}

/**
 * Mostra um estado de erro simples nos cards, caso a API falhe.
 * Mantém a UI coerente em vez de deixar os placeholders antigos
 * (que dariam a entender que os dados são reais).
 */
function mostrarErroMetricas() {
  const ids = [
    "metric-profissionais-ativos",
    "metric-pacientes-cadastrados",
    "metric-consultas-hoje",
    "metric-convites-pendentes",
  ];

  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = "—";
  });
}

export async function iniciarMetricasGerenciamento() {
  try {
    const estatisticas = await buscarEstatisticasGeral();
    preencherMetricas(estatisticas);
  } catch (erro) {
    console.error("[adminHomePage] Erro ao carregar estatísticas gerais:", erro);
    mostrarErroMetricas();
  }
}