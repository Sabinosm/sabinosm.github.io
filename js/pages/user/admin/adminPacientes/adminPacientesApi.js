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
// ============================================
// DETALHE DO PACIENTE (ficha completa)
// ============================================
//
//   GET /pacientes/clinico/<uuid>  -> resumo_clinico + alergias[] +
//                                      doencas_cronicas[] +
//                                      medicamentos_em_uso[] +
//                                      consentimento_ativo
//   GET /pacientes/pessoal/<uuid>  -> dados cadastrais (pessoal: nome,
//                                      cpf, rg, telefone, email,
//                                      endereço, contato de emergência)
//
// Duas rotas separadas, cada uma protegida por step-up (ação
// "visualizar_paciente", tipo acao_sensivel) -- mesmo sendo só
// leitura, o acesso a dado clínico/pessoal completo é sensível o
// bastante para exigir reconfirmação de identidade e ficar
// registrado no log de auditoria a partir do momento em que a pessoa
// visualiza. Cada requisição usa seu PRÓPRIO token: o backend valida
// tokens de uso único, então NÃO é seguro reusar o mesmo token nas
// duas chamadas -- é preciso chamar pedirConfirmacao('visualizar_paciente')
// duas vezes (uma por request).
//
// Isso poderia parecer que exige duas confirmações visualmente
// sobrepostas se as chamadas forem disparadas "em paralelo" (sem
// await entre elas) -- mas stepup.js serializa internamente chamadas
// concorrentes a pedirConfirmacao() (ver fila em stepup.js), então do
// lado de quem chama aqui é seguro usar Promise.all: as duas
// confirmações acontecem em sequência (uma de cada vez, sem
// sobreposição visual), e só os fetches finais (já com token em mãos)
// rodam de fato em paralelo. Ver buscarDetalheCompleto abaixo.

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
 * GET /pacientes/clinico/<uuid> — bloco clínico completo do paciente:
 * resumo_clinico (contadores + flags para os alertas fixos da ficha),
 * alergias[], doencas_cronicas[], medicamentos_em_uso[] e
 * consentimento_ativo. Protegido por step-up (ação
 * "visualizar_paciente") -- pede sua PRÓPRIA confirmação e usa um
 * token de uso único.
 *
 * Geralmente você não chama isso direto -- use
 * buscarDetalheCompleto(uuid), que busca este endpoint junto com
 * buscarDetalhePessoal() com a serialização de step-up correta.
 *
 * @param {string} uuid
 * @returns {Promise<object|undefined>} resolve com a resposta da API,
 *   ou undefined se o usuário cancelar a confirmação.
 */
export async function buscarDetalheClinico(uuid) {
  let token;
  try {
    token = await pedirConfirmacao('visualizar_paciente');
  } catch (erro) {
    if (erro instanceof ConfirmacaoCanceladaError) return; // usuário desistiu
    throw erro;
  }

  return requisitar(`/clinico/${uuid}`, {
    method: 'GET',
    headers: { 'X-Stepup-Token': token },
  });
}

/**
 * GET /pacientes/pessoal/<uuid> — dados cadastrais completos do
 * paciente (nome, CPF, RG, telefone, email, endereço, contato de
 * emergência). Protegido por step-up (ação "visualizar_paciente") --
 * pede sua PRÓPRIA confirmação e usa um token de uso único (diferente
 * do usado em buscarDetalheClinico, mesmo sendo a mesma ação).
 *
 * Geralmente você não chama isso direto -- use
 * buscarDetalheCompleto(uuid).
 *
 * @param {string} uuid
 * @returns {Promise<object|undefined>} resolve com a resposta da API,
 *   ou undefined se o usuário cancelar a confirmação.
 */
export async function buscarDetalhePessoal(uuid) {
  let token;
  try {
    token = await pedirConfirmacao('visualizar_paciente');
  } catch (erro) {
    if (erro instanceof ConfirmacaoCanceladaError) return; // usuário desistiu
    throw erro;
  }

  return requisitar(`/pessoal/${uuid}`, {
    method: 'GET',
    headers: { 'X-Stepup-Token': token },
  });
}

/**
 * Busca a ficha completa do paciente (clínico + pessoal) para a
 * página de detalhe, pedindo as duas confirmações de step-up
 * necessárias e disparando os dois fetches finais em paralelo.
 *
 * Do ponto de vista de quem chama, isto é um Promise.all comum -- a
 * serialização das duas confirmações de identidade (para não
 * sobrepor visualmente o modal de step-up) já é resolvida dentro de
 * stepup.js, de forma transparente aqui.
 *
 * Se o usuário cancelar QUALQUER UMA das duas confirmações, a busca
 * inteira é tratada como cancelada (retorna undefined) -- não faz
 * sentido mostrar a ficha com só metade dos dados.
 *
 * @param {string} uuid
 * @returns {Promise<{clinico: object, pessoal: object}|undefined>}
 *   resolve com os dois blocos de dados (cada um já no formato
 *   `{ status, message, data }` da API), ou undefined se o usuário
 *   cancelar alguma das confirmações.
 */
export async function buscarDetalheCompleto(uuid) {
  const [clinico, pessoal] = await Promise.all([
    buscarDetalheClinico(uuid),
    buscarDetalhePessoal(uuid),
  ]);

  // Qualquer uma das duas pode vir undefined se o usuário cancelou
  // aquela confirmação específica -- trata como cancelamento total.
  if (!clinico || !pessoal) return undefined;

  return { clinico, pessoal };
}

// ============================================
// CRIAÇÃO DE PACIENTE
// ============================================
//
// Fluxo mínimo obrigatório: dados essenciais (passo 1) + consentimento
// LGPD (passo 2, normal ou dispensado por emergência). Blocos clínicos
// (alergias, doenças crônicas, medicamentos, tipo sanguíneo) NÃO fazem
// parte da criação -- são adicionados depois, a qualquer momento, pela
// própria ficha do paciente (ver TODOs em adminPacientesDetalheLista.js).
//
// Nenhuma dessas rotas de escrita é protegida por step-up (diferente
// das rotas de leitura de detalhe) -- CRIAR um paciente novo não tem
// um "alvo" preexistente para step-up proteger da mesma forma que
// visualizar/editar um já existente. Se isso mudar no backend, ajustar
// aqui.

/**
 * POST /pacientes/pessoal/ — cria o paciente (Paciente +
 * PacienteDadosPessoais). Retorna o uuid que alimenta todos os passos
 * seguintes (consentimento, blocos clínicos).
 *
 * @param {object} payload
 * @param {string} payload.nome_completo
 * @param {string} payload.cpf                — só dígitos
 * @param {string} payload.telefone            — só dígitos
 * @param {string} payload.sexo_biologico      — 'F' | 'M'
 * @param {string} payload.data_nascimento     — 'YYYY-MM-DD'
 * @param {string} [payload.email]
 * @param {string} [payload.logradouro]
 * @param {string} [payload.numero_residencia]
 * @param {string} [payload.cep]
 * @param {string} [payload.contato_emergencia_nome]
 * @param {string} [payload.contato_emergencia_telefone]
 * @returns {Promise<object>} resposta da API, `data.uuid` é o
 *   identificador do paciente recém-criado.
 */
export function criarPacientePessoal(payload) {
  return requisitar('/pessoal/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Os 4 valores aceitos pelo enum canal_coleta (coluna do banco). */
export const CANAIS_COLETA_CONSENTIMENTO = [
  'presencial-papel',
  'presencial-digital',
  'portal-online',
  'totem',
];

/**
 * POST /pacientes/lgpd/<uuid>/consentimentos — fluxo normal de
 * consentimento (paciente presente e capaz de consentir).
 *
 * @param {string} uuid
 * @param {object} payload
 * @param {string} payload.versao_termo   — ex: 'v2.1'
 * @param {string} payload.canal_coleta   — um de CANAIS_COLETA_CONSENTIMENTO
 * @returns {Promise<object>} resposta da API (201), data.status === 'ativo'
 */
export function registrarConsentimento(uuid, { versao_termo, canal_coleta }) {
  return requisitar(`/lgpd/${uuid}/consentimentos`, {
    method: 'POST',
    body: JSON.stringify({ versao_termo, canal_coleta }),
  });
}

/**
 * POST /pacientes/lgpd/<uuid>/consentimentos/dispensar-emergencia —
 * usado quando não é possível coletar o consentimento no momento
 * (paciente inconsciente, admissão de urgência, etc.). Exige uma
 * justificativa textual, que fica registrada em `observacao` na
 * resposta e é a base do log de auditoria dessa dispensa.
 *
 * O consentimento nasce com status "dispensado_emergencia" (não
 * "ativo") -- fica sinalizado como pendente de coleta numa consulta
 * futura; ver comentário no formulário de criação sobre isso.
 *
 * @param {string} uuid
 * @param {string} motivo — justificativa da dispensa (obrigatória)
 * @returns {Promise<object>} resposta da API (201)
 */
export function dispensarConsentimentoEmergencia(uuid, motivo) {
  return requisitar(`/lgpd/${uuid}/consentimentos/dispensar-emergencia`, {
    method: 'POST',
    body: JSON.stringify({ motivo }),
  });
}