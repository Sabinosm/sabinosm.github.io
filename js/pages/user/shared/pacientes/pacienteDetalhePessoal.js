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
//
// EDIÇÃO (modal):
//  - Os dados atuais aparecem como PLACEHOLDER; o input começa vazio.
//    Input vazio = "manter o valor atual" (PATCH parcial: só o que for
//    digitado vai no payload).
//  - Campos opcionais têm um link "Limpar" logo abaixo do input.
//    Marcar "Limpar" envia `campo: null` no payload (o back precisa
//    aceitar null explícito para esses campos -- ver
//    CAMPOS_LIMPAVEIS em schema_paciente.py).
//  - Admin não recebe PII no GET (só médico/enfermeiro). Nesse caso o
//    placeholder é genérico (PLACEHOLDER_SEM_PII) e o "Limpar" fica
//    sempre disponível, já que não dá para saber se há valor.

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

// Campos que podem ser APAGADOS pelo usuário (opcionais no domínio).
// Fora da lista: nome_completo (imutável aqui), logradouro (min_length=1
// no schema) e cep (a região é derivada dele -- apagar deixaria
// id_regiao_geografica desatualizada). Manter alinhado com
// CAMPOS_LIMPAVEIS do back.
const IDS_LIMPAVEIS = new Set([
  'pac-edit-telefone',
  'pac-edit-email',
  'pac-edit-numero',
  'pac-edit-rg',
  'pac-edit-emergencia-nome',
  'pac-edit-emergencia-telefone',
]);

// Placeholder quando o perfil (admin) não recebe os dados pessoais.
const PLACEHOLDER_SEM_PII = '9999999';

const TEXTO_LIMPAR = 'Limpar';
const TEXTO_DESFAZER = 'Desfazer';
const PLACEHOLDER_REMOVER = 'Será removido ao salvar';

let pacienteAtual = null;
let uuidAtual = null;
let salvando = false;
let botoesLimparMontados = false;
const idsParaLimpar = new Set();

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

/** Admin: o back não devolve `pessoal` (PII) para ele. */
function semAcessoAPii() {
  return !pacienteAtual?.pessoal;
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
  montarBotoesLimpar();
}

function abrirModal() {
  preencherModal();
  limparErrosModal();
  document.getElementById('pac-edit-overlay').classList.add('aberto'); // TODO: usar a classe real do CSS do overlay
}

function fecharModal() {
  document.getElementById('pac-edit-overlay').classList.remove('aberto');
}

// ---------------------------------------------------------------
// Link "Limpar" (criado por JS, logo abaixo de cada input limpável)
// ---------------------------------------------------------------
function botaoLimpar(id) {
  return document.querySelector(`.field-clear[data-input-id="${id}"]`);
}

function montarBotoesLimpar() {
  if (botoesLimparMontados) return;
  botoesLimparMontados = true;

  for (const id of IDS_LIMPAVEIS) {
    const input = document.getElementById(id);
    if (!input) continue;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'field-clear';
    btn.dataset.inputId = id;
    btn.textContent = TEXTO_LIMPAR;
    btn.addEventListener('click', () => alternarLimpar(id));
    input.insertAdjacentElement('afterend', btn);
  }
}

function alternarLimpar(id) {
  const input = document.getElementById(id);
  const btn = botaoLimpar(id);
  if (!input || !btn) return;

  if (idsParaLimpar.has(id)) {
    // desfazer
    idsParaLimpar.delete(id);
    input.disabled = false;
    input.placeholder = input.dataset.placeholderAtual ?? '';
    btn.textContent = TEXTO_LIMPAR;
  } else {
    idsParaLimpar.add(id);
    input.value = '';
    input.disabled = true;
    input.placeholder = PLACEHOLDER_REMOVER;
    btn.textContent = TEXTO_DESFAZER;
    document.getElementById(id)?.closest('.field-group')?.classList.remove('field-group--has-error');
    const erroEl = document.getElementById(`${id}-error`);
    if (erroEl) erroEl.textContent = '';
  }
}

// ---------------------------------------------------------------
// Preenchimento: dado antigo vira PLACEHOLDER, input fica vazio
// ---------------------------------------------------------------
function preencherModal() {
  const semPii = semAcessoAPii();
  idsParaLimpar.clear();

  for (const [id, nomeCampo] of Object.entries(CAMPOS_MODAL)) {
    const input = document.getElementById(id);
    if (!input) continue;

    // guarda o placeholder de exemplo original uma única vez
    if (input.dataset.placeholderOriginal === undefined) {
      input.dataset.placeholderOriginal = input.getAttribute('placeholder') ?? '';
    }

    const antigo = campo(pacienteAtual, nomeCampo);
    let placeholder;
    if (antigo != null) placeholder = String(antigo);
    else if (semPii) placeholder = PLACEHOLDER_SEM_PII;
    else placeholder = input.dataset.placeholderOriginal;

    input.value = '';
    input.disabled = (id === 'pac-edit-nome'); // nome é imutável na ficha
    input.placeholder = placeholder;
    input.dataset.placeholderAtual = placeholder;

    // "Limpar" só faz sentido se há (ou pode haver) valor para apagar.
    const btn = botaoLimpar(id);
    if (btn) {
      btn.textContent = TEXTO_LIMPAR;
      btn.hidden = !(antigo != null || semPii);
    }
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

  // 1) Campos digitados (vazio = manter; campos marcados p/ limpar ficam de fora)
  const payload = {};
  for (const [id, nomeCampo] of Object.entries(CAMPOS_MODAL)) {
    if (idsParaLimpar.has(id)) continue;
    const input = document.getElementById(id);
    if (input && input.value.trim() !== '') payload[nomeCampo] = input.value.trim();
  }

  const { dados, erros } = validarAtualizarPacientePessoal(payload);
  if (Object.keys(erros).length > 0) {
    aplicarErros(erros);
    exibirMensagem('Confira os campos destacados antes de continuar.', 'erro');
    return;
  }

  // 2) Campos marcados para limpar viram null explícito (o validador do
  //    front descarta nulos de propósito, por isso entram só aqui).
  const envio = { ...dados };
  for (const id of idsParaLimpar) envio[CAMPOS_MODAL[id]] = null;

  if (Object.keys(envio).length === 0) {
    exibirMensagem('Nenhuma alteração para salvar.', 'info'); // TODO: confirmar se feedback.js aceita 'info'
    fecharModal();
    return;
  }

  salvando = true;
  const botao = document.getElementById('pac-edit-salvar');
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Salvando…';

  try {
    const resposta = await atualizarPacientePessoal(uuidAtual, envio);
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