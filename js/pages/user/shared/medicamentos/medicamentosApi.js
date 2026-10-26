// medicamentosApi.js
//
// Somente as chamadas da API de medicamentos (o fetch em si fica em
// ../requisitar.js). Espelha as rotas do back:
//
//   GET  /medicamentos/                      -> listarMedicamentos(filtros)
//   GET  /medicamentos/classes               -> listarClasses()
//   GET  /medicamentos/<uuid>                -> buscarMedicamento(uuid)
//   GET  /medicamentos/<uuid>/interacoes     -> listarInteracoes(uuid)        (médico)
//   POST /medicamentos/interacoes/verificar  -> verificarInteracoesEntre(uuids) (médico)
//   GET  /indicacoes-terapeuticas/?q=        -> sugerirIndicacoes(q)
//   GET  /contraindicacoes/?q=               -> sugerirContraindicacoes(q)
//
// Os prefixos abaixo são os dos blueprints; ajuste aqui se o registro
// no app usar outros.

import { requisitar, montarQuery } from "../exames/requisitar.js";

const MEDICAMENTOS = "/catalogo/medicamentos";
const INDICACOES = "/catalogo/indicacoes-terapeuticas";
const CONTRAINDICACOES = "/catalogo/contraindicacoes";

/**
 * Lista paginada. Devolve { itens, pagina, por_pagina, total, paginas }.
 * @param {object} [f]
 * @param {string} [f.q]                    princípio ativo, sinônimo ou nome comercial
 * @param {string} [f.indicacao]            uuid da indicação
 * @param {string[]} [f.semContraindicacao] uuids; exclui contraindicados em QUALQUER um
 * @param {string} [f.classe]               classe farmacêutica exata
 * @param {number} [f.pagina=1]             1-based
 * @param {number} [f.porPagina=20]
 */
export function listarMedicamentos({
  q, indicacao, semContraindicacao = [], classe, pagina = 1, porPagina = 20,
} = {}) {
  const query = montarQuery({
    q,
    indicacao,
    sem_contraindicacao: semContraindicacao,
    classe,
    pagina,
    por_pagina: porPagina,
  });
  return requisitar(MEDICAMENTOS, `${query}`);
}

/** Classes farmacêuticas existentes (popula o filtro). */
export function listarClasses() {
  return requisitar(MEDICAMENTOS, "/classes");
}

/** Detalhe com indicações e contraindicações (objetos com uuid e nome). */
export function buscarMedicamento(uuid) {
  return requisitar(MEDICAMENTOS, `/${encodeURIComponent(uuid)}`);
}

/** Interações do medicamento. Só médico. Devolve { interacoes, cobertura }. */
export function listarInteracoes(uuid) {
  return requisitar(MEDICAMENTOS, `/${encodeURIComponent(uuid)}/interacoes`);
}

/**
 * Interações entre os medicamentos informados (todos contra todos).
 * Só médico. Devolve { medicamentos, interacoes, cobertura }.
 * Pensada para o atendimento: o que está sendo prescrito + o que o paciente já usa.
 */
export function verificarInteracoesEntre(uuids) {
  return requisitar(MEDICAMENTOS, "/interacoes/verificar", {
    method: "POST",
    body: JSON.stringify({ medicamentos: uuids }),
  });
}

/** Sugestões de indicação (autocomplete do filtro). Devolve a lista de itens. */
export async function sugerirIndicacoes(q) {
  const dados = await requisitar(INDICACOES, `${montarQuery({ q, por_pagina: 10 })}`);
  return dados.itens;
}

/** Sugestões de contraindicação (autocomplete do filtro). Devolve a lista de itens. */
export async function sugerirContraindicacoes(q) {
  const dados = await requisitar(CONTRAINDICACOES, `${montarQuery({ q, por_pagina: 10 })}`);
  return dados.itens;
}