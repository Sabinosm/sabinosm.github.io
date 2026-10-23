// catalogoMedicamentosApi.js
//
// Camada de acesso ao catálogo de medicamentos (domínio separado dos
// medicamentos-em-uso do paciente). Espelha controller.py
// (catalogo de medicamentos).
//
// Rotas (controller.py):
//   GET /catalogo-medicamentos/                    -> listar (q, pagina, por_pagina)
//   GET /catalogo-medicamentos/<uuid>              -> detalhe
//   GET /catalogo-medicamentos/<uuid>/interacoes   -> interações do medicamento (SÓ médico)
//
// Uso principal hoje: autocomplete/busca de uuid_catalogo para o
// registro de medicamento em uso (o POST de medicamentos-em-uso aceita
// uuid_catalogo OU descricao livre — com uuid, o back valida contra o
// catálogo e completa a descrição com o princípio ativo).
//
// TODO: confirmar o url_prefix do blueprint no app.py (assumi
// /catalogo-medicamentos) e o formato exato de `resposta_paginada`
// (itens/total/pagina) em src.core.consultas — ajustar listar se o
// envelope for outro.

import { URL_BASE_API } from "../../../../sharedConfig/urlConfig.js";
import { ApiError } from "../../shared/pacientes/pacienteApi.js";

// TODO: ajustar para o url_prefix real do register do blueprint.
const BASE_CATALOGO = `${URL_BASE_API}/catalogo-medicamentos`;

function headersPadrao() {
  return { 'Content-Type': 'application/json' };
}

async function requisitar(url, options = {}) {
  let resposta;
  try {
    resposta = await fetch(url, { credentials: "include", headers: headersPadrao(), ...options });
  } catch {
    throw new ApiError("Não foi possível conectar ao servidor. Verifique sua internet.", 0);
  }
  let corpo;
  try {
    corpo = await resposta.json();
  } catch {
    throw new ApiError('Resposta inesperada do servidor.', resposta.status);
  }
  if (!resposta.ok || corpo.status === 'error') {
    throw new ApiError(corpo.message || 'Ocorreu um erro inesperado.', resposta.status);
  }
  return corpo;
}

/**
 * GET /catalogo-medicamentos/ — busca paginada por princípio ativo.
 *
 * @param {object} [opcoes]
 * @param {string} [opcoes.q]             — termo de busca (princípio ativo)
 * @param {number} [opcoes.pagina=1]      — TODO: confirmar base (0 ou 1) com ler_paginacao()
 * @param {number} [opcoes.porPagina=10]
 */
export function listarMedicamentosCatalogo({ q, pagina = 1, porPagina = 10 } = {}) {
  const params = new URLSearchParams();
  if (q && q.trim()) params.set('q', q.trim());
  params.set('pagina', String(pagina));
  params.set('por_pagina', String(porPagina));
  return requisitar(`${BASE_CATALOGO}/?${params.toString()}`, { method: 'GET' });
  // TODO: data segue o envelope resposta_paginada — confirmar os nomes
  // dos campos (ex.: data.itens / data.total / data.pagina).
}

/** GET /catalogo-medicamentos/<uuid> — detalhe de um item do catálogo. */
export function buscarMedicamentoCatalogo(uuid) {
  return requisitar(`${BASE_CATALOGO}/${encodeURIComponent(uuid)}`, { method: 'GET' });
}

/**
 * GET /catalogo-medicamentos/<uuid>/interacoes — interações conhecidas
 * do medicamento. SÓ MÉDICO no back (@requer_papel_clinico("medico")):
 * esconder a UI para enfermeiro/admin.
 *
 * resposta.data = {
 *   interacoes: [...],
 *   cobertura: { total_interacoes_na_base, aviso }
 * }
 */
export function listarInteracoesMedicamento(uuid) {
  return requisitar(`${BASE_CATALOGO}/${encodeURIComponent(uuid)}/interacoes`, { method: 'GET' });
}