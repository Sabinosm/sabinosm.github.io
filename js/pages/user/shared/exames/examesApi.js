// examesApi.js
//
// Somente as chamadas da API de exames (o fetch fica em ../requisitar.js).
// Espelha as rotas do back:
//
//   GET /exames/                   -> listarExames(filtros)       (login)
//   GET /exames/filtros            -> listarFiltros()             (login)
//   GET /exames/<uuid>             -> buscarExame(uuid)           (médico)
//   GET /exames/<uuid>/conteudo    -> buscarConteudoApoio(uuid)   (médico)
//
// O prefixo abaixo é o do blueprint; ajuste aqui se o registro usar outro.

import { requisitar, montarQuery } from "./requisitar.js";

const EXAMES = "/catalogo/exames";

/**
 * Lista paginada de exames ativos. Devolve { itens, pagina, por_pagina, total, paginas }.
 * @param {object} [f]
 * @param {string} [f.q]            nome (pt/en) ou sinônimo
 * @param {string} [f.tipo]         laboratorial | imagem | funcional | outro
 * @param {string} [f.material]     valor vindo de listarFiltros()
 * @param {boolean} [f.exigeJejum]  true: com jejum; false: sem jejum; omitido: todos
 * @param {number} [f.pagina=1]     1-based
 * @param {number} [f.porPagina=20]
 */
export function listarExames({ q, tipo, material, exigeJejum, pagina = 1, porPagina = 20 } = {}) {
  const query = montarQuery({
    q,
    tipo,
    material,
    exige_jejum: exigeJejum,
    pagina,
    por_pagina: porPagina,
  });
  return requisitar(EXAMES, `${query}`);
}

/** Valores dos filtros: { tipos: [...], materiais: [...] }. */
export function listarFiltros() {
  return requisitar(EXAMES, "/filtros");
}

/** Detalhe do exame (só médico). */
export function buscarExame(uuid) {
  return requisitar(EXAMES, `/${encodeURIComponent(uuid)}`);
}

/**
 * Conteúdo de apoio (MedlinePlus) já guardado no servidor (só médico).
 * Devolve { disponivel: false, idioma } ou
 * { disponivel: true, idioma, fonte, aviso, paginas: [...] }.
 */
export function buscarConteudoApoio(uuid, idioma = "en") {
  return requisitar(EXAMES, `/${encodeURIComponent(uuid)}/conteudo${montarQuery({ idioma })}`);
}