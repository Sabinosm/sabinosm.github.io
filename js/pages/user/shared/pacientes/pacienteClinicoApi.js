// pacienteClinicoApi.js
//
// Camada de acesso às APIs dos blocos clínicos do paciente: alergias,
// doenças crônicas, medicamentos em uso e tipo sanguíneo. Espelha os
// controllers reais (alergia_controller.py, doenca_cronica_controller.py,
// medicamentos_em_uso_controller.py, obs_tipo_sanguineo_controller.py).
//
// ATENÇÃO — ARQUITETURA DE DOIS BLUEPRINTS POR DOMÍNIO:
//
//   LEITURA (bp):       GET /pacientes/<uuid>/alergias|doencas-cronicas|
//                            medicamentos-em-uso|tipo-sanguineo[...]
//                       -> só @requer_login + tenant. Decoração MUITO
//                          permissiva hoje (admin consegue ler): se a
//                          regra for "admin não vê clínico", endurecer
//                          os decorators no back para exigir papel
//                          clínico. O front esconde a UI, mas a API
//                          fica exposta assim.
//
//   ESCRITA (bp_escrita): aninhada em Atendimento:
//                       /atendimentos/<uuid_atendimento>/pacientes/
//                           <uuid_paciente>/...
//                       -> @requer_papel_clinico("medico","enfermeiro")
//                          + auditoria. O service (ContextoClinicoService)
//                          valida: dono do atendimento (enfermeiro só em
//                          triagem), atendimento em andamento, paciente
//                          sem óbito.
//
//   CONSEQUÊNCIA: TODA escrita clínica exige um uuid_atendimento
//   válido e em andamento. A ficha do paciente (pacientesDetalhe.html)
//   só pode editar esses blocos se tiver um atendimento em contexto —
//   sem isso, a seção clínica da ficha fica LEITURA apenas (ver plano).
//
// STEP-UP (@acao_sensivel): remover/restaurar medicamento exigem
// confirmação de identidade ANTES da chamada (pedirConfirmacao(acao) —
// o `acao` é o mesmo nome do decorator no back). Alergia/doença
// usam @acesso_auditado (sem step-up).
//
// TODO: confirmar os url_prefix de cada blueprint no app.py (assumi
// /pacientes para leitura e /atendimentos para escrita). Quando
// confirmar, APAGAR as funções clínicas obsoletas de pacientesApi.js
// (criarAlergia, criarDoencaCronica, criarMedicamentoEmUso,
// registrarTipoSanguineo, buscarDetalheClinico), que apontam para
// rotas que não existem.

import { URL_BASE_API } from "../../../../sharedConfig/urlConfig.js";
import { ApiError } from "./pacientesApi.js";

const BASE_LEITURA = `${URL_BASE_API}/pacientes`;       // bp (leitura)
const BASE_ESCRITA = `${URL_BASE_API}/atendimentos`;    // bp_escrita (mesma url_prefix de bp_atendimento)

function headersPadrao() {
  return { 'Content-Type': 'application/json' };
}

async function requisitar(url, options = {}) {
  // `naoEncontradoOk`: para LEITURA de blocos clínicos o 404 é um estado
  // NORMAL ("paciente ainda não tem esse dado"), não um erro. Com essa
  // opção, 404 devolve { status: "success", data: null } e o caller
  // renderiza o estado vazio (ex.: "Nenhuma alergia registrada")
  // em vez de mostrar mensagem de falha.
  const { naoEncontradoOk = false, ...fetchOptions } = options;
  let resposta;
  try {
    resposta = await fetch(url, { credentials: "include", headers: headersPadrao(), ...fetchOptions });
  } catch {
    throw new ApiError("Não foi possível conectar ao servidor. Verifique sua internet.", 0);
  }
  if (resposta.status === 404 && naoEncontradoOk) {
    return { status: 'success', message: 'Sem dados registrados.', data: null };
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

/** Prefixo de escrita aninhado no atendimento. */
function escrita(uuidAtendimento, uuidPaciente) {
  return `/${encodeURIComponent(uuidAtendimento)}/pacientes${encodeURIComponent(uuidPaciente)}`;
}

const _enc = encodeURIComponent;

// ============================================================
// ALERGIAS
//   leitura:  GET  /pacientes/<uuid>/alergias
//   escrita:  POST .../alergias                      (cria alergia + 1ª reação)
//             PUT  .../alergias<uuid_alergia>         (só codigo_substancia/flag_confirmado)
//             POST .../alergias/<uuid_alergia>/reacoes (nova reação)
//             POST .../alergias/<uuid_alergia>/restaurar
//             DELETE .../alergias/<uuid_alergia>       [step-up: pedirConfirmacao('remover_alergia')]
//             DELETE .../alergias/reacoes<uuid_reacao>
// ============================================================
export const TIPOS_MANIFESTACAO_ALERGIA = Object.freeze([
  'cutanea', 'respiratoria', 'anafilaxia', 'gastrointestinal', 'cardiovascular', 'sistemica',
]);
export const GRAVIDADES_ALERGIA = Object.freeze(['leve', 'moderada', 'grave']);

export function listarAlergias(uuidPaciente) {
  return requisitar(`${BASE_LEITURA}/${_enc(uuidPaciente)}/alergias`, { method: 'GET', naoEncontradoOk: true });
}

export function adicionarAlergia(uuidAtendimento, uuidPaciente, payload) {
  return requisitar(`${BASE_ESCRITA}${escrita(uuidAtendimento, uuidPaciente)}/alergias`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function atualizarAlergia(uuidAtendimento, uuidPaciente, uuidAlergia, payload) {
  return requisitar(`${BASE_ESCRITA}${escrita(uuidAtendimento, uuidPaciente)}/alergias${_enc(uuidAlergia)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function adicionarReacao(uuidAtendimento, uuidPaciente, uuidAlergia, payload) {
  return requisitar(
    `${BASE_ESCRITA}${escrita(uuidAtendimento, uuidPaciente)}/alergias/${_enc(uuidAlergia)}/reacoes`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function removerAlergia(uuidAtendimento, uuidPaciente, uuidAlergia, motivo) {
  // @acao_sensivel("remover_alergia"): chamar pedirConfirmacao('remover_alergia') ANTES.
  return requisitar(
    `${BASE_ESCRITA}${escrita(uuidAtendimento, uuidPaciente)}/alergias${_enc(uuidAlergia)}`,
    { method: 'DELETE', body: JSON.stringify(motivo) },
  );
}

export function restaurarAlergia(uuidAtendimento, uuidPaciente, uuidAlergia) {
  return requisitar(
    `${BASE_ESCRITA}${escrita(uuidAtendimento, uuidPaciente)}/alergias/${_enc(uuidAlergia)}/restaurar`,
    { method: 'POST' },
  );
}

/** Mesmo contrato de remoção da alergia (AlergiaRemoverSchema é reutilizado). */
export function removerReacao(uuidAtendimento, uuidPaciente, uuidReacao, motivo) {
  return requisitar(
    `${BASE_ESCRITA}${escrita(uuidAtendimento, uuidPaciente)}/alergias/reacoes${_enc(uuidReacao)}`,
    { method: 'DELETE', body: JSON.stringify(motivo) },
  );
}

// ============================================================
// DOENÇAS CRÔNICAS
//   leitura:  GET /pacientes/<uuid>/doencas-cronicas
//             GET /pacientes/<uuid>/doencas-cronicas/historico
//   escrita:  POST   .../doencas-cronicas            (nova doença, nasce vigente)
//             PUT    .../doencas-cronicas<uuid>     (SÓ observacoes!)
//             POST   .../doencas-cronicas/<uuid>/revisar  (muda status/CID/desde; fecha a linha vigente e cria outra)
//             POST   .../doencas-cronicas/<uuid>/restaurar
//             DELETE .../doencas-cronicas<uuid>     [step-up: pedirConfirmacao('remover_doenca_cronica')]
//
// REGRA DE OURO: mudança de status/CID/desde NUNCA é PUT — é /revisar.
// ============================================================
export const STATUS_DOENCA_CRONICA = Object.freeze(['ativa', 'em-remissao']);

export function listarDoencasCronicas(uuidPaciente) {
  return requisitar(`${BASE_LEITURA}/${_enc(uuidPaciente)}/doencas-cronicas`, { method: 'GET', naoEncontradoOk: true });
}

export function listarHistoricoDoencasCronicas(uuidPaciente) {
  return requisitar(`${BASE_LEITURA}/${_enc(uuidPaciente)}/doencas-cronicas/historico`, { method: 'GET', naoEncontradoOk: true });
}

export function adicionarDoencaCronica(uuidAtendimento, uuidPaciente, payload) {
  return requisitar(`${BASE_ESCRITA}${escrita(uuidAtendimento, uuidPaciente)}/doencas-cronicas`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Só corrige `observacoes`. Status/CID/desde vão por revisarDoencaCronica. */
export function atualizarDoencaCronica(uuidAtendimento, uuidPaciente, uuidDoenca, payload) {
  return requisitar(
    `${BASE_ESCRITA}${escrita(uuidAtendimento, uuidPaciente)}/doencas-cronicas/${_enc(uuidDoenca)}`,
    { method: 'PUT', body: JSON.stringify(payload) },
  );
}

/** Revisão clínica: fecha a linha vigente e cria a nova (devolve 201 com a NOVA). */
export function revisarDoencaCronica(uuidAtendimento, uuidPaciente, uuidDoenca, payload) {
  return requisitar(
    `${BASE_ESCRITA}${escrita(uuidAtendimento, uuidPaciente)}/doencas-cronicas/${_enc(uuidDoenca)}/revisar`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function removerDoencaCronica(uuidAtendimento, uuidPaciente, uuidDoenca, motivo) {
  // @acao_sensivel("remover_doenca_cronica"): pedirConfirmacao('remover_doenca_cronica') ANTES.
  return requisitar(
    `${BASE_ESCRITA}${escrita(uuidAtendimento, uuidPaciente)}/doencas-cronicas/${_enc(uuidDoenca)}`,
    { method: 'DELETE', body: JSON.stringify(motivo) },
  );
}

export function restaurarDoencaCronica(uuidAtendimento, uuidPaciente, uuidDoenca) {
  return requisitar(
    `${BASE_ESCRITA}${escrita(uuidAtendimento, uuidPaciente)}/doencas-cronicas/${_enc(uuidDoenca)}/restaurar`,
    { method: 'POST' },
  );
}

// ============================================================
// MEDICAMENTOS EM USO
//   leitura:  GET /pacientes/<uuid>/medicamentos-em-uso[?ativos=true]
//             GET /pacientes/<uuid>/medicamentos-em-uso/interacoes
//   escrita:  POST   .../medicamentos-em-uso             (registra ativo; devolve alertas_interacao)
//             POST   .../medicamentos-em-uso/<uuid>/substituir  (troca dose/freq/descrição: fecha o antigo, cria o novo)
//             POST   .../medicamentos-em-uso/<uuid>/encerrar    (status interrompido|concluido)
//             POST   .../medicamentos-em-uso/<uuid>/restaurar   [step-up: pedirConfirmacao('restaurar_medicamento_em_uso')]
//             DELETE .../medicamentos-em-uso/<uuid>             [step-up: pedirConfirmacao('remover_medicamento_em_uso')]
//
// Não existe "atualizar no lugar": dose/frequência mudam via /substituir.
// ============================================================
export function listarMedicamentosEmUso(uuidPaciente, { apenasAtivos = false } = {}) {
  const qs = apenasAtivos ? '?ativos=true' : '';
  return requisitar(`${BASE_LEITURA}/${_enc(uuidPaciente)}/medicamentos-em-uso${qs}`, { method: 'GET', naoEncontradoOk: true });
}

export function verificarInteracoesDoPaciente(uuidPaciente) {
  return requisitar(`${BASE_LEITURA}/${_enc(uuidPaciente)}/medicamentos-em-uso/interacoes`, { method: 'GET', naoEncontradoOk: true });
}

export function registrarMedicamentoEmUso(uuidAtendimento, uuidPaciente, payload) {
  return requisitar(`${BASE_ESCRITA}${escrita(uuidAtendimento, uuidPaciente)}/medicamentos-em-uso`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  // resposta.data = { medicamento: {...}, alertas_interacao: [...] }
}

export function substituirMedicamentoEmUso(uuidAtendimento, uuidPaciente, uuidMedicamento, payload) {
  return requisitar(
    `${BASE_ESCRITA}${escrita(uuidAtendimento, uuidPaciente)}/medicamentos-em-uso/${_enc(uuidMedicamento)}/substituir`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function encerrarMedicamentoEmUso(uuidAtendimento, uuidPaciente, uuidMedicamento, payload) {
  return requisitar(
    `${BASE_ESCRITA}${escrita(uuidAtendimento, uuidPaciente)}/medicamentos-em-uso/${_enc(uuidMedicamento)}/encerrar`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function removerMedicamentoEmUso(uuidAtendimento, uuidPaciente, uuidMedicamento, motivo) {
  // @acao_sensivel("remover_medicamento_em_uso"): pedirConfirmacao('remover_medicamento_em_uso') ANTES.
  return requisitar(
    `${BASE_ESCRITA}${escrita(uuidAtendimento, uuidPaciente)}/medicamentos-em-uso/${_enc(uuidMedicamento)}`,
    { method: 'DELETE', body: JSON.stringify(motivo) },
  );
}

export function restaurarMedicamentoEmUso(uuidAtendimento, uuidPaciente, uuidMedicamento) {
  // @acao_sensivel("restaurar_medicamento_em_uso"): pedirConfirmacao('restaurar_medicamento_em_uso') ANTES.
  return requisitar(
    `${BASE_ESCRITA}${escrita(uuidAtendimento, uuidPaciente)}/medicamentos-em-uso/${_enc(uuidMedicamento)}/restaurar`,
    { method: 'POST' },
  );
}

// ============================================================
// TIPO SANGUÍNEO (histórico de observações — append-only)
//   leitura:  GET /pacientes/<uuid>/tipo-sanguineo            (vigente; data=null se nunca registrado)
//             GET /pacientes/<uuid>/tipo-sanguineo/historico
//   escrita:  POST .../tipo-sanguineo   { tipo_sanguineo }    (cria observação nova; NUNCA sobrescreve)
// ============================================================
export const TIPOS_SANGUINEOS = Object.freeze([
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'desconhecido',
]);

export function buscarTipoSanguineoVigente(uuidPaciente) {
  return requisitar(`${BASE_LEITURA}/${_enc(uuidPaciente)}/tipo-sanguineo`, { method: 'GET', naoEncontradoOk: true });
  // data pode ser null (nunca registrado). COM O 404 TOLERADO, todas as
  // funções de LEITURA deste arquivo devolvem data: null quando o paciente
  // ainda não tem aquele bloco — o caller deve renderizar estado vazio,
  // não mensagem de erro.
}

export function listarHistoricoTipoSanguineo(uuidPaciente) {
  return requisitar(`${BASE_LEITURA}/${_enc(uuidPaciente)}/tipo-sanguineo/historico`, { method: 'GET', naoEncontradoOk: true });
}

export function registrarTipoSanguineo(uuidAtendimento, uuidPaciente, tipoSanguineo) {
  return requisitar(`${BASE_ESCRITA}${escrita(uuidAtendimento, uuidPaciente)}/tipo-sanguineo`, {
    method: 'POST',
    body: JSON.stringify({ tipo_sanguineo: tipoSanguineo }),
  });
}