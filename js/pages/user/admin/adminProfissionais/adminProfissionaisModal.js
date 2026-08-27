// adminProfissionaisModal.js
//
// Modal de cadastro/edição/ativação de profissional. A lista (em
// adminProfissionaisLista.js) chama abrirModalProfissional (exportada
// daqui) ao clicar num card ou no botão "Convidar profissional"; este
// arquivo chama de volta recarregarLista (importada de lá) depois de
// salvar, criar ou ativar/desativar, para a lista refletir a mudança.
//
// As regras de validação (CPF, telefone, login, UF, etc.) vivem em
// adminProfissionaisValidacoes.js.
// As chamadas HTTP vivem em adminProfissionaisApi.js.
//
// Campos sensíveis (cpf, atributos_profissionais/CRM-COREN) só vêm da
// API em incluir_sensiveis=True -- ou seja, não vêm na listagem geral.
// Por isso, ao abrir o modal de edição, buscamos o detalhe via
// buscarProfissional(uuid) antes de preencher os placeholders, para
// ter CPF e CRM/COREN atualizados.
//
// Modo edição: os campos começam VAZIOS, mostrando o valor atual
// como placeholder. Só o que for efetivamente digitado entra no
// payload de PUT -- update parcial, igual ao schema do backend.
// Modo cadastro: todos os campos obrigatórios do schema completo
// precisam ser preenchidos (ver validarFormularioProfissional).
//
// Cadastro de profissional NÃO tem campo de senha: o acesso é feito
// por login com Conta Google usando o e-mail cadastrado aqui. Por
// isso o e-mail é pedido duas vezes (confirmação) -- é o admin quem
// responde por um e-mail incorreto, já que o convite de acesso vai
// para ele.
// ============================================

import { exibirMensagem } from "../../../../shared/feedback.js";
import { validarFormularioProfissional } from "./adminProfissionaisValidacoes.js";
import {
  ApiError,
  buscarProfissional,
  criarProfissional,
  atualizarProfissional,
  ativarProfissional,
  desativarProfissional,
} from "./adminProfissionaisApi.js";
import { recarregarLista } from "./adminProfissionaisLista.js";

let profissionalEditando = null; // objeto (do detalhe) sendo editado, ou null se for cadastro novo
let salvando = false; // trava contra duplo-clique / duplo submit

document.addEventListener('DOMContentLoaded', () => {
  configurarModalProfissional();
});

// ============================================
// Modal de Cadastrar / Editar / Ativar-Desativar profissional
// ============================================

function configurarModalProfissional() {
  const overlay = document.getElementById('prof-modal-overlay');
  const btnNovo = document.getElementById('btn-convidar-profissional');
  const btnFechar = document.getElementById('prof-modal-close');
  const btnCancelar = document.getElementById('prof-modal-cancel');
  const btnToggleStatus = document.getElementById('prof-modal-toggle-status');
  const form = document.getElementById('form-profissional');
  const selectTipo = document.getElementById('pf-tipo');

  if (!overlay) return;

  btnNovo?.addEventListener('click', () => abrirModalProfissional(null));
  btnFechar?.addEventListener('click', fecharModalProfissional);
  btnCancelar?.addEventListener('click', fecharModalProfissional);
  btnToggleStatus?.addEventListener('click', alternarStatusProfissional);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) fecharModalProfissional();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('settings-overlay--visible')) {
      fecharModalProfissional();
    }
  });

  selectTipo?.addEventListener('change', () => {
    atualizarBlocoPorTipo(selectTipo.value);
    limparErroCampo('pf-tipo');
  });

  // Limpa o erro do campo assim que o usuário mexe nele de novo
  form?.querySelectorAll('.field-input').forEach(el => {
    el.addEventListener('input', () => limparErroCampo(el.id));
  });

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    salvarProfissional();
  });
}

function atualizarBlocoPorTipo(tipo) {
  const blocoMedico = document.getElementById('bloco-medico');
  const blocoEnfermeiro = document.getElementById('bloco-enfermeiro');
  blocoMedico.hidden = tipo !== 'medico';
  blocoEnfermeiro.hidden = tipo !== 'enfermeiro';
}

/**
 * Abre o modal. `profissionalResumo` é o objeto vindo da listagem
 * (sem cpf/CRM/COREN), ou null para abrir em modo cadastro. Se for
 * edição, busca o detalhe completo na API antes de preencher os
 * campos. Exportada -- é o ponto de entrada usado por
 * adminProfissionaisLista.js (clique em "Gerenciar" ou "Convidar
 * profissional").
 */
export async function abrirModalProfissional(profissionalResumo) {
  const overlay = document.getElementById('prof-modal-overlay');
  const editando = profissionalResumo !== null;

  overlay.classList.add('settings-overlay--visible');
  document.body.classList.add('no-scroll');

  prepararModalCarregando(editando);

  if (!editando) {
    profissionalEditando = null;
    preencherModal(null);
    return;
  }

  try {
    const resposta = await buscarProfissional(profissionalResumo.uuid);
    profissionalEditando = resposta.data;
  } catch (erro) {
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível carregar os dados do profissional.';
    exibirMensagem(mensagem, 'erro');
    // Sem o detalhe (cpf/CRM/COREN) não dá pra editar com segurança;
    // ainda assim deixamos o modal aberto com o resumo que já tínhamos,
    // caso o admin só queira ativar/desativar.
    profissionalEditando = profissionalResumo;
  }

  preencherModal(profissionalEditando);
}

function prepararModalCarregando(editando) {
  const titulo = document.getElementById('prof-modal-title');
  const btnSalvar = document.getElementById('prof-modal-save');
  const form = document.getElementById('form-profissional');

  form.reset();
  limparTodosOsErros();
  limparFeedback();

  if (titulo) titulo.textContent = editando ? 'Editar profissional' : 'Convidar profissional';
  if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.textContent = editando ? 'Carregando…' : 'Enviar convite'; }

  const btnToggleStatus = document.getElementById('prof-modal-toggle-status');
  if (btnToggleStatus) btnToggleStatus.hidden = true;
}

function preencherModal(profissional) {
  const titulo = document.getElementById('prof-modal-title');
  const btnSalvar = document.getElementById('prof-modal-save');
  const editHint = document.getElementById('prof-modal-edit-hint');
  const btnToggleStatus = document.getElementById('prof-modal-toggle-status');
  const editando = profissional !== null;

  if (titulo) titulo.textContent = editando ? 'Editar profissional' : 'Convidar profissional';
  if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.textContent = editando ? 'Salvar alterações' : 'Enviar convite'; }
  if (editHint) editHint.hidden = !editando;

  // Em edição: campo vazio, valor atual vira placeholder (dica visual).
  // Em cadastro: campo realmente vazio, sem dado antigo pra mostrar.
  definirCampoComPlaceholder('pf-nome', editando ? profissional.nome_completo : '');
  definirCampoComPlaceholder('pf-cpf', editando ? formatarCpfExibicao(profissional.cpf) : '', '000.000.000-00');
  definirCampoComPlaceholder('pf-login', editando ? profissional.user_login : '');
  definirCampoComPlaceholder('pf-telefone', editando ? formatarTelefoneExibicao(profissional.telefone) : '', '(11) 91234-5678');

  // E-mail nunca herda placeholder do valor antigo -- a dupla
  // digitação de confirmação perderia o sentido se o admin só
  // revisse o e-mail atual sem precisar redigitar.
  definirCampoComPlaceholder('pf-email', '');
  definirCampoComPlaceholder('pf-email-confirma', '');

  const atributos = profissional?.atributos_profissionais || {};
  const selectTipo = document.getElementById('pf-tipo');
  selectTipo.value = editando ? (profissional.tipo_usuario || '') : '';
  atualizarBlocoPorTipo(selectTipo.value);

  definirCampoComPlaceholder('pf-crm', editando ? atributos['numero-crm'] : '');
  definirCampoComPlaceholder('pf-uf-crm', editando ? atributos['uf-crm'] : '');
  definirCampoComPlaceholder('pf-rqe', editando ? atributos['rqe'] : '');
  definirCampoComPlaceholder('pf-coren', editando ? atributos['numero-coren'] : '');
  definirCampoComPlaceholder('pf-uf-coren', editando ? atributos['uf-coren'] : '');
  definirCampoComPlaceholder('pf-especialidade', editando ? atributos['especialidade'] : '');

  // Ativar/Desativar -- só existe em edição, no canto oposto ao Salvar.
  // status !== 'ativo' cobre tanto 'pendente' (onboarding ainda não
  // concluído) quanto 'inativo' (desativado) -- em ambos os casos o
  // botão oferece "Ativar", que é a ação certa nos dois: tirar do
  // onboarding pendente ou reativar quem foi desativado, os dois
  // terminam com status 'ativo'.
  if (btnToggleStatus) {
    if (editando) {
      const ePendente = profissional.status === "pendente";

      if (ePendente===true){
          btnToggleStatus.hidden = false;
          btnToggleStatus.textContent = 'Desativar profissional';
          btnToggleStatus.classList.toggle('btn-danger--ativar', false);
          btnToggleStatus.dataset.acao = 'desativar';
      }
      else{
          const estaAtivo = profissional.status === 'ativo';
          btnToggleStatus.hidden = false;
          btnToggleStatus.textContent = estaAtivo ? 'Desativar profissional' : 'Ativar profissional';
          btnToggleStatus.classList.toggle('btn-danger--ativar', !estaAtivo);
          btnToggleStatus.dataset.acao = estaAtivo ? 'desativar' : 'ativar';
      }
      
    } else {
      btnToggleStatus.hidden = true;
    }
  }

  if (editando) document.getElementById('pf-nome')?.focus();
}

function definirCampoComPlaceholder(id, valorAtual, placeholderFixo) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = '';
  el.placeholder = valorAtual ? String(valorAtual) : (placeholderFixo ?? '');
}

function formatarCpfExibicao(cpf) {
  if (!cpf) return '';
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatarTelefoneExibicao(telefone) {
  if (!telefone) return '';
  const digits = telefone.replace(/\D/g, '');
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return telefone;
}

function fecharModalProfissional() {
  const overlay = document.getElementById('prof-modal-overlay');
  overlay?.classList.remove('settings-overlay--visible');
  document.body.classList.remove('no-scroll');
  profissionalEditando = null;
  limparTodosOsErros();
  limparFeedback();
}

// ============================================
// Erros de campo / feedback geral
// ============================================
function limparErroCampo(id) {
  const grupo = document.getElementById(id)?.closest('.field-group');
  const erroEl = document.getElementById(id + '-error');
  if (erroEl) erroEl.textContent = '';
  grupo?.classList.remove('field-group--has-error');
  document.getElementById(id)?.classList.remove('field-input--invalid');
}

function limparTodosOsErros() {
  document.querySelectorAll('#form-profissional .field-error').forEach(el => { el.textContent = ''; });
  document.querySelectorAll('#form-profissional .field-group--has-error').forEach(el => el.classList.remove('field-group--has-error'));
  document.querySelectorAll('#form-profissional .field-input--invalid').forEach(el => el.classList.remove('field-input--invalid'));
}

function exibirErrosCampos(erros) {
  limparTodosOsErros();
  let primeiroCampo = null;

  Object.entries(erros).forEach(([id, mensagem]) => {
    const input = document.getElementById(id);
    const grupo = input?.closest('.field-group');
    const erroEl = document.getElementById(id + '-error');
    if (erroEl) erroEl.textContent = mensagem;
    grupo?.classList.add('field-group--has-error');
    input?.classList.add('field-input--invalid');
    if (!primeiroCampo) primeiroCampo = input;
  });

  primeiroCampo?.focus();
}

function limparFeedback() {
  const el = document.getElementById('mensagemFeedback');
  if (!el) return;
  el.textContent = '';
  el.className = '';
}

// ============================================
// Ler campos do form
// ============================================
function lerCamposFormulario() {
  const valor = (id) => {
    const el = document.getElementById(id);
    if (!el) {
      // Se isto disparar, o HTML carregado no navegador não tem esse
      // campo -- geralmente sinal de que adminProfissionais.html está
      // desatualizado/cacheado em relação a este JS. Conferir se o
      // arquivo servido é o mesmo que define <input id="${id}">.
      console.error(`lerCamposFormulario: campo #${id} não encontrado no DOM.`);
      return '';
    }
    return el.value;
  };
  return {
    nome: valor('pf-nome').trim(),
    cpf: valor('pf-cpf').trim(),
    login: valor('pf-login').trim(),
    telefone: valor('pf-telefone').trim(),
    email: valor('pf-email').trim(),
    emailConfirma: valor('pf-email-confirma').trim(),
    tipo: valor('pf-tipo').trim(),
    crm: valor('pf-crm').trim(),
    ufCrm: valor('pf-uf-crm').trim(),
    rqe: valor('pf-rqe').trim(),
    coren: valor('pf-coren').trim(),
    ufCoren: valor('pf-uf-coren').trim(),
    especialidade: valor('pf-especialidade').trim(),
  };
}

// ============================================
// Salvar (criar ou atualizar) via API
// ============================================
async function salvarProfissional() {
  if (salvando) return;

  const editando = profissionalEditando !== null;
  const campos = lerCamposFormulario();
  const { payload, erros } = validarFormularioProfissional(campos, editando);

  if (Object.keys(erros).length > 0) {
    exibirErrosCampos(erros);
    exibirMensagem('Corrija os campos destacados antes de continuar.', 'erro');
    return;
  }

  if (editando && Object.keys(payload).length === 0) {
    exibirMensagem('Nenhuma alteração para salvar.', 'info');
    return;
  }

  const btnSalvar = document.getElementById('prof-modal-save');
  salvando = true;
  if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.textContent = 'Salvando…'; }

  try {
    if (editando) {
      await atualizarProfissional(profissionalEditando.uuid, payload);
    } else {
      await criarProfissional(payload);
    }

    exibirMensagem(
      editando ? 'Profissional atualizado com sucesso!' : 'Convite enviado com sucesso!',
      'sucesso'
    );

    await recarregarLista();
    setTimeout(fecharModalProfissional, 900);
  } catch (erro) {
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível salvar. Tente novamente.';
    exibirMensagem(mensagem, 'erro');
  } finally {
    salvando = false;
    if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.textContent = editando ? 'Salvar alterações' : 'Enviar convite'; }
  }
}

// ============================================
// Ativar / Desativar via API
// ============================================
async function alternarStatusProfissional() {
  if (salvando || !profissionalEditando) return;

  const btnToggleStatus = document.getElementById('prof-modal-toggle-status');
  const acao = btnToggleStatus?.dataset.acao; // 'ativar' | 'desativar'
  if (!acao) return;

  salvando = true;
  const textoOriginal = btnToggleStatus.textContent;
  btnToggleStatus.disabled = true;
  btnToggleStatus.textContent = acao === 'ativar' ? 'Ativando…' : 'Desativando…';

  try {
    const resposta = acao === 'ativar'
      ? await ativarProfissional(profissionalEditando.uuid)
      : await desativarProfissional(profissionalEditando.uuid);

    profissionalEditando = { ...profissionalEditando, ...resposta.data };

    exibirMensagem(
      acao === 'ativar' ? 'Profissional ativado com sucesso!' : 'Profissional desativado com sucesso!',
      'sucesso'
    );

    // Atualiza o botão para refletir o novo estado, sem fechar o modal
    const estaAtivo = profissionalEditando.status === 'ativo';
    btnToggleStatus.textContent = estaAtivo ? 'Desativar profissional' : 'Ativar profissional';
    btnToggleStatus.classList.toggle('btn-danger--ativar', !estaAtivo);
    btnToggleStatus.dataset.acao = estaAtivo ? 'desativar' : 'ativar';

    await recarregarLista();
  } catch (erro) {
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível alterar o status. Tente novamente.';
    exibirMensagem(mensagem, 'erro');
    btnToggleStatus.textContent = textoOriginal;
  } finally {
    salvando = false;
    btnToggleStatus.disabled = false;
  }
}