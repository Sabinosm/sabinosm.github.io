// adminProfissionaisModal.js
//
// Modal único de "Convidar / Gerenciar profissional" -- usado tanto
// para criar um novo usuário quanto para editar um existente (o modo
// é decidido por abrirModalProfissional receber ou não um item).
//
// ALTERADO (múltiplos admins por empresa):
// - Novo modo de abertura: abrirModalConvite() (chamada pelo botão
//   "Convidar profissional" em adminProfissionaisLista.js). Antes o
//   botão abria direto o formulário de médico/enfermeiro; agora, se
//   quem está logado é o super admin, abrirModalConvite() pergunta
//   primeiro que tipo de conta convidar (profissional ou admin),
//   porque o formulário de admin é mais simples (sem CRM/COREN, sem
//   senha) e porque um admin comum NUNCA deve ver a opção "Administrador"
//   -- ele não tem permissão para criar admin (o backend bloqueia,
//   mas nem faz sentido oferecer a opção na UI).
// - abrirModalProfissional(item) (chamada ao clicar "Gerenciar" num
//   card da lista) agora recebe itens que podem ser admin
//   (item.is_admin). Quando o alvo é admin e quem está logado NÃO é
//   super admin, o modal abre em modo somente-leitura: sem campos
//   editáveis, sem botão salvar, sem botão ativar/desativar -- só os
//   dados visíveis. Isso evita depender só do backend rejeitar (que
//   ele faz) e dá uma UI coerente com a regra de negócio.
// - O formulário de admin não usa os campos de CRM/COREN/especialidade
//   -- monta um payload próprio (ver montarPayloadAdmin) e reaproveita
//   os campos comuns (nome, cpf, login, telefone, email) do mesmo
//   formulário, escondendo os blocos condicionais de médico/enfermeiro
//   e o próprio select de tipo (fixo em "admin" quando vem desse fluxo).

import {
  criarProfissional,
  atualizarProfissional,
  ativarProfissional,
  desativarProfissional,
  buscarProfissional,
  ApiError,
} from "./adminProfissionaisApi.js";
import { validarFormularioProfissional } from "./adminProfissionaisValidacoes.js";
import { recarregarLista } from "./adminProfissionaisLista.js";
import { souSuperAdmin, souAdmin, meuUuid } from "./adminProfissionaisSessao.js";

const overlay = document.getElementById('prof-modal-overlay');
const form = document.getElementById('form-profissional');
const titulo = document.getElementById('prof-modal-title');
const hintEdicao = document.getElementById('prof-modal-edit-hint');
const feedback = document.getElementById('mensagemFeedback');
const btnToggleStatus = document.getElementById('prof-modal-toggle-status');
const btnSalvar = document.getElementById('prof-modal-save');
const btnCancelar = document.getElementById('prof-modal-cancel');
const btnFechar = document.getElementById('prof-modal-close');

const campoTipo = document.getElementById('pf-tipo');
const blocoMedico = document.getElementById('bloco-medico');
const blocoEnfermeiro = document.getElementById('bloco-enfermeiro');

// uuid do item em edição, ou null em modo de criação
let uuidEmEdicao = null;
// true quando o formulário está travado (visualização de admin por
// quem não é super admin) -- nenhum campo editável, nenhuma ação.
let somenteLeitura = false;

document.addEventListener('DOMContentLoaded', () => {
  campoTipo?.addEventListener('change', atualizarBlocosCondicionais);
  btnCancelar?.addEventListener('click', fecharModal);
  btnFechar?.addEventListener('click', fecharModal);
  overlay?.addEventListener('click', (e) => { if (e.target === overlay) fecharModal(); });
  form?.addEventListener('submit', aoSubmeter);
});

// ============================================
// Abertura -- convite (botão "Convidar profissional")
// ============================================

/**
 * Abre o modal para criar um novo usuário. Se quem está logado é o
 * super admin, pergunta antes que tipo de conta (profissional ou
 * administrador) -- um admin comum vai direto para o formulário de
 * profissional, sem nunca ver a opção de criar admin.
 */
export function abrirModalConvite() {
  if (!souSuperAdmin()) {
    abrirFormularioConvite('profissional');
    return;
  }
  perguntarTipoConvite();
}

/**
 * Pequeno seletor entre "Profissional" e "Administrador", mostrado só
 * para o super admin. Reaproveita o próprio overlay do modal para não
 * introduzir um segundo componente -- um passo simples antes do
 * formulário de fato.
 */
function perguntarTipoConvite() {
  limparFormulario();
  uuidEmEdicao = null;
  somenteLeitura = false;
  titulo.textContent = 'Convidar';
  hintEdicao.hidden = true;
  esconderFeedback();
  btnToggleStatus.hidden = true;

  // ADICIONADO: enquanto o tipo de convite (profissional/admin) ainda
  // não foi escolhido, não existe formulário válido para submeter --
  // o botão de salvar fica indisponível até abrirFormularioConvite()
  // rodar (chamada só depois do clique numa das duas opções abaixo).
  btnSalvar.hidden = true;

  form.hidden = true;

  let seletor = document.getElementById('prof-modal-seletor-tipo');
  if (!seletor) {
    seletor = document.createElement('div');
    seletor.id = 'prof-modal-seletor-tipo';
    seletor.className = 'prof-modal-body';
    form.parentElement.insertBefore(seletor, form.nextSibling);
  }
  seletor.innerHTML = `
    <p class="field-hint" style="padding: 0 0 16px;">Que tipo de conta você quer convidar?</p>
    <div style="display:flex; flex-direction:column; gap:10px;">
      <button type="button" class="btn-ghost" id="prof-escolha-profissional" style="justify-content:flex-start;">
        Profissional (médico ou enfermeiro)
      </button>
      <button type="button" class="btn-ghost" id="prof-escolha-admin" style="justify-content:flex-start;">
        Administrador
      </button>
    </div>
  `;
  seletor.hidden = false;

  document.getElementById('prof-escolha-profissional').addEventListener('click', () => {
    seletor.hidden = true;
    abrirFormularioConvite('profissional');
  });
  document.getElementById('prof-escolha-admin').addEventListener('click', () => {
    seletor.hidden = true;
    abrirFormularioConvite('admin');
  });

  overlay.classList.add('settings-overlay--visible');
}

/**
 * Abre de fato o formulário de convite, já no modo certo:
 *  - 'profissional': select de tipo (médico/enfermeiro) visível e livre.
 *  - 'admin': select de tipo escondido, fixo em "admin"; blocos de
 *    CRM/COREN nunca aparecem; nenhum campo de senha (o schema do
 *    backend proíbe senha no cadastro de admin -- acesso é definido
 *    depois, via onboarding, igual profissional).
 */
function abrirFormularioConvite(modo) {
  limparFormulario();
  uuidEmEdicao = null;
  somenteLeitura = false;
  form.dataset.modoConvite = modo; // lido em aoSubmeter/montarPayload

  titulo.textContent = modo === 'admin' ? 'Convidar administrador' : 'Convidar profissional';
  hintEdicao.hidden = true;
  esconderFeedback();
  btnToggleStatus.hidden = true;
  btnSalvar.textContent = 'Enviar convite';
  definirModoFormulario(false);

  const campoTipoGroup = campoTipo?.closest('.field-group');
  if (modo === 'admin') {
    if (campoTipoGroup) campoTipoGroup.hidden = true;
    blocoMedico.hidden = true;
    blocoEnfermeiro.hidden = true;
  } else {
    if (campoTipoGroup) campoTipoGroup.hidden = false;
    atualizarBlocosCondicionais();
  }

  form.hidden = false;
  overlay.classList.add('settings-overlay--visible');
}

// ============================================
// Abertura -- gerenciar item existente (botão "Gerenciar" no card)
// ============================================

/**
 * Abre o modal para editar/gerenciar um usuário já existente.
 *
 * ALTERADO (múltiplos admins por empresa): quando o item é admin
 * (item.is_admin) e quem está logado não é o super admin, o modal
 * abre travado (somenteLeitura) -- mostra os dados mas nenhuma ação
 * fica disponível. Isso é reforço de UI: o backend já rejeitaria a
 * tentativa, mas não faz sentido oferecer botões que sempre falham.
 *
 * @param {object} item - item vindo da listagem (Usuario.to_dict_few:
 *   uuid, nome_completo, email, tipo_usuario, status, is_admin)
 */
export async function abrirModalProfissional(item) {
  limparFormulario();
  uuidEmEdicao = item.uuid;
  esconderFeedback();

  const alvoEhAdmin = Boolean(item.is_admin);
  somenteLeitura = alvoEhAdmin && !souSuperAdmin();

  const seletor = document.getElementById('prof-modal-seletor-tipo');
  if (seletor) seletor.hidden = true;
  form.hidden = false;
  form.dataset.modoConvite = ''; // não é fluxo de convite

  titulo.textContent = item.nome_completo || 'Gerenciar profissional';
  hintEdicao.hidden = somenteLeitura; // sem sentido mostrar "deixe em branco" se nada é editável
  overlay.classList.add('settings-overlay--visible');

  definirModoFormulario(true);

  // Campos de admin (tipo, CRM/COREN) não fazem sentido de mostrar
  // como editáveis para um admin -- esconde o bloco de tipo e os
  // condicionais nesse caso; para médico/enfermeiro, mantém como já
  // era.
  const campoTipoGroup = campoTipo?.closest('.field-group');
  if (alvoEhAdmin) {
    if (campoTipoGroup) campoTipoGroup.hidden = true;
    blocoMedico.hidden = true;
    blocoEnfermeiro.hidden = true;
  } else {
    if (campoTipoGroup) campoTipoGroup.hidden = false;
  }

  aplicarTravaSomenteLeitura();

  // Busca o detalhe completo (CPF, login, CRM/COREN/especialidade) --
  // a listagem só traz to_dict_few. Ver adminProfissionaisApi.buscarProfissional.
  try {
    const resposta = await buscarProfissional(item.uuid);
    preencherFormularioComDetalhe(resposta.data);
  } catch (erro) {
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível carregar os dados do profissional.';
    exibirMensagem(mensagem, 'erro');
  }

  configurarBotaoStatus(item);
}

function preencherFormularioComDetalhe(dados) {
  document.getElementById('pf-nome').value = dados.nome_completo ?? '';
  document.getElementById('pf-email').value = dados.email ?? '';
  document.getElementById('pf-email-confirma').value = dados.email ?? '';
  document.getElementById('pf-telefone').value = dados.telefone ?? '';
  document.getElementById('pf-login').value = dados.user_login ?? '';
  // CPF não vem em claro no detalhe salvo se incluir_sensiveis=True
  // no backend -- o controller atual chama u.to_dict() sem esse flag,
  // então dados.cpf não deve vir preenchido; deixa em branco (o campo
  // já é opcional em modo edição).

  if (dados.tipo_usuario === 'medico' || dados.tipo_usuario === 'enfermeiro') {
    campoTipo.value = dados.tipo_usuario;
    atualizarBlocosCondicionais();
    const atributos = dados.atributos_profissionais || {};
    if (dados.tipo_usuario === 'medico') {
      document.getElementById('pf-crm').value = atributos['numero-crm'] ?? '';
      document.getElementById('pf-uf-crm').value = atributos['uf-crm'] ?? '';
      document.getElementById('pf-rqe').value = atributos['rqe'] ?? '';
    } else {
      document.getElementById('pf-coren').value = atributos['numero-coren'] ?? '';
      document.getElementById('pf-uf-coren').value = atributos['uf-coren'] ?? '';
      document.getElementById('pf-especialidade').value = atributos['especialidade'] ?? '';
    }
  }
}

// ============================================
// Botão de ativar/desativar (rodapé do modal)
// ============================================

function configurarBotaoStatus(item) {
  btnToggleStatus.onclick = null;

  // ALTERADO (múltiplos admins por empresa): some por completo se o
  // alvo é admin e quem está logado não é super admin -- mesma regra
  // que trava o resto do formulário. O backend também bloqueia isso,
  // este é só reforço de UI.
  if (somenteLeitura) {
    btnToggleStatus.hidden = true;
    return;
  }

  // Igual antes: usuário pendente não tem ação de ativar/desativar
  // manual (segue o próprio onboarding).
  if (item.status === 'pendente') {
    btnToggleStatus.hidden = true;
    return;
  }

  const vaiDesativar = item.status === 'ativo';
  btnToggleStatus.hidden = false;
  btnToggleStatus.textContent = vaiDesativar ? 'Desativar' : 'Ativar';
  btnToggleStatus.className = vaiDesativar ? 'btn-danger' : 'btn-danger btn-danger--ativar';

  btnToggleStatus.onclick = async () => {
    btnToggleStatus.disabled = true;
    try {
      if (vaiDesativar) {
        await desativarProfissional(item.uuid);
        exibirMensagem('Usuário desativado.', 'sucesso');
      } else {
        await ativarProfissional(item.uuid);
        exibirMensagem('Usuário ativado.', 'sucesso');
      }
      await recarregarLista();
      setTimeout(fecharModal, 900);
    } catch (erro) {
      const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível concluir a ação.';
      exibirMensagem(mensagem, 'erro');
    } finally {
      btnToggleStatus.disabled = false;
    }
  };
}

// ============================================
// Submissão (criar ou atualizar)
// ============================================

async function aoSubmeter(e) {
  e.preventDefault();
  if (somenteLeitura) return; // trava defensiva -- não deveria nem estar visível

  const editando = Boolean(uuidEmEdicao);
  const modoConvite = form.dataset.modoConvite; // 'admin' | 'profissional' | ''

  let payload;
  let erros;

  if (!editando && modoConvite === 'admin') {
    ({ payload, erros } = montarPayloadAdmin());
  } else {
    const campos = lerCamposFormulario();
    ({ payload, erros } = validarFormularioProfissional(campos, editando));
  }

  limparErrosExibidos();
  if (Object.keys(erros).length > 0) {
    exibirErros(erros);
    return;
  }

  btnSalvar.disabled = true;
  esconderFeedback();

  try {
    if (editando) {
      await atualizarProfissional(uuidEmEdicao, payload);
      exibirMensagem('Profissional atualizado.', 'sucesso');
    } else {
      await criarProfissional(payload);
      exibirMensagem('Convite enviado com sucesso.', 'sucesso');
    }
    await recarregarLista();
    setTimeout(fecharModal, 900);
  } catch (erro) {
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível concluir a operação.';
    exibirMensagem(mensagem, 'erro');
  } finally {
    btnSalvar.disabled = false;
  }
}

/**
 * Monta o payload de criação de admin -- reaproveita os campos comuns
 * do formulário (nome, cpf, login, telefone, email) e fixa
 * tipo_usuario: "admin", sem CRM/COREN/especialidade e sem senha (o
 * schema do backend proíbe senha no cadastro de admin -- ver
 * schema_usuario.py, valida_campos_por_profissao).
 *
 * Reaproveita as mesmas funções de validação de campo individuais de
 * adminProfissionaisValidacoes.js (nome, cpf, login, telefone, email)
 * para não duplicar regra -- só monta o payload de um jeito diferente
 * de validarFormularioProfissional, que é focada em médico/enfermeiro.
 */
function montarPayloadAdmin() {
  const campos = lerCamposFormulario();
  // validarFormularioProfissional já cobre nome/cpf/login/telefone/email
  // com as mesmas regras -- passamos tipo vazio pra ela não exigir
  // CRM/COREN, e sobrescrevemos tipo_usuario depois.
  const { payload, erros } = validarFormularioProfissional(
    { ...campos, tipo: '' },
    false, // editando=false: campos obrigatórios de cadastro completo
  );
  delete erros['pf-tipo']; // não se aplica -- tipo é fixo, campo está escondido
  payload.tipo_usuario = 'admin';
  return { payload, erros };
}

function lerCamposFormulario() {
  return {
    nome: document.getElementById('pf-nome').value,
    cpf: document.getElementById('pf-cpf').value,
    login: document.getElementById('pf-login').value,
    telefone: document.getElementById('pf-telefone').value,
    email: document.getElementById('pf-email').value,
    emailConfirma: document.getElementById('pf-email-confirma').value,
    tipo: campoTipo?.value || '',
    crm: document.getElementById('pf-crm').value,
    ufCrm: document.getElementById('pf-uf-crm').value,
    rqe: document.getElementById('pf-rqe').value,
    coren: document.getElementById('pf-coren').value,
    ufCoren: document.getElementById('pf-uf-coren').value,
    especialidade: document.getElementById('pf-especialidade').value,
  };
}

// ============================================
// Utilidades de formulário / modal
// ============================================

function atualizarBlocosCondicionais() {
  const tipo = campoTipo?.value;
  blocoMedico.hidden = tipo !== 'medico';
  blocoEnfermeiro.hidden = tipo !== 'enfermeiro';
}

/**
 * Habilita/desabilita todos os inputs do formulário conforme
 * `somenteLeitura`. Chamada depois de decidir o modo em
 * abrirModalProfissional -- mantém a trava simples e num só lugar,
 * em vez de espalhar `disabled = somenteLeitura` pelo resto do
 * arquivo.
 */
function aplicarTravaSomenteLeitura() {
  form.querySelectorAll('input, select').forEach((el) => {
    el.disabled = somenteLeitura;
  });
  btnSalvar.hidden = somenteLeitura;
  if (somenteLeitura) {
    exibirMensagem(
      'Apenas o administrador principal pode gerenciar outro administrador.',
      'info',
    );
  }
}

/** Mostra/esconde os botões conforme é criação ou edição (independente da trava de somenteLeitura). */
function definirModoFormulario(editando) {
  hintEdicao.hidden = !editando || somenteLeitura;
  btnSalvar.hidden = somenteLeitura ? true : false;
  btnSalvar.textContent = editando ? 'Salvar alterações' : 'Enviar convite';
}

function limparFormulario() {
  form.reset();
  limparErrosExibidos();
  esconderFeedback();
  blocoMedico.hidden = true;
  blocoEnfermeiro.hidden = true;
  form.querySelectorAll('input, select').forEach((el) => { el.disabled = false; });
  const campoTipoGroup = campoTipo?.closest('.field-group');
  if (campoTipoGroup) campoTipoGroup.hidden = false;
  btnSalvar.hidden = false;
}

function limparErrosExibidos() {
  form.querySelectorAll('.field-group--has-error').forEach((el) => el.classList.remove('field-group--has-error'));
  form.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
  form.querySelectorAll('.field-input--invalid').forEach((el) => el.classList.remove('field-input--invalid'));
}

function exibirErros(erros) {
  Object.entries(erros).forEach(([idCampo, mensagem]) => {
    const input = document.getElementById(idCampo);
    const erroEl = document.getElementById(`${idCampo}-error`);
    const group = input?.closest('.field-group');
    if (group) group.classList.add('field-group--has-error');
    if (input) input.classList.add('field-input--invalid');
    if (erroEl) erroEl.textContent = mensagem;
  });
}

function exibirMensagem(texto, tipo) {
  feedback.textContent = texto;
  feedback.className = `prof-form-feedback ${tipo}`;
}

function esconderFeedback() {
  feedback.textContent = '';
  feedback.className = 'prof-form-feedback';
}

function fecharModal() {
  overlay.classList.remove('settings-overlay--visible');
  const seletor = document.getElementById('prof-modal-seletor-tipo');
  if (seletor) seletor.hidden = true;
  form.hidden = false;
  limparFormulario();
  uuidEmEdicao = null;
  somenteLeitura = false;
}