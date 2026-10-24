// atendimentoProtocoloResultado.js
//
// Transforma a execução devolvida por POST .../protocolos/<uuid>/executar
// (InputProtocoloExecucao.to_dict) em dados prontos para exibir. Puro.
//
// O cálculo vive em `resultado_calculado_json` (SchemaResultado.model_dump()):
//   { classificacao, trilha_explicativa: [{rotulo, valor_observado, peso_ou_resultado, ordem}],
//     dados_ausentes, metadata }
//   escore:   metadata = { escore_total, override_disparado, acao_recomendada, escore_parcial }
//   composto: classificacao "multiplos-resultados" quando não há agregação, e
//             metadata.modulos = [ResultadoModulo] (sigla_modulo, status, valor,
//             classificacao, motivo, trilha, ausentes...)
// `status` da execução: "concluida" | "incompleta".

export const CLASSIFICACAO_MULTIPLOS_RESULTADOS = "multiplos-resultados";

const humanizar = (s) => String(s).replace(/[_-]+/g, " ");

function nomesAusentes(lista) {
  return (lista ?? []).map((x) => (typeof x === "string" ? x : (x?.campo ?? String(x))));
}

function formatarModulo(m) {
  const valor = m.classificacao ?? (m.valor !== null && m.valor !== undefined ? String(m.valor) : null);
  return {
    sigla: m.sigla_modulo ?? m.sigla ?? "?",
    status: m.status ?? null,
    saida: valor !== null ? humanizar(valor) : null,
    motivo: m.motivo ?? null,
    ausentes: nomesAusentes(m.ausentes),
  };
}

/** @param execucao  `resp.data` do executar (to_dict da execução) */
export function formatarResultado(execucao) {
  const r = execucao?.resultado_calculado_json ?? {};
  const meta = r.metadata ?? {};

  const passos = [...(r.trilha_explicativa ?? [])]
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    .map((p) => ({ rotulo: p.rotulo, valor: p.valor_observado, resultado: p.peso_ou_resultado }));

  const multiplos = r.classificacao === CLASSIFICACAO_MULTIPLOS_RESULTADOS;

  return {
    status: execucao?.status ?? null,
    classificacao: multiplos || !r.classificacao ? null : humanizar(r.classificacao),
    multiplos,
    escoreTotal: meta.escore_total ?? null,
    escoreParcial: Boolean(meta.escore_parcial),
    overrideDisparado: Boolean(meta.override_disparado),
    acao: meta.acao_recomendada ?? null,
    passos,
    modulos: (meta.modulos ?? []).map(formatarModulo),
    ausentes: nomesAusentes(execucao?.dados_ausentes_json ?? r.dados_ausentes),
  };
}
