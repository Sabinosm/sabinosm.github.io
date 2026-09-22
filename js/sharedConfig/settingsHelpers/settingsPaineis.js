// ============================================
// B-íon — Modal de Configurações: estado por painel (save-bar),
// seleção de tema, cancelar e salvar.
// ============================================

import { atualizarDesignCache, atualizarPreferenciasCache } from '../userCache.js';
import { exibirFeedbackConfiguracoes, limparFeedbackConfiguracoes, exibirFeedbackSucessoTemporario } from './settingsFeedback.js';
import { montarConfiguracoesParaApi, salvarConfiguracoesNaApi } from './settingsApi.js';

const THEME_STORAGE_KEY = 'bion-theme';

export function getActivePanel() {
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

export function refreshSaveBarForActivePanel() {
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
export function revertActivePanel() {
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

  // Reflete o que acabou de ser confirmado pela API também no
  // snapshot de sessionStorage (bion-dados-usuario), que
  // initHomePage.js relê em toda navegação de página e
  // preencherPainelPerfil.js trata como fonte de verdade.
  //
  // Sem isso, o valor salvo aqui fica correto no backend e em
  // localStorage (no caso do tema), mas a PRÓXIMA página lê o
  // snapshot velho do login via sessionStorage e "desfaz" a mudança
  // visualmente -- foi exatamente o bug observado com o tema antes
  // deste módulo existir. Usamos o mesmo payload já montado para a
  // API (montarConfiguracoesParaApi) para não duplicar a lógica de
  // mapeamento id-do-campo -> formato da API.
  const configuracoesAtualizadas = montarConfiguracoesParaApi(payload);
  if (configuracoesAtualizadas.design) {
    atualizarDesignCache(configuracoesAtualizadas.design);
  }
  if (configuracoesAtualizadas.preferencias) {
    atualizarPreferenciasCache(configuracoesAtualizadas.preferencias);
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