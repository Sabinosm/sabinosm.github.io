// ============================================
// B-íon — Profissionais
// Busca, filtros, paginação (10 por página) e modal de
// cadastro/edição/ativação de profissional, integrado com a API.
//
// As regras de validação (CPF, telefone, login, UF, etc.) vivem em
// adminProfissionaisValidações.js.
// As chamadas HTTP vivem em adminProfissionaisApi.js.
// Este arquivo só orquestra a tela.
//
// Modelo de dados que a API devolve (Usuario.to_dict()):
//   { uuid, nome_completo, email, telefone, user_login, tipo_usuario,
//     status: "ativo" | "inativo", ultimo_acesso, id_empresa }
// Campos sensíveis (cpf, atributos_profissionais/CRM-COREN) só vêm em
// incluir_sensiveis=True -- ou seja, na listagem geral eles NÃO vêm.
// Por isso, ao abrir o modal de edição, buscamos o detalhe via
// buscarProfissional(uuid) antes de preencher os placeholders, para
// ter CPF e CRM/COREN atualizados (a listagem sozinha não tem esses
// dados).
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

import { exibirMensagem } from "../../../shared/feedback.js";
import { validarFormularioProfissional } from "./adminProfissionaisValidacoes.js";
import {
  ApiError,
  listarProfissionais,
  buscarProfissional,
  criarProfissional,
  atualizarProfissional,
  ativarProfissional,
  desativarProfissional,
} from "./adminProfissionaisApi.js";

const POR_PAGINA = 10;

let profissionaisCache = [];  // última listagem carregada da API
let paginaAtual = 1;
let termoBusca = '';
let profissionalEditando = null; // objeto (do detalhe) sendo editado, ou null se for cadastro novo
let salvando = false; // trava contra duplo-clique / duplo submit

document.addEventListener('DOMContentLoaded', () => {
  configurarBusca();
  configurarFiltros();
  configurarModalProfissional();
  carregarERenderizar();
});

// ============================================
// Busca
// ============================================
function configurarBusca() {
  const input = document.getElementById('busca-profissional');
  if (!input) return;

  input.addEventListener('input', () => {
    termoBusca = input.value.trim().toLowerCase();
    paginaAtual = 1;
    renderizarLista();
  });
}

// ============================================
// Filtros (painel expansível)
// ============================================
function configurarFiltros() {
  const btn = document.getElementById('btn-toggle-filtros');
  const painel = document.getElementById('filter-panel');
  if (!btn || !painel) return;

  btn.addEventListener('click', () => {
    const abrir = !painel.classList.contains('filter-panel--visible');
    painel.classList.toggle('filter-panel--visible', abrir);
    btn.classList.toggle('btn-filter--active', abrir);
  });

  const btnLimpar = document.getElementById('btn-limpar-filtros');
  if (btnLimpar) {
    btnLimpar.addEventListener('click', () => {
      painel.querySelectorAll('select').forEach(s => { s.selectedIndex = 0; });
      // TODO: resetar campos de filtro reais quando definidos
      paginaAtual = 1;
      renderizarLista();
    });
  }
}

// ============================================
// Dados — carregamento via API
// ============================================
async function carregarERenderizar() {
  const container = document.getElementById('lista-profissionais');
  if (container) {
    container.innerHTML = '<p class="empty-state-text" style="padding: 24px 0;">Carregando profissionais…</p>';
  }

  try {
    const resposta = await listarProfissionais();
    profissionaisCache = resposta.data || [];
  } catch (erro) {
    profissionaisCache = [];
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível carregar os profissionais.';
    exibirMensagemNaLista(mensagem);
    return;
  }

  renderizarLista();
}

function filtrarProfissionais(lista) {
  if (!termoBusca) return lista;
  return lista.filter(p =>
    (p.nome_completo ?? '').toLowerCase().includes(termoBusca) ||
    (p.email ?? '').toLowerCase().includes(termoBusca) ||
    (p.user_login ?? '').toLowerCase().includes(termoBusca)
  );
}

// ============================================
// Renderização da lista + paginação
// ============================================
function renderizarLista() {
  const container = document.getElementById('lista-profissionais');
  if (!container) return;

  const todos = filtrarProfissionais(profissionaisCache);
  const totalPaginas = Math.max(1, Math.ceil(todos.length / POR_PAGINA));
  paginaAtual = Math.min(paginaAtual, totalPaginas);

  const inicio = (paginaAtual - 1) * POR_PAGINA;
  const pagina = todos.slice(inicio, inicio + POR_PAGINA);

  container.innerHTML = '';

  if (pagina.length === 0) {
    container.appendChild(criarEstadoVazio());
  } else {
    pagina.forEach(p => container.appendChild(criarCardProfissional(p)));
  }

  renderizarPaginacao(todos.length, totalPaginas);
}

function exibirMensagemNaLista(texto) {
  const container = document.getElementById('lista-profissionais');
  if (!container) return;
  container.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `
    <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="9" stroke-linecap="round"/>
      <path d="M12 8v5M12 16h.01" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <p class="empty-state-title">Não foi possível carregar</p>
    <p class="empty-state-text">${texto}</p>
  `;
  container.appendChild(div);
}

function criarEstadoVazio() {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `
    <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="11" cy="11" r="7" stroke-linecap="round"/>
      <path d="M21 21l-4.3-4.3" stroke-linecap="round"/>
    </svg>
    <p class="empty-state-title">Nenhum profissional encontrado</p>
    <p class="empty-state-text">Tente ajustar a busca ou os filtros, ou convide um novo profissional para a equipe.</p>
  `;
  return div;
}

function criarCardProfissional(p) {
  const card = document.createElement('article');
  card.className = 'consult-card';

  const status = document.createElement('div');
  if (p.status === 'ativo') {
    status.className = 'consult-status status--em-atendimento';
    status.innerHTML = `<span class="status-dot"></span> Ativo`;
  } else {
    status.className = 'consult-status status--inativo';
    status.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9" stroke-linecap="round"/>
        <path d="M8 8l8 8M16 8l-8 8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Inativo`;
  }

  const main = document.createElement('div');
  main.className = 'consult-main';
  const nome = document.createElement('h3');
  nome.className = 'consult-patient';
  nome.textContent = p.nome_completo;
  const meta = document.createElement('p');
  meta.className = 'consult-meta';
  const tipoLabel = p.tipo_usuario === 'medico' ? 'Médico' : p.tipo_usuario === 'enfermeiro' ? 'Enfermeiro' : (p.tipo_usuario || '—');
  meta.textContent = `${tipoLabel} · ${p.email}`;
  main.append(nome, meta);

  const btn = document.createElement('button');
  btn.className = 'btn-ghost';
  btn.textContent = 'Gerenciar';
  btn.addEventListener('click', () => abrirModalProfissional(p));

  card.append(status, main, btn);
  return card;
}

// ============================================
// Paginação (com setas para os lados)
// ============================================
function renderizarPaginacao(totalItens, totalPaginas) {
  const container = document.getElementById('paginacao');
  if (!container) return;

  container.innerHTML = '';

  if (totalItens === 0) return;

  const inicio = (paginaAtual - 1) * POR_PAGINA + 1;
  const fim = Math.min(paginaAtual * POR_PAGINA, totalItens);

  const info = document.createElement('span');
  info.className = 'pagination-info';
  info.textContent = `Mostrando ${inicio}–${fim} de ${totalItens}`;

  const controls = document.createElement('div');
  controls.className = 'pagination-controls';

  controls.appendChild(criarBotaoPagina({
    conteudoSvg: `<path d="M15 6l-6 6 6 6" stroke-linecap="round" stroke-linejoin="round"/>`,
    label: 'Página anterior',
    desabilitado: paginaAtual === 1,
    onClick: () => irParaPagina(paginaAtual - 1),
  }));

  for (let i = 1; i <= totalPaginas; i++) {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (i === paginaAtual ? ' page-btn--active' : '');
    btn.textContent = i;
    btn.addEventListener('click', () => irParaPagina(i));
    controls.appendChild(btn);
  }

  controls.appendChild(criarBotaoPagina({
    conteudoSvg: `<path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/>`,
    label: 'Próxima página',
    desabilitado: paginaAtual === totalPaginas,
    onClick: () => irParaPagina(paginaAtual + 1),
  }));

  container.append(info, controls);
}

function criarBotaoPagina({ conteudoSvg, label, desabilitado, onClick }) {
  const btn = document.createElement('button');
  btn.className = 'page-btn';
  btn.setAttribute('aria-label', label);
  btn.disabled = desabilitado;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${conteudoSvg}</svg>`;
  btn.addEventListener('click', onClick);
  return btn;
}

function irParaPagina(n) {
  paginaAtual = n;
  renderizarLista();
  document.getElementById('lista-profissionais')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

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
 * (sem cpf/CRM/COREN). Se for edição, buscamos o detalhe completo
 * na API antes de preencher os campos.
 */
async function abrirModalProfissional(profissionalResumo) {
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

  // Ativar/Desativar -- só existe em edição, no canto oposto ao Salvar
  if (btnToggleStatus) {
    if (editando) {
      const estaAtivo = profissional.status === 'ativo';
      btnToggleStatus.hidden = false;
      btnToggleStatus.textContent = estaAtivo ? 'Desativar profissional' : 'Ativar profissional';
      btnToggleStatus.classList.toggle('btn-danger--ativar', !estaAtivo);
      btnToggleStatus.dataset.acao = estaAtivo ? 'desativar' : 'ativar';
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

    await carregarERenderizar();
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

    await carregarERenderizar();
  } catch (erro) {
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível alterar o status. Tente novamente.';
    exibirMensagem(mensagem, 'erro');
    btnToggleStatus.textContent = textoOriginal;
  } finally {
    salvando = false;
    btnToggleStatus.disabled = false;
  }
}