// adminProfissionaisApi.js
//
// Camada de acesso à API de usuários/profissionais.
// Espelha as rotas do blueprint Flask.
//
//   GET    /?pagina=&status=&especialidade=  -> listar({ pagina, status, especialidade })
//   POST   /                          -> criar(dados)
//   PUT    /<uuid>                    -> atualizar(uuid, dados)
//   POST   /<uuid>/ativar             -> ativar(uuid)
//   POST   /<uuid>/desativar          -> desativar(uuid)
//
// Resposta do backend (json_success / json_error):
//   sucesso: { status: "success", message: "...", data: {...} | [...] }
//   erro:    { status: "error",   message: "..." }
//
// Autenticação por sessão/cookie -- fetch usa credentials: "include"
// para garantir que o cookie de sessão vai junto, sem headers extras
// por enquanto (sem CSRF token definido ainda).
//
// TODO: se um CSRF token ou outro header de autenticação for definido
// depois, é só adicionar em `headersPadrao` abaixo -- centralizado
// aqui, não precisa mexer em cada chamada.
//
// A API roda num host/porta diferente do servidor que serve os
// arquivos estáticos (ex: Flask em :5000, front em :5500 via Live
// Server) -- por isso o endereço vem pronto (host + prefixo) de
// URL_BASE_API em config.js, e aqui só completamos com o path do
// blueprint. Importante: URL_BASE_API já inclui o prefixo /v1/api,
// então aqui só concatenamos o restante do caminho (/usuarios...),
// sem repetir /v1/api de novo.

import { URL_BASE_API } from "../../../../config.js";

const BASE_URL = `${URL_BASE_API}/usuarios`;

function headersPadrao() {
  return { 'Content-Type': 'application/json' };
}

/**
 * Executa o fetch e normaliza a resposta no formato do backend.
 * Lança ApiError em caso de erro de rede ou de negócio (status: "error").
 */
async function requisitar(path, options = {}) {
  let resposta;
  try {
    resposta = await fetch(`${BASE_URL}${path}`, {
      credentials: 'include',
      headers: headersPadrao(),
      ...options,
    });
  } catch (erroRede) {
    throw new ApiError('Não foi possível conectar ao servidor. Verifique sua internet.', 0);
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

  return corpo; // { status: "success", message, data }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * GET / — lista os usuários/profissionais da empresa da sessão atual.
 *
 * @param {object} [opcoes]
 * @param {number} [opcoes.pagina=0]        — número da página (0, 1, 2...).
 *   O backend multiplica por 8 internamente para calcular o offset
 *   real (pagina=1 -> pula os 8 primeiros); o front NÃO faz essa
 *   conta, só manda o número da página.
 * @param {string} [opcoes.status]          — 'pendente' | 'ativo' | 'desativado'
 *   Nota: 'desativado' é o nome aceito pelo PARÂMETRO de filtro nesta
 *   rota; o valor que de fato vem no campo `status` de cada usuário
 *   no corpo da resposta continua sendo 'inativo' (Usuario.to_dict()
 *   não mudou). Ou seja: filtra com status=desativado, mas cada item
 *   devolvido tem status: "inativo".
 * @param {string} [opcoes.especialidade]
 */
export function listarProfissionais({ pagina = 0, status, especialidade } = {}) {
  const params = new URLSearchParams();
  params.set('pagina', String(pagina));
  if (status) params.set('status', status);
  if (especialidade) params.set('especialidade', especialidade);

  return requisitar(`/?${params.toString()}`, { method: 'GET' });
}

/** GET /<uuid> — detalhe de um usuário específico. */
export function buscarProfissional(uuid) {
  return requisitar(`/${uuid}`, { method: 'GET' });
}

/** POST / — cria um novo profissional (schema completo de cadastro). */
export function criarProfissional(payload) {
  return requisitar('/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** PUT /<uuid> — atualiza parcialmente um profissional existente. */
export function atualizarProfissional(uuid, payload) {
  return requisitar(`/${uuid}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/** POST /<uuid>/ativar */
export function ativarProfissional(uuid) {
  return requisitar(`/${uuid}/ativar`, { method: 'POST' });
}

/** POST /<uuid>/desativar */
export function desativarProfissional(uuid) {
  return requisitar(`/${uuid}/desativar`, { method: 'POST' });
}