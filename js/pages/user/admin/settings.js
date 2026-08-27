// ============================================
// B-íon — Modal de Configurações
// Save/Cancel agora é POR PAINEL (não global).
// Cada painel decide se participa do fluxo salvar/cancelar
// adicionando [data-savable] na sua <section class="settings-panel">.
// Painéis sem [data-savable] (ex: Segurança) nunca mostram a save-bar,
// pois cada ação lá (remover dispositivo, trocar senha) já é
// destrutiva/imediata e não passa por "salvar em lote".
// ============================================

import { exibirMensagem } from '../../../shared/feedback.js';
import {URL_BASE_API} from '../../../config.js';

const THEME_STORAGE_KEY = 'bion-theme';
const CONFIGURACAO_API_URL = URL_BASE_API +'/configuracoes/';

const FEEDBACK_SUCESSO_DURACAO_MS = 2500;
let feedbackTimeoutId = null;

// exibirMensagem faz feedback.className = tipo, sobrescrevendo TODA a
// classe do elemento (não só adicionando) -- isso apagaria a classe
// base "feedback-mensagem" do CSS. Como esse comportamento é
// compartilhado com login/onboarding e não queremos mexer nele aqui,
// reforçamos a classe base logo em seguida, só neste módulo.

function exibirFeedbackConfiguracoes(texto, tipo) {
  if (feedbackTimeoutId !== null) {
    clearTimeout(feedbackTimeoutId);
    feedbackTimeoutId = null;
  }
  exibirMensagem(texto, tipo);
  const el = document.getElementById('mensagemFeedback');
  if (el) el.classList.add('feedback-mensagem');
}

function limparFeedbackConfiguracoes() {
  const el = document.getElementById('mensagemFeedback');
  if (!el) return;
  if (feedbackTimeoutId !== null) {
    clearTimeout(feedbackTimeoutId);
    feedbackTimeoutId = null;
  }
  el.textContent = '';
  el.className = 'feedback-mensagem';
}

/**
 * Mostra o feedback de sucesso e some sozinho depois de um tempo --
 * erro fica até o usuário agir (corrigir e salvar de novo, ou sair).
 */
function exibirFeedbackSucessoTemporario(texto) {
  exibirFeedbackConfiguracoes(texto, 'sucesso');
  if (feedbackTimeoutId !== null) clearTimeout(feedbackTimeoutId);
  feedbackTimeoutId = setTimeout(() => {
    feedbackTimeoutId = null;
    limparFeedbackConfiguracoes();
  }, FEEDBACK_SUCESSO_DURACAO_MS);
}


// ============================================
// Mapeamento entre os elementos [data-track] do painel Preferências
// (identificados pelo id do elemento, ver settingsModal.html) e a
// estrutura de configuracoes que a API espera (ver
// ConfiguracaoService.CONFIGURACOES_DEFAULT):
//   { design: { tema, tamanho_fonte }, preferencias: { linguagem } }
//
// f-idioma: <select> já tem value="pt-BR"/"en-US" no HTML -- envia
// o value direto, sem transformação.
//
// f-fonte: <input type="range" min="0" max="2">, não texto -- precisa
// converter o índice para o nome que o schema.py do backend espera.
// Se o range de opções mudar no HTML, ajustar este mapa junto.
// ============================================

const TAMANHO_FONTE_POR_INDICE = ['pequeno', 'medio', 'grande'];

/**
 * Monta o corpo de configuracoes no formato da API a partir do payload
 * plano { idDoElemento: valor, theme?: valor } usado internamente pelo
 * settings.js.
 */
function montarConfiguracoesParaApi(payloadPlano) {
  const configuracoes = { design: {}, preferencias: {} };

  if (payloadPlano.theme !== undefined) {
    configuracoes.design.tema = payloadPlano.theme;
  }

  if (payloadPlano['f-fonte'] !== undefined) {
    const indice = Number(payloadPlano['f-fonte']);
    const nome = TAMANHO_FONTE_POR_INDICE[indice];
    if (nome) configuracoes.design.tamanho_fonte = nome;
  }

  if (payloadPlano['f-idioma'] !== undefined) {
    configuracoes.preferencias.linguagem = [payloadPlano['f-idioma']];
  }

  // Remove seções que ficaram vazias (nada mapeado nelas)
  Object.keys(configuracoes).forEach(secao => {
    if (Object.keys(configuracoes[secao]).length === 0) delete configuracoes[secao];
  });

  return configuracoes;
}

/**
 * Envia as configurações atualizadas para a API.
 *
 * Retorna { ok: boolean, mensagem?: string }. Quem chama decide o que
 * fazer com a UI (reverter campos, manter save-bar visível, etc) --
 * esta função só cuida da chamada de rede e de extrair a mensagem de
 * erro que o backend manda (ver ConfiguracaoController/json_error).
 */
async function salvarConfiguracoesNaApi(payloadPlano) {
  const configuracoes = montarConfiguracoesParaApi(payloadPlano);
  if (Object.keys(configuracoes).length === 0) return { ok: true };

  try {
    const resposta = await fetch(CONFIGURACAO_API_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // front e API ficam em domínios/subdomínios diferentes -- 'same-origin' não enviaria o cookie httpOnly da sessão nesse caso
      body: JSON.stringify({ configuracoes }),
    });

    if (!resposta.ok) {
      // json_error retorna { success: false, message: "..." } -- ver
      // src/core/responses.py. Se o corpo não for esse formato (ex:
      // erro 500 sem JSON), cai no fallback genérico abaixo.
      let mensagem = 'Não foi possível salvar as configurações. Tente novamente.';
      try {
        const corpo = await resposta.json();
        if (corpo?.message) mensagem = corpo.message;
      } catch {
        // corpo não era JSON -- mantém a mensagem genérica
      }
      return { ok: false, mensagem };
    }

    return { ok: true };
  } catch (erro) {
    console.error('settings.js: erro de rede ao salvar configurações', erro);
    return {
      ok: false,
      mensagem: 'Sem conexão com o servidor. Verifique sua internet e tente novamente.',
    };
  }
}

// ===== Abrir / fechar modal =====
const overlay = document.getElementById('settings-overlay');
const openBtn = document.getElementById('open-settings');
const closeBtn = document.getElementById('settings-close');

function openSettings() {
  overlay.classList.add('settings-overlay--visible');
  document.body.classList.add('no-scroll');
}

function closeSettings() {
  // Sair sem salvar descarta automaticamente as alterações do painel ativo
  revertActivePanel();
  limparFeedbackConfiguracoes();
  overlay.classList.remove('settings-overlay--visible');
  document.body.classList.remove('no-scroll');
}

openBtn.addEventListener('click', openSettings);
closeBtn.addEventListener('click', closeSettings);

overlay.addEventListener('click', (e) => {
  if (e.target === overlay) closeSettings();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlay.classList.contains('settings-overlay--visible')) {
    closeSettings();
  }
});

// ===== Abas =====
const tabs = document.querySelectorAll('.settings-tab');
const panels = document.querySelectorAll('.settings-panel');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('settings-tab--active'));
    panels.forEach(p => p.classList.remove('settings-panel--active'));
    tab.classList.add('settings-tab--active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('settings-panel--active');
    // A save-bar reflete só o painel visível agora
    refreshSaveBarForActivePanel();
  });
});

function getActivePanel() {
  return document.querySelector('.settings-panel--active');
}

// ============================================
// Estado de "alterações pendentes" — por painel
// ============================================
const saveBar = document.getElementById('save-bar');

// Cada painel savable guarda seu próprio Map de valores iniciais
// e, se aplicável, sua própria escolha de tema pendente.
const panelState = new Map(); // panel element -> { initialValues: Map, initialTheme, pendingTheme }

document.querySelectorAll('.settings-panel[data-savable]').forEach(panel => {
  const trackedFields = panel.querySelectorAll('[data-track]');
  const initialValues = new Map();
  trackedFields.forEach(el => initialValues.set(el, el.value));

  const activeThemeBtn = panel.querySelector('.theme-option--active');

  panelState.set(panel, {
    initialValues,
    initialTheme: activeThemeBtn ? activeThemeBtn.dataset.themeOption : null,
    pendingTheme: null,
  });

  trackedFields.forEach(el => {
    el.addEventListener('input', () => refreshSaveBarForActivePanel());
    el.addEventListener('change', () => refreshSaveBarForActivePanel());
  });
});

function isPanelDirty(panel) {
  const state = panelState.get(panel);
  if (!state) return false;

  const trackedFields = panel.querySelectorAll('[data-track]');
  const fieldsDirty = [...trackedFields].some(el => el.value !== state.initialValues.get(el));
  const themeDirty = state.pendingTheme !== null && state.pendingTheme !== state.initialTheme;

  return fieldsDirty || themeDirty;
}

function refreshSaveBarForActivePanel() {
  const panel = getActivePanel();
  const savable = panel && panel.hasAttribute('data-savable');
  saveBar.classList.toggle('save-bar--visible', savable && isPanelDirty(panel));
}

// ===== Seleção de tema (aba Preferências) =====
document.querySelectorAll('.theme-option').forEach(btn => {
  btn.addEventListener('click', () => {
    const panel = btn.closest('.settings-panel');
    const state = panelState.get(panel);
    if (!state) return;

    panel.querySelectorAll('.theme-option').forEach(b => b.classList.remove('theme-option--active'));
    btn.classList.add('theme-option--active');
    state.pendingTheme = btn.dataset.themeOption;
    document.documentElement.dataset.theme = state.pendingTheme; // preview imediato

    refreshSaveBarForActivePanel();
  });
});

// ===== Reverter apenas o painel ativo (Cancelar / fechar sem salvar) =====
function revertActivePanel() {
  const panel = getActivePanel();
  if (!panel || !panel.hasAttribute('data-savable')) return;

  const state = panelState.get(panel);
  if (!state) return;

  const trackedFields = panel.querySelectorAll('[data-track]');
  trackedFields.forEach(el => { el.value = state.initialValues.get(el); });

  if (state.pendingTheme !== null) {
    document.documentElement.dataset.theme = state.initialTheme;
    panel.querySelectorAll('.theme-option').forEach(b => {
      b.classList.toggle('theme-option--active', b.dataset.themeOption === state.initialTheme);
    });
    state.pendingTheme = null;
  }

  saveBar.classList.remove('save-bar--visible');
}

document.getElementById('btn-cancel').addEventListener('click', () => {
  revertActivePanel();
  limparFeedbackConfiguracoes();
});

// ===== Salvar — só afeta o painel ativo (hoje: Preferências) =====
const btnSave = document.getElementById('btn-save');

btnSave.addEventListener('click', async () => {
  const panel = getActivePanel();
  if (!panel || !panel.hasAttribute('data-savable')) return;

  const state = panelState.get(panel);
  if (!state) return;

  const trackedFields = panel.querySelectorAll('[data-track]');

  // Como o estado agora é por painel, o payload já sai isolado por contexto
  // (ex: só campos de Preferências), sem misturar com outras abas.
  const payload = {};
  trackedFields.forEach(el => { payload[el.id] = el.value; });
  if (state.pendingTheme !== null) payload.theme = state.pendingTheme;

  // Espera a API confirmar ANTES de aplicar como definitivo. Se der
  // erro (ex: valor fora do formato aceito), os campos continuam com
  // o que o usuário digitou e a save-bar continua visível -- ele pode
  // corrigir e tentar salvar de novo, sem perder o que já preencheu.
  btnSave.disabled = true;
  const resultado = await salvarConfiguracoesNaApi(payload);
  btnSave.disabled = false;

  if (!resultado.ok) {
    exibirFeedbackConfiguracoes(resultado.mensagem, 'erro');
    // Nota: o preview de tema (aplicado no clique do swatch, ver
    // sincronizarUiComTemaAtual/theme-option handler) NÃO é revertido
    // aqui de propósito -- o usuário ainda está com a save-bar aberta
    // e pode corrigir outro campo e tentar salvar de novo. Se ele
    // desistir, fechar o modal ou clicar Cancelar chama
    // revertActivePanel(), que aí sim desfaz o preview.
    return; // mantém campos e save-bar como estavam
  }

  trackedFields.forEach(el => state.initialValues.set(el, el.value));

  if (state.pendingTheme !== null) {
    state.initialTheme = state.pendingTheme;
    state.pendingTheme = null;
    localStorage.setItem(THEME_STORAGE_KEY, state.initialTheme);
  }

  saveBar.classList.remove('save-bar--visible');
  exibirFeedbackSucessoTemporario('Configurações salvas com sucesso.');
});

// ============================================
// Sincroniza a UI do painel de Preferências com o tema já aplicado.
// O <html data-theme="..."> em si já foi setado o mais cedo possível
// por applyTheme.js (carregado no <head>, antes do primeiro paint --
// evita flash de tema errado enquanto este modal ainda está sendo
// buscado/injetado). Aqui só marcamos o swatch ativo certo e
// sincronizamos panelState, que dependem do modal já existir no DOM.
// ============================================
(function sincronizarUiComTemaAtual() {
  const atual = document.documentElement.dataset.theme;
  if (!atual) return;

  const prefsPanel = document.getElementById('panel-preferencias');
  if (!prefsPanel) return;

  prefsPanel.querySelectorAll('.theme-option').forEach(b => {
    b.classList.toggle('theme-option--active', b.dataset.themeOption === atual);
  });

  const state = panelState.get(prefsPanel);
  if (state) state.initialTheme = atual;
})();