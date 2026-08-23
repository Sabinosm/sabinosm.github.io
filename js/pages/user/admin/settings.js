// ============================================
// B-íon — Modal de Configurações
// Save/Cancel agora é POR PAINEL (não global).
// Cada painel decide se participa do fluxo salvar/cancelar
// adicionando [data-savable] na sua <section class="settings-panel">.
// Painéis sem [data-savable] (ex: Segurança) nunca mostram a save-bar,
// pois cada ação lá (remover dispositivo, trocar senha) já é
// destrutiva/imediata e não passa por "salvar em lote".
// ============================================

const THEME_STORAGE_KEY = 'bion-theme';

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

document.getElementById('btn-cancel').addEventListener('click', revertActivePanel);

// ===== Salvar — só afeta o painel ativo (hoje: Preferências) =====
document.getElementById('btn-save').addEventListener('click', () => {
  const panel = getActivePanel();
  if (!panel || !panel.hasAttribute('data-savable')) return;

  const state = panelState.get(panel);
  if (!state) return;

  const trackedFields = panel.querySelectorAll('[data-track]');

  // TODO: montar o payload e enviar para a API aqui.
  // Como o estado agora é por painel, o payload já sai isolado por contexto
  // (ex: só campos de Preferências), sem misturar com outras abas.
  const payload = {};
  trackedFields.forEach(el => { payload[el.id] = el.value; });
  if (state.pendingTheme !== null) payload.theme = state.pendingTheme;
  // console.log('Payload para API:', payload);

  trackedFields.forEach(el => state.initialValues.set(el, el.value));

  if (state.pendingTheme !== null) {
    state.initialTheme = state.pendingTheme;
    state.pendingTheme = null;
    localStorage.setItem(THEME_STORAGE_KEY, state.initialTheme);
  }

  saveBar.classList.remove('save-bar--visible');
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