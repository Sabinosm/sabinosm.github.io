// pacientesApi.js
//
// Camada de acesso às APIs do domínio PACIENTE (eixo pessoal +
// histórico de consultas + criação). Espelha os controllers reais
// (paciente_pessoal_controller.py, controller.py de consulta).
//
//   GET  /pacientes/pessoal/resumo?...            -> listarPacientes({...})
//   GET  /pacientes/pessoal/<uuid>                -> buscarDetalhePessoal(uuid)
//   PUT  /pacientes/pessoal/<uuid>                -> atualizarPacientePessoal(uuid, payload)
//   PUT  /pacientes/clinico/<uuid>                -> atualizarPacienteClinico(uuid, payload)
//   GET  /consultas/paciente/historico/<uuid>     -> listarHistoricoConsultas(uuidPaciente)
//   POST /pacientes/pessoal/                      -> criarPacientePessoal(payload)
//   POST /pacientes/consentimento-digital/<uuid>/consentimentos[...]                    (fluxo de consulta)
//   POST /pacientes/consentimento-digital/<uuid>/consentimentos/dispensar-emergencia    (fluxo de consulta)
//
// Resposta do backend (json_success / json_error):
//   sucesso: { status: "success", message: "...", data: {...} | [...] }
//   erro:    { status: "error",   message: "..." }
//
// ESCOPO DESTE ARQUIVO: só o que é "do paciente em si". Os blocos
// clínicos (alergias, doenças crônicas, medicamentos em uso, tipo
// sanguíneo) moram em pacienteClinicoApi.js — e TODA escrita clínica
// exige uuid_atendimento (edição só durante atendimento; a ficha do
// paciente é leitura nesses blocos).
//
// ApiError é a classe de erro compartilhada: pacienteClinicoApi.js e
// catalogoMedicamentosApi.js importam daqui (não duplicar).
//
// LEITURA SEM STEP-UP: a rota de detalhe pessoal usa acesso_auditado
// no back (só registra LogAcesso) -- decisão registrada nos controllers:
// leitura pura não exige reconfirmação de identidade. Step-up fica
// reservado para ESCREVER/deletar sensível (acao_sensivel).
//
// ============================================
// LISTAGEM — modelo Paciente.to_dict_few()
// ============================================
//
// { uuid, nome_completo, cpf_inicio, cadastrado_por, criado_em,
//   sexo_biologico, status, peso, altura, nao_identificado }
//
// nome_completo e cpf_inicio já vêm descriptografados pelo service.
// NÃO existe filtro por texto nesta rota: nome e CPF vivem cifrados
// (AES-256-GCM), sem ILIKE possível -- a busca da lista é client-side.

import { URL_BASE_API } from "../../../../sharedConfig/urlConfig.js";

const BASE_URL = `${URL_BASE_API}/pacientes`;
// TODO: confirmar o prefixo de registro do blueprint de consulta
// (assumi /consultas; ajustar se o register der outro prefixo).
const BASE_URL_CONSULTAS = `${URL_BASE_API}/consultas`;

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

async function requisitar(path, options = {}, baseUrl = BASE_URL) {
  let resposta;
  try {
    resposta = await fetch(`${baseUrl}${path}`, {
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
 * GET /pacientes/pessoal/resumo — lista paginada (8 por página;
 * 'pagina' é 0, 1, 2... e o backend multiplica por 8 para o offset).
 *
 * @param {object} [opcoes]
 * @param {number} [opcoes.pagina=0]
 * @param {string} [opcoes.status]          — 'ativo' | 'inativo' | 'obito'
 * @param {string} [opcoes.sexoBiologico]   — 'masculino' | 'feminino'
 */
export function listarPacientes({ pagina = 0, status, sexoBiologico } = {}) {
  const params = new URLSearchParams();
  params.set('pagina', String(pagina));
  if (status) params.set('status', status);
  if (sexoBiologico) params.set('sexo_biologico', sexoBiologico);

  return requisitar(`/pessoal/resumo?${params.toString()}`, { method: 'GET' });
}

/**
 * GET /pacientes/pessoal/<uuid> — dados cadastrais completos do
 * paciente. Leitura auditada (acesso_auditado), sem step-up.
 *
 * ATENÇÃO (permissões do back): a PII (nome, cpf, telefone, email,
 * endereço) só vem em `data.pessoal` para médico/enfermeiro
 * (com_pii); admin recebe só o to_dict() base -- que INCLUI
 * tipo_sanguineo, peso e altura (decisão de produto: exibir para
 * todos os papéis).
 *
 * @param {string} uuid
 */
export function buscarDetalhePessoal(uuid) {
  return requisitar(`/pessoal/${encodeURIComponent(uuid)}`, { method: 'GET' });
}

// ============================================
// HISTÓRICO DE CONSULTAS DO PACIENTE
// ============================================
//
//   GET /consultas/paciente/historico/<uuid_paciente>
//
// Item da resposta (Consulta.to_dict()):
//   { uuid, origem_encaminhamento, status_consulta, data_hora_inicio,
//     data_hora_fim, desfecho_final, paciente_uuid }
//
// O repository limita a 5 consultas (as mais recentes). Nenhum dado
// clínico do atendimento vem aqui -- é só o resumo do ciclo da
// consulta (origem, status, datas, desfecho).
//
// PERMISSÃO: a rota aceita admin também (regra de produto: admin vê
// o histórico, só não vê os detalhes clínicos). O decorator foi
// ajustado para @requer_admin_ou_papel_clinico("enfermeiro", "medico").

/**
 * @param {string} uuidPaciente
 * @returns {Promise<object>} resposta da API, `data` é um array (até 5).
 */
export function listarHistoricoConsultas(uuidPaciente) {
  return requisitar(
    `/paciente/historico/${encodeURIComponent(uuidPaciente)}`,
    { method: 'GET' },
    BASE_URL_CONSULTAS,
  );
}

// ============================================
// CRIAÇÃO DE PACIENTE
// ============================================
//
// SIMPLIFICADO (decisão de produto): o cadastro cobre SÓ dados
// pessoais (POST /pacientes/pessoal/). Consentimento LGPD e blocos
// clínicos passaram a ser registrados durante a CONSULTA/atendimento
// (ver pacienteClinicoApi.js).
//
// ATENÇÃO: o PacienteCriarSchema do back IGNORA tipo_sanguineo em
// silêncio (extra="ignore") — o select na tela de criação não
// persiste nada hoje. Decidir: ou o front remove o select, ou o back
// passa a aceitar o campo.

/**
 * POST /pacientes/pessoal/ — cria o paciente (Paciente +
 * PacienteDadosPessoais). Único passo do cadastro.
 *
 * @param {object} payload — espelha PacienteCriarSchema
 * @returns {Promise<object>} resposta da API, `data.uuid` é o
 *   identificador do paciente recém-criado.
 */
export function criarPacientePessoal(payload) {
  return requisitar('/pessoal/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ============================================
// EDIÇÃO DE DADOS PESSOAIS
// ============================================
//
//   PUT /pacientes/pessoal/<uuid> — PATCH parcial (só o que vier é
//   aplicado; ver PacienteAtualizarPessoalSchema / campos_informados).
//
// PERMISSÃO (back): a rota aceita médico, enfermeiro E admin -- e a
// regra de produto atual é que os três editam (admin incluído).
//
// CAMPOS: nome_completo, telefone, email, logradouro, cep,
// numero_residencia, rg, contato_emergencia_nome,
// contato_emergencia_telefone. (cpf e data_nascimento nem existem no
// schema de atualização -- são imutáveis por natureza do contrato.
// Nome existe no schema, mas o produto tratou como imutável na ficha.)

/**
 * @param {string} uuid
 * @param {object} payload — só os campos alterados
 */
export function atualizarPacientePessoal(uuid, payload) {
  return requisitar(`/pessoal/${encodeURIComponent(uuid)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// ============================================
// EDIÇÃO DO EIXO CLÍNICO BASE (peso, altura, status)
// ============================================
//
//   PUT /pacientes/clinico/<uuid> — PATCH parcial do eixo base.
//
// ATENÇÃO — escopo: isto NÃO é um bloco clínico de prontuário
// (alergia/doença/medicamento/tipo sanguíneo). É o eixo "físico" do
// paciente (peso/altura/status). Hoje a ficha NÃO edita peso/altura
// (decisão: dados clínicos só mudam durante atendimento) — esta
// função fica disponível para o fluxo de atendimento/consulta.
//
// PERMISSÃO (back): aceita médico, enfermeiro E admin (com auditoria
// de exceção para admin -- auditar_excecao_por). Schema:
// PacienteAtualizarClinicoSchema (extra="forbid": só peso, altura,
// status passam; status só 'ativo'|'inativo' -- óbito tem rotas
// próprias).
//
// TIPO SANGUÍNEO NÃO VAI AQUI: ele é histórico de observações
// (ObservacaoTipoSanguineo), registrado via pacienteClinicoApi.js.

/**
 * @param {string} uuid
 * @param {object} payload — só os campos alterados ({ peso?, altura?, status? })
 */
export function atualizarPacienteClinico(uuid, payload) {
  return requisitar(`/clinico/${encodeURIComponent(uuid)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// ============================================
// CONSENTIMENTO LGPD -- fluxo de consulta/atendimento (não usado na
// criação de paciente nem na ficha).
// ============================================

/** Os 4 valores aceitos pelo enum canal_coleta (coluna do banco). */
export const CANAIS_COLETA_CONSENTIMENTO = [
  'presencial-papel',
  'presencial-digital',
  'portal-online',
  'totem',
];

/**
 * POST /pacientes/consentimento-digital/<uuid>/consentimentos — fluxo normal de
 * consentimento (paciente presente e capaz de consentir).
 */
export function registrarConsentimento(uuid, { versao_termo, canal_coleta }) {
  return requisitar(`/consentimento-digital/${uuid}/consentimentos`, {
    method: 'POST',
    body: JSON.stringify({ versao_termo, canal_coleta }),
  });
}

/**
 * POST /pacientes/consentimento-digital/<uuid>/consentimentos/dispensar-emergencia —
 * quando não é possível coletar o consentimento no momento. O
 * consentimento nasce com status "dispensado_emergencia" (não "ativo").
 *
 * @param {string} uuid
 * @param {string} motivo — justificativa da dispensa (obrigatória)
 */
export function dispensarConsentimentoEmergencia(uuid, motivo) {
  return requisitar(`/consentimento-digital/${uuid}/consentimentos/dispensar-emergencia`, {
    method: 'POST',
    body: JSON.stringify({ motivo }),
  });
}