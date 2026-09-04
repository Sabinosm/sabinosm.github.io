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
// URL_BASE_API em urlConfig.js, e aqui só completamos com o path do
// blueprint. Importante: URL_BASE_API já inclui o prefixo /v1/api,
// então aqui só concatenamos o restante do caminho (/usuarios...),
// sem repetir /v1/api de novo.
//
// ALTERADO (múltiplos admins por empresa): criarProfissional(payload)
// continua servindo para médico/enfermeiro. Para criar um admin, o
// backend exige que o solicitante seja o super admin (checagem no
// service, não aqui) -- do lado do front, isso só muda o payload
// (tipo_usuario: "admin", sem CRM/COREN, sem senha). Não é uma rota
// nova, é a MESMA POST / -- então criarProfissional já serve; não é
// necessário duplicar a função, só o payload muda dependendo do
// formulário usado (ver adminProfissionaisModal.js).

import { URL_BASE_API } from "../../../../sharedConfig/urlConfig.js";
import { pedirConfirmacao, ConfirmacaoCanceladaError } from "../../../../sharedConfig/stepup.js"

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
      credentials: "include",
      headers: headersPadrao(),
      ...options,
    });
  } catch (erroRede) {
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
 * ALTERADO (múltiplos admins por empresa): a listagem agora pode
 * incluir admins comuns (o backend só exclui o super admin -- ver
 * repository.find_all_param). Cada item vem com `is_admin` (ver
 * Usuario.to_dict_few) para o front diferenciar o card.
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

/** GET /<uuid> — detalhe de um usuário específico.
 *
 * ALTERADO (múltiplos admins por empresa): o detalhe (Usuario.to_dict())
 * agora também traz `is_super_admin` -- relevante só quando o alvo é
 * admin, para o modal decidir se mostra ações de gerenciamento (o
 * super admin nunca aparece na listagem, mas pode ser alcançado aqui
 * se algum dia for necessário abrir o detalhe dele diretamente).
 */
export function buscarProfissional(uuid) {
  return requisitar(`/${uuid}`, { method: 'GET' });
}

/**
 * POST / — cria um novo usuário (médico, enfermeiro ou admin).
 *
 * ALTERADO (múltiplos admins por empresa): o backend exige que só o
 * super admin envie payload com tipo_usuario: "admin" -- se um admin
 * comum tentar, a API responde 400/403 com uma mensagem de negócio,
 * que sobe como ApiError igual qualquer outro erro de validação (o
 * front não precisa de tratamento especial para esse caso, só exibir
 * erro.message).
 */
export function criarProfissional(payload) {
  return requisitar('/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** PUT /<uuid> — atualiza parcialmente um profissional existente.
 *
 * ALTERADO (múltiplos admins por empresa): o backend bloqueia:
 *   - qualquer troca de/para tipo_usuario "admin" (promoção/rebaixamento
 *     não existem via edição, só via criação);
 *   - edição de um usuário que já é admin, se o solicitante não for o
 *     super admin.
 * Ambos os casos sobem como ApiError com a mensagem de negócio do
 * backend -- nenhum tratamento especial necessário aqui.
 */
export function atualizarProfissional(uuid, payload) {
  return requisitar(`/${uuid}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/** POST /<uuid>/ativar
 *
 * ALTERADO (múltiplos admins por empresa): se o alvo for admin e o
 * solicitante não for o super admin, o backend responde com erro de
 * negócio (sobe como ApiError). O front pode evitar chegar a chamar
 * isso mostrando o botão só quando fizer sentido -- ver
 * adminProfissionaisModal.js (podeGerenciarAlvo).
 */
export async function ativarProfissional(uuid) {
  return solicitarComStepUp(`/${uuid}/ativar`, "ativar_profissional");
}

/** POST /<uuid>/desativar — mesma observação de ativarProfissional. */
export async function desativarProfissional(uuid) {
  return solicitarComStepUp(`/${uuid}/desativar`, "desativar_profissional");
}

async function solicitarComStepUp(path, acao) {
  let token;
  try {
    token = await pedirConfirmacao(acao);
  } catch (erro) {
    if (erro instanceof ConfirmacaoCanceladaError) return; // usuário desistiu
    exibirMensagem(erro.message, "erro");
    return;
  }

  return requisitar(path, {
    method: "POST",
    headers: { "X-Stepup-Token": token },
  });
}