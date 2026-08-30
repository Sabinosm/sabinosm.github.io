// adminPacientesApi.js
//
// Camada de acesso à API de pacientes. Espelha o blueprint Flask real
// (bp de pacientes, ver lista_resumo/listar_resumo/find_all_param/
// to_dict_few no backend).
//
//   GET  /pacientes/resumo?pagina=&status=&sexo_biologico=  -> listar({...})
//   GET  /pacientes/<uuid>                                  -> buscarDetalhe(uuid) [protegido por stepUp]
//
// Resposta do backend (json_success / json_error, mesmo padrão de
// profissionais):
//   sucesso: { status: "success", message: "...", data: {...} | [...] }
//   erro:    { status: "error",   message: "..." }
//
// Modelo de dados da LISTAGEM (Paciente.to_dict_few()):
//   {
//     uuid,
//     nome_completo,     // já vem descriptografado pelo service
//     cpf_inicio,        // 4 primeiros dígitos do CPF, já descriptografado
//     cadastrado_por,    // nome de quem cadastrou (string), não uuid
//     criado_em,         // ISO datetime
//     sexo_biologico,
//     status,            // 'ativo' | 'inativo' | 'obito'
//   }
//
// NÃO existe filtro por nome/CPF nesta rota (repository.find_all_param
// deixa isso de fora de propósito -- nome e CPF vivem cifrados com
// AES-256-GCM em PacienteDadosPessoais, e não dá pra fazer ILIKE
// direto no banco sobre coluna cifrada; ver docstring do backend).
// A busca por texto aqui é só client-side, sobre os itens já
// carregados na página atual -- ver adminPacientesLista.js.
//
// Dados sensíveis/completos do paciente só vêm no detalhe (GET
// /pacientes/<uuid>), e essa rota é protegida por step-up: cada
// acesso confirma a identidade de quem está vendo e (segundo o que
// foi combinado) fica registrado que aquela pessoa visualizou o
// prontuário a partir daquele momento. Por enquanto pedimos
// confirmação sempre com a ação "visualizar_paciente" -- se o backend
// vier a diferenciar visualizar/editar como ações de step-up
// distintas, trocar o parâmetro `acao` de buscarDetalhePaciente por
// essa ação específica (ver TODO abaixo).

import { URL_BASE_API } from "../../../../config.js";
import { pedirConfirmacao, ConfirmacaoCanceladaError } from "../../stepup.js";

const BASE_URL = `${URL_BASE_API}/pacientes`;

function headersPadrao() {
  return { 'Content-Type': 'application/json' };
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

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

/**
 * GET /pacientes/resumo — lista pacientes com paginação por número de
 * página ('pagina' é 0, 1, 2..., o backend multiplica por 8
 * internamente para achar o offset real -- ver lista_resumo/offset=
 * int(pagina * 8) no controller).
 *
 * @param {object} [opcoes]
 * @param {number} [opcoes.pagina=0]
 * @param {string} [opcoes.status]          — 'ativo' | 'inativo' | 'obito'
 * @param {string} [opcoes.sexoBiologico]
 */
export function listarPacientes({ pagina = 0, status, sexoBiologico } = {}) {
  const params = new URLSearchParams();
  params.set('pagina', String(pagina));
  if (status) params.set('status', status);
  if (sexoBiologico) params.set('sexo_biologico', sexoBiologico);

  return requisitar(`/pessoal/resumo?${params.toString()}`, { method: 'GET' });
}

/**
 * GET /pacientes/<uuid> — detalhe completo do paciente, protegido por
 * step-up. Cada chamada pede reconfirmação de identidade antes de
 * liberar o dado sensível, e (do lado do backend) deve registrar que
 * esta pessoa visualizou o prontuário a partir de agora.
 *
 * TODO: se o backend vier a diferenciar ação "visualizar" de
 * "editar" no step-up, trocar a string fixa abaixo pelo parâmetro
 * correspondente (ex: acao = modoEdicao ? 'editar_paciente' :
 * 'visualizar_paciente').
 *
 * @param {string} uuid
 * @returns {Promise<object|undefined>} resolve com a resposta da API,
 *   ou undefined se o usuário cancelar a confirmação.
 */
export async function buscarDetalhePaciente(uuid) {
  let token;
  try {
    token = await pedirConfirmacao('visualizar_paciente');
  } catch (erro) {
    if (erro instanceof ConfirmacaoCanceladaError) return; // usuário desistiu
    throw erro;
  }

  return requisitar(`/${uuid}`, {
    method: 'GET',
    headers: { 'X-Stepup-Token': token },
  });
}