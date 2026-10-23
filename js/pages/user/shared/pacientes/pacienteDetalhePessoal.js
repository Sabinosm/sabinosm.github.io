// pacienteDetalhePessoal.js
//
// Renderiza o header + os campos de dados pessoais e gerenciamento da
// ficha e cuida da EDIÇÃO (única edição desta tela — o modal
// #pac-edit-overlay, que hoje tem só o grupo "Dados pessoais").
//
// FORMA DA RESPOSTA (GET /pacientes/pessoal/<uuid>): para
// médico/enfermeiro a PII vem em `data.pessoal`; admin recebe só o
// to_dict() base. Este módulo lê defensivamente dos dois lugares
// (prefere data.pessoal[campo], cai em data[campo]) — TODO: confirmar
// o shape exato e simplificar depois.
//
// Campos imutáveis (nem existem no schema de atualização): cpf,
// data_nascimento. Nome existe no schema de atualização mas não vai
// pro modal por decisão de produto ("exceto alguns como cpf, data de
// nascimento e nome").

import { ApiError, atualizarPacientePessoal } from "./pacientesApi.js";
// TODO: ajustar o caminho conforme onde fica pacienteValidation.js
import { validarAtualizarPacientePessoal } from "../../../../sharedConfig/validacoes/pacienteValidation.js";
import { exibirMensagem } from "../../../../shared/feedback.js";

// ids dos inputs do modal -> nome do campo no payload (schema do back)
const CAMPOS_MODAL = Object.freeze({
  'pac-edit-nome': 'nome_completo',
  'pac-edit-telefone': 'telefone',
  'pac-edit-email': 'email',
  'pac-edit-logradouro': 'logradouro',
  'pac-edit-numero': 'numero_residencia',
  'pac-edit-cep': 'cep',
  'pac-edit-rg': 'rg',
  'pac-edit-emergencia-nome': 'contato_emergencia_nome',
  'pac-edit-emergencia-telefone': 'contato_emergencia_telefone',
});

let pacienteAtual = null;
let uuidAtual = null;
let salvando = false;

/** Renderiza header + blocos pessoal/gerenciamento e liga o modal. */
export function inicializarPessoal(paciente, uuid) {
  pacienteAtual = paciente;
  uuidAtual = uuid;

  renderizarHeader(paciente);
  renderizarCampos(paciente);
  configurarModal();
}

// ============================================================
// Leitura defensiva do shape da resposta
// ============================================================
function campo(paciente, nome) {
  const pessoal = paciente?.pessoal ?? {};
  if (pessoal[nome] !== undefined && pessoal[nome] !== null && pessoal[nome] !== '') return pessoal[nome];
  if (paciente?.[nome] !== undefined && paciente?.[nome] !== null && paciente?.[nome] !== '') return paciente[nome];
  return null;
}

function formatarData(isoOuData) {
  if (!isoOuData) return '—';
  const somenteData = String(isoOuData).slice(0, 10);
  const [ano, mes, dia] = somenteData.split('-');
  if (!ano || !mes || !dia) return somenteData;
  return `${dia}/${mes}/${ano}`;
}

function sexoLabel(valor) {
  return ({ M: 'Masculino', F: 'Feminino', I: 'Indeterminado' })[valor] ?? valor ?? '—';
}

function statusBadge(status) {
  const badge = document.getElementById('patient-status-badge');
  if (status === 'ativo') {
    badge.className = 'consult-status status--em-atendimento';
    badge.innerHTML = '<span class="status-dot"></span> Ativo';
  } else if (status === 'obito') {
    badge.className = 'consult-status status--inativo';
    badge.textContent = 'Óbito';
  } else {
    badge.className = 'consult-status status--inativo';
    badge.textContent = 'Inativo';
  }
}

// ============================================================
// Renderização
// ============================================================
function renderizarHeader(p) {
  const nome = campo(p, 'nome_completo') ?? 'Paciente';
  document.getElementById('patient-nome').textContent = nome;
  const iniciais = nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
  document.getElementById('patient-avatar-iniciais').textContent = iniciais || '?';

  const partes = [
    campo(p, 'cpf') ? `CPF ${campo(p, 'cpf')}` : null,
    campo(p, 'data_nascimento') ? `Nasc. ${formatarData(campo(p, 'data_nascimento'))}` : null,
    sexoLabel(campo(p, 'sexo_biologico')) !== '—' ? sexoLabel(campo(p, 'sexo_biologico')) : null,
  ].filter(Boolean);
  document.getElementById('patient-meta').textContent = partes.join(' · ') || '—';

  statusBadge(p.status);
}

function setText(id, valor) {
  document.getElementById(id).textContent = valor ?? '—';
}

function renderizarCampos(p) {
  setText('pf-view-nome', campo(p, 'nome_completo'));
  setText('pf-view-cpf', campo(p, 'cpf'));
  setText('pf-view-rg', campo(p, 'rg'));
  setText('pf-view-nascimento', formatarData(campo(p, 'data_nascimento')));
  setText('pf-view-sexo', sexoLabel(campo(p, 'sexo_biologico')));
  setText('pf-view-sangue', campo(p, 'tipo_sanguineo'));
  setText('pf-view-peso', campo(p, 'peso') != null ? `${campo(p, 'peso')} kg` : null);
  setText('pf-view-altura', campo(p, 'altura') != null ? `${campo(p, 'altura')} cm` : null);
  setText('pf-view-telefone', campo(p, 'telefone'));
  setText('pf-view-email', campo(p, 'email'));

  const endereco = [campo(p, 'logradouro'), campo(p, 'numero_residencia')].filter(Boolean).join(', ');
  setText('pf-view-endereco', endereco || null);
  setText('pf-view-cep', campo(p, 'cep'));
  setText('pf-view-emergencia-nome', campo(p, 'contato_emergencia_nome'));
  setText('pf-view-emergencia-telefone', campo(p, 'contato_emergencia_telefone'));

  // Gerenciamento
  const labelsStatus = { ativo: 'Ativo', inativo: 'Inativo', obito: 'Óbito' };
  setText('pf-view-status', labelsStatus[p.status] ?? p.status);
  setText('pf-view-primeiro-atendimento', formatarData(campo(p, 'data_primeiro_atendimento')));
  setText('pf-view-cadastrado-por', campo(p, 'cadastrado_por'));
  setText('pf-view-criado-em', formatarData(campo(p, 'criado_em')));
}

// ============================================================
// Modal de edição (dados pessoais apenas)
// ============================================================
function configurarModal() {
  const overlay = document.getElementById('pac-edit-overlay');
  document.getElementById('btn-editar-pessoal').addEventListener('click', abrirModal);
  document.getElementById('pac-edit-close').addEventListener('click', fecharModal);
  document.getElementById('pac-edit-cancel').addEventListener('click', fecharModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) fecharModal(); });
  document.getElementById('pac-edit-salvar').addEventListener('click', salvar);
}

function abrirModal() {
  preencherModal();
  limparErrosModal();
  document.getElementById('pac-edit-overlay').classList.add('aberto'); // TODO: usar a classe real do CSS do overlay
}

function fecharModal() {
  document.getElementById('pac-edit-overlay').classList.remove('aberto');
}

function preencherModal() {
  for (const id of Object.keys(CAMPOS_MODAL)) {
    const input = document.getElementById(id);
    if (input) input.value = campo(pacienteAtual, CAMPOS_MODAL[id]) ?? '';
  }
}

function limparErrosModal() {
  Object.keys(CAMPOS_MODAL).forEach(id => {
    const erroEl = document.getElementById(`${id}-error`);
    if (erroEl) erroEl.textContent = '';
    document.getElementById(id)?.closest('.field-group')?.classList.remove('field-group--has-error');
  });
}

function aplicarErros(erros) {
  const idsPorCampo = Object.fromEntries(Object.entries(CAMPOS_MODAL).map(([id, campo]) => [campo, id]));
  Object.entries(erros).forEach(([campo, mensagem]) => {
    const id = idsPorCampo[campo];
    if (!id) return;
    const erroEl = document.getElementById(`${id}-error`);
    if (erroEl) erroEl.textContent = mensagem;
    document.getElementById(id)?.closest('.field-group')?.classList.add('field-group--has-error');
  });
}

async function salvar() {
  if (salvando) return;
  limparErrosModal();

  const payload = {};
  for (const [id, nomeCampo] of Object.entries(CAMPOS_MODAL)) {
    const input = document.getElementById(id);
    if (input && input.value.trim() !== '') payload[nomeCampo] = input.value.trim();
  }

  const { dados, erros } = validarAtualizarPacientePessoal(payload);
  if (Object.keys(erros).length > 0) {
    aplicarErros(erros);
    exibirMensagem('Confira os campos destacados antes de continuar.', 'erro');
    return;
  }

  salvando = true;
  const botao = document.getElementById('pac-edit-salvar');
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Salvando…';

  try {
    const resposta = await atualizarPacientePessoal(uuidAtual, dados);
    pacienteAtual = resposta.data ?? pacienteAtual;
    renderizarHeader(pacienteAtual);
    renderizarCampos(pacienteAtual);
    fecharModal();
    exibirMensagem('Dados pessoais atualizados.', 'sucesso');
  } catch (erro) {
    exibirMensagem(erro instanceof ApiError ? erro.message : 'Não foi possível salvar as alterações.', 'erro');
  } finally {
    salvando = false;
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
}