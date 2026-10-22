// pacientesApi.js
//
// Camada de acesso às APIs de pacientes e de consultas (esta última só
// para o histórico). Espelha os controllers reais
// (paciente_pessoal_controller.py, paciente_clinico_controller.py,
// controller.py de consulta).
//
//   GET  /pacientes/pessoal/resumo?...            -> listarPacientes({...})
//   GET  /pacientes/pessoal/<uuid>                -> buscarDetalhePessoal(uuid)
//   GET  /pacientes/clinico/<uuid>                -> buscarDetalheClinico(uuid)
//   PUT  /pacientes/pessoal/<uuid>                -> atualizarPacientePessoal(uuid, payload)
//   PUT  /pacientes/clinico/<uuid>                -> atualizarPacienteClinico(uuid, payload)
//   GET  /consultas/paciente/historico/<uuid>     -> listarHistoricoConsultas(uuidPaciente)
//   POST /pacientes/pessoal/                      -> criarPacientePessoal(payload)
//   ... (blocos clínicos e LGPD mantidos abaixo)
//
// Resposta do backend (json_success / json_error):
//   sucesso: { status: "success", message: "...", data: {...} | [...] }
//   erro:    { status: "error",   message: "..." }
//
// LEITURA SEM STEP-UP: as rotas de detalhe (pessoal e clínico) usam
// acesso_auditado no back (só registram LogAcesso) -- decisão registrada
// nos controllers: leitura pura não exige reconfirmação de identidade.
// Step-up fica reservado para ESCREVER/deletar sensível (acao_sensivel).
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

/**
 * GET /pacientes/clinico/<uuid> — prontuário clínico completo:
 * paciente + alergias[] + doencas_cronicas[] + medicamentos_em_uso[]
 * + consentimento_ativo (booleano). Leitura auditada, sem step-up.
 *
 * Só médico/enfermeiro acessam (admin recebe 403 aqui no back).
 * NÃO usada pela ficha hoje -- mantida para quando a área clínica
 * (consulta ou aba clínica) precisar ler esses dados.
 *
 * @param {string} uuid
 */
export function buscarDetalheClinico(uuid) {
  return requisitar(`/clinico/${encodeURIComponent(uuid)}`, { method: 'GET' });
}

/**
 * Clínico + pessoal juntos (dois GETs simples, em paralelo).
 * NÃO usada pela ficha hoje -- mantida para o futuro fluxo clínico.
 *
 * @param {string} uuid
 * @returns {Promise<{clinico: object, pessoal: object}>}
 */
export function buscarDetalheCompleto(uuid) {
  return Promise.all([
    buscarDetalheClinico(uuid),
    buscarDetalhePessoal(uuid),
  ]).then(([clinico, pessoal]) => ({ clinico, pessoal }));
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
// clínicos passaram a ser registrados durante a CONSULTA. As funções
// abaixo continuam corretas e serão usadas pelo futuro fluxo de
// consulta; só não são chamadas durante a criação em si.
//
// Nenhuma rota de escrita abaixo é protegida por step-up (diferente
// das leituras de detalhe). Se isso mudar no backend, ajustar aqui.

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
// schema de atualização -- são imutáveis por natureza do contrato.)

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
// EDIÇÃO DE DADOS CLÍNICOS (peso, altura)
// ============================================
//
//   PUT /pacientes/clinico/<uuid> — PATCH parcial do eixo clínico.
//
// PERMISSÃO (back): aceita médico, enfermeiro E admin (com auditoria
// de exceção para admin -- auditar_excecao_por). Schema:
// PacienteAtualizarClinicoSchema (extra="forbid": só peso, altura,
// status passam; status só 'ativo'|'inativo' -- óbito tem rotas
// próprias).
//
// TIPO SANGUÍNEO NÃO VAI AQUI: ele é histórico de observações
// (ObservacaoTipoSanguineo), registrado via POST separado abaixo.

/**
 * @param {string} uuid
 * @param {object} payload — só os campos alterados ({ peso?, altura? })
 */
export function atualizarPacienteClinico(uuid, payload) {
  return requisitar(`/clinico/${encodeURIComponent(uuid)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// ============================================
// CONSENTIMENTO LGPD -- NÃO usado no fluxo de criação de paciente
// (mantido para o fluxo de consulta).
// ============================================

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
 */
export function registrarConsentimento(uuid, { versao_termo, canal_coleta }) {
  return requisitar(`/lgpd/${uuid}/consentimentos`, {
    method: 'POST',
    body: JSON.stringify({ versao_termo, canal_coleta }),
  });
}

/**
 * POST /pacientes/lgpd/<uuid>/consentimentos/dispensar-emergencia —
 * quando não é possível coletar o consentimento no momento. O
 * consentimento nasce com status "dispensado_emergencia" (não "ativo").
 *
 * @param {string} uuid
 * @param {string} motivo — justificativa da dispensa (obrigatória)
 */
export function dispensarConsentimentoEmergencia(uuid, motivo) {
  return requisitar(`/lgpd/${uuid}/consentimentos/dispensar-emergencia`, {
    method: 'POST',
    body: JSON.stringify({ motivo }),
  });
}

// ============================================
// BLOCOS CLÍNICOS (alergia, doença crônica, medicamento em uso, tipo
// sanguíneo) -- NÃO usados no fluxo de criação de paciente (decisão
// de produto: passaram a ser registrados durante a consulta). Mantidos
// para uso futuro. Contratos confirmados contra os schemas Pydantic
// reais do backend.
//
// Exceção: tipo_sanguineo tem UM outro caminho de entrada na criação,
// mas o PacienteCriarSchema do back IGNORA tipo_sanguineo em silêncio
// (extra="ignore") -- o select na tela de criação não persiste nada.
// Decidir: ou o front remove o select, ou o back passa a aceitar o
// campo (ver plano).
// ============================================

/** Enums de AlergiaCreateSchema/ReacaoAlergiaCreateSchema (copiados do db.Enum). */
export const TIPOS_REACAO_ALERGIA = [
  'cutanea', 'respiratoria', 'anafilaxia', 'gastrointestinal', 'cardiovascular', 'sistemica',
];
export const GRAVIDADES_ALERGIA = ['leve', 'moderada', 'grave'];

/**
 * POST /pacientes/clinico/<uuid>/alergias — cria uma alergia E a
 * primeira reação juntas.
 */
export function criarAlergia(uuid, payload) {
  return requisitar(`/clinico/${uuid}/alergias`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Enum de DoencaCronicaCreateSchema.status (copiado do db.Enum). */
export const STATUS_DOENCA_CRONICA = ['ativa', 'em-remissao'];

/**
 * POST /pacientes/clinico/<uuid>/doencas-cronicas
 */
export function criarDoencaCronica(uuid, payload) {
  return requisitar(`/clinico/${uuid}/doencas-cronicas`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Enum de MedicamentoEmUsoCreateSchema.status_uso (copiado do db.Enum). */
export const STATUS_USO_MEDICAMENTO = ['ativo', 'interrompido', 'concluido'];

/**
 * POST /pacientes/clinico/<uuid>/medicamentos-em-uso
 *
 * ATENÇÃO: id_catalogo é OBRIGATÓRIO e precisa existir em
 * catalogo_medicamentos (o service devolve 422 se não existir) -- NÃO
 * é texto livre. Ainda não temos busca/autocomplete do catálogo no
 * front (ver TODO antigo em pacientesCriacaoClinico.js).
 */
export function criarMedicamentoEmUso(uuid, payload) {
  return requisitar(`/clinico/${uuid}/medicamentos-em-uso`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Enum de TipoSanguineoCreateSchema.tipo_sanguineo (copiado do db.Enum). */
export const TIPOS_SANGUINEOS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'desconhecido'];

/**
 * POST /pacientes/clinico/<uuid>/tipo-sanguineo — registra nova
 * observação de tipo sanguíneo (histórico: cada chamada cria uma
 * observação nova, não sobrescreve a anterior).
 *
 * NÃO é usada no fluxo de CRIAÇÃO (o back ignora tipo_sanguineo no
 * POST /pessoal/) -- usada pela EDIÇÃO da ficha (quando o tipo muda)
 * e pelo futuro fluxo de consulta.
 *
 * @param {string} uuid
 * @param {string} tipoSanguineo — um de TIPOS_SANGUINEOS
 */
export function registrarTipoSanguineo(uuid, tipoSanguineo) {
  return requisitar(`/clinico/${uuid}/tipo-sanguineo`, {
    method: 'POST',
    body: JSON.stringify({ tipo_sanguineo: tipoSanguineo }),
  });
}