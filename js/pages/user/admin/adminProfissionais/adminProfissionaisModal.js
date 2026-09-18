// adminProfissionaisModal.js
//
// Modal único de "Convidar / Gerenciar profissional" -- usado tanto
// para criar um novo usuário quanto para editar um existente (o modo
// é decidido por abrirModalProfissional receber ou não um item).
//
// ALTERADO (múltiplos admins por empresa):
// - abrirModalProfissional(item) (chamada ao clicar "Gerenciar" num
//   card da lista) agora recebe itens que podem ser admin
//   (item.is_admin). Quando o alvo é admin e quem está logado NÃO é
//   super admin, o modal abre em modo somente-leitura: sem campos
//   editáveis, sem botão salvar, sem botão ativar/desativar -- só os
//   dados visíveis. Isso evita depender só do backend rejeitar (que
//   ele faz) e dá uma UI coerente com a regra de negócio.
//
// ALTERADO (checkbox "É administrador", substitui o seletor em duas
// etapas): abrirModalConvite() agora abre direto o formulário único
// de convite. Quem pode convidar admin (super admin) vê um checkbox
// "É administrador" ao lado do select de tipo de profissional; quem
// não pode, nunca vê o checkbox. Os dois campos são independentes --
// dá pra marcar o checkbox E escolher médico/enfermeiro (admin com
// função clínica, seguindo as mesmas regras de CRM/COREN) ou marcar
// só o checkbox e deixar o tipo em branco (admin "puro", sem função
// clínica). O payload de is_admin só é incluído quando o checkbox
// está marcado; tipo_papel só é incluído quando um tipo foi escolhido
// -- os dois são ortogonais no backend (ver Usuario.to_dict()).

import {
  criarProfissional,
  atualizarProfissional,
  ativarProfissional,
  desativarProfissional,
  buscarProfissional,
  resetarSenhaProfissional,
  resetar2faProfissional,
  resetarCompletoProfissional,
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
const blocoAcoesAdmin = document.getElementById('prof-modal-acoes-admin');
const btnResetarSenha = document.getElementById('prof-modal-resetar-senha');
const btnResetar2fa = document.getElementById('prof-modal-resetar-2fa');
const btnResetarCompleto = document.getElementById('prof-modal-resetar-completo');
const campoTipo = document.getElementById('pf-tipo');
const blocoMedico = document.getElementById('bloco-medico');
const blocoEnfermeiro = document.getElementById('bloco-enfermeiro');
const checkboxAdmin = document.getElementById('pf-is-admin');
const checkboxAdminGroup = checkboxAdmin?.closest('.field-group');

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
 * Abre o modal para criar um novo usuário.
 *
 * ALTERADO (checkbox "É administrador"): não há mais um seletor em
 * duas etapas -- o formulário único já mostra o tipo de profissional
 * (médico/enfermeiro) e, para quem pode convidar admin, um checkbox
 * "É administrador" ao lado. Um admin comum nunca vê o checkbox (ele
 * não tem permissão para criar admin -- o backend bloqueia, e nem
 * faz sentido oferecer a opção na UI), mas continua vendo o select de
 * tipo normalmente.
 */
export function abrirModalConvite() {
  limparFormulario();
  uuidEmEdicao = null;
  somenteLeitura = false;
  form.dataset.modoConvite = 'profissional';

  titulo.textContent = 'Convidar profissional';
  hintEdicao.hidden = true;
  esconderFeedback();
  btnToggleStatus.hidden = true;
  btnSalvar.textContent = 'Enviar convite';
  definirModoFormulario(false);

  // O checkbox "É administrador" só aparece para quem tem permissão
  // de convidar admin (super admin) -- para os demais, o campo fica
  // oculto e sempre desmarcado, então o payload nunca leva is_admin.
  if (checkboxAdminGroup) checkboxAdminGroup.hidden = !souSuperAdmin();
  if (checkboxAdmin) checkboxAdmin.checked = false;

  atualizarBlocosCondicionais();
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
 *   uuid, nome_completo, email, funcao_clinica, status, is_admin)
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
  // Checkbox "É administrador" só faz sentido no fluxo de criação --
  // trocar is_admin de um usuário existente é outro fluxo (promoção/
  // rebaixamento não existe via esta edição, ver atualizarProfissional).
  if (checkboxAdminGroup) checkboxAdminGroup.hidden = true;

  const campoTipoGroup = campoTipo?.closest('.field-group');
  if (campoTipoGroup) campoTipoGroup.hidden = false;

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
  configurarAcoesAdministrativas(item);
}

function preencherFormularioComDetalhe(dados) {
  document.getElementById('pf-nome').value = dados.nome_completo ?? '';
  document.getElementById('pf-email').value = dados.email ?? '';
  document.getElementById('pf-email-confirma').value = dados.email ?? '';
  document.getElementById('pf-telefone').value = dados.telefone ?? '';
  document.getElementById('pf-login').value = dados.user_login ?? '';
  // CORRIGIDO: o backend devolve CPF em claro (aes_decrypt) quando o
  // detalhe é buscado com incluir_sensiveis=True -- então dados.cpf
  // agora chega preenchido (string de 11 dígitos, sem máscara) e pode
  // ser exibido normalmente. Se por algum motivo a rota não incluir
  // sensíveis (dados.cpf vazio), o campo continua em branco -- é
  // opcional em modo edição, então isso não trava o formulário.
  document.getElementById('pf-cpf').value = dados.cpf ?? '';

  // ALTERADO (assertivo, sem alias): tipo_usuario saiu de
  // Usuario.to_dict() -- funcao_clinica assume o papel de indicar
  // se o alvo é médico/enfermeiro (independente de também ser admin).
  if (dados.funcao_clinica === 'medico' || dados.funcao_clinica === 'enfermeiro') {
    campoTipo.value = dados.funcao_clinica;
    atualizarBlocosCondicionais();
    // CORRIGIDO: atributos_profissionais vem de PapelClinico.to_dict(),
    // que usa numero_conselho/uf_conselho/rqe/especialidade -- não
    // numero-crm/uf-crm/numero-coren/uf-coren (chaves com hífen que
    // nunca existiram no backend). Era por isso que CRM/RQE/COREN
    // nunca apareciam ao editar: o front lia uma chave que o backend
    // jamais mandou.
    const atributos = dados.atributos_profissionais || {};
    if (dados.funcao_clinica === 'medico') {
      document.getElementById('pf-crm').value = atributos.numero_conselho ?? '';
      document.getElementById('pf-uf-crm').value = atributos.uf_conselho ?? '';
      document.getElementById('pf-rqe').value = atributos.rqe ?? '';
    } else {
      document.getElementById('pf-coren').value = atributos.numero_conselho ?? '';
      document.getElementById('pf-uf-coren').value = atributos.uf_conselho ?? '';
      document.getElementById('pf-especialidade').value = atributos.especialidade ?? '';
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
      let resultado;
      if (vaiDesativar) {
        resultado = await desativarProfissional(item.uuid);
      } else {
        resultado = await ativarProfissional(item.uuid);
      }
      // ADICIONADO: ativar/desativarProfissional retornam undefined
      // quando o usuário cancela a confirmação de step-up -- não é
      // sucesso nem erro, só desistência.
      if (resultado === undefined) return;
      exibirMensagem(vaiDesativar ? 'Usuário desativado.' : 'Usuário ativado.', 'sucesso');
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

/**
 * Mostra/esconde e liga os 3 botões de ação administrativa (resetar
 * senha, resetar 2FA, resetar tudo). Visível só em edição (não em
 * convite), para quem é admin, e nunca em modo somente-leitura.
 * O backend ainda decide a permissão real (rotas exigem
 * g.is_super_admin) -- isso aqui é só a UI.
 */
function configurarAcoesAdministrativas(item) {
  if (!blocoAcoesAdmin) return;

  const podeVer = souAdmin() && !somenteLeitura;
  blocoAcoesAdmin.hidden = !podeVer;
  if (!podeVer) return;

  ligarAcaoAdministrativa(btnResetarSenha, () => resetarSenhaProfissional(item.uuid), 'Senha resetada.');
  ligarAcaoAdministrativa(btnResetar2fa, () => resetar2faProfissional(item.uuid), '2FA resetado.');
  ligarAcaoAdministrativa(btnResetarCompleto, () => resetarCompletoProfissional(item.uuid), 'Usuário resetado por completo.');
}

/**
 * Liga um botão de ação administrativa: desabilita durante a
 * chamada, trata cancelamento do step-up (resultado === undefined),
 * mostra sucesso/erro e fecha o modal ao concluir -- mesmo padrão de
 * configurarBotaoStatus.
 */
function ligarAcaoAdministrativa(botao, executar, mensagemSucesso) {
  if (!botao) return;
  botao.onclick = async () => {
    botao.disabled = true;
    try {
      const resultado = await executar();
      if (resultado === undefined) return; // usuário cancelou o step-up
      exibirMensagem(mensagemSucesso, 'sucesso');
      await recarregarLista();
      setTimeout(fecharModal, 900);
    } catch (erro) {
      const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível concluir a ação.';
      exibirMensagem(mensagem, 'erro');
    } finally {
      botao.disabled = false;
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

  const campos = lerCamposFormulario();
  let { payload, erros } = validarFormularioProfissional(campos, editando);

  // Checkbox "É administrador": só existe (visível) no fluxo de
  // criação para quem pode convidar admin. tipo_papel é opcional
  // nesse caso -- um admin pode ou não ter função clínica -- então,
  // se o campo de tipo estiver vazio, não exigimos CRM/COREN (a
  // própria validarFormularioProfissional só exige esses campos
  // quando campos.tipo está preenchido).
  if (!editando && checkboxAdmin && !checkboxAdminGroup?.hidden && checkboxAdmin.checked) {
    payload.is_admin = true;
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
      const resultado = await atualizarProfissional(uuidEmEdicao, payload);
      // ADICIONADO: atualizarProfissional pode retornar undefined
      // quando o payload mexe em campo sensível (is_admin/tipo_papel)
      // e o usuário cancela a confirmação de step-up -- nesse caso não
      // é sucesso nem erro, só desistência; não fecha o modal nem
      // mostra mensagem de sucesso falsa.
      if (resultado === undefined) return;
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
  if (blocoAcoesAdmin) blocoAcoesAdmin.hidden = true;
  form.querySelectorAll('input, select').forEach((el) => { el.disabled = false; });
  const campoTipoGroup = campoTipo?.closest('.field-group');
  if (campoTipoGroup) campoTipoGroup.hidden = false;
  if (checkboxAdmin) checkboxAdmin.checked = false;
  if (checkboxAdminGroup) checkboxAdminGroup.hidden = true;
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