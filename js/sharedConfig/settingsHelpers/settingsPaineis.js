// ============================================
// B-íon — Modal de Configurações: estado por painel (save-bar),
// seleção de tema, escala de fonte, cancelar e salvar.
// ============================================

import { atualizarDesignCache, atualizarPreferenciasCache } from '../userCache.js';
import { exibirFeedbackConfiguracoes, limparFeedbackConfiguracoes, exibirFeedbackSucessoTemporario } from './settingsFeedback.js';
import { montarConfiguracoesParaApi, salvarConfiguracoesNaApi } from './settingsApi.js';

const THEME_STORAGE_KEY = 'bion-theme';
const FONT_STORAGE_KEY = 'bion-font-size';
const TAMANHO_FONTE_POR_INDICE = ['pequeno', 'medio', 'grande'];

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
    el.addEventListener('input', () => {
      if (el.id === 'f-fonte') aplicarPreviewFonte(el.value);
      refreshSaveBarForActivePanel();
    });
    el.addEventListener('change', () => {
      if (el.id === 'f-fonte') aplicarPreviewFonte(el.value);
      refreshSaveBarForActivePanel();
    });
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

/**
 * Corrige o "valor de referência" (initialValues) de um campo
 * [data-track] depois que ele foi preenchido programaticamente com o
 * valor vindo da API (ver preencherPreferencias.js) -- sem isso, o
 * campo apareceria como "alterado" na save-bar assim que o modal
 * fosse aberto, mesmo sem o usuário ter tocado nele. Mesmo papel que
 * sincronizarUiComTemaAtual (mais abaixo) cumpre para o tema, só que
 * genérico para qualquer campo [data-track].
 */
export function definirValorInicial(elemento, valor) {
  for (const state of panelState.values()) {
    if (state.initialValues.has(elemento)) {
      state.initialValues.set(elemento, valor);
      return;
    }
  }
}

// ===== Preview da escala de fonte (aba Preferências) =====
function aplicarPreviewFonte(indice) {
  const nome = TAMANHO_FONTE_POR_INDICE[Number(indice)];
  if (nome) document.documentElement.dataset.fontSize = nome;
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
  trackedFields.forEach(el => {
    el.value = state.initialValues.get(el);
    if (el.id === 'f-fonte') aplicarPreviewFonte(el.value); // desfaz o preview de fonte
  });

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
    // Nota: os previews de tema e fonte (aplicados no clique do swatch
    // e no input do slider) NÃO são revertidos aqui de propósito -- o
    // usuário ainda está com a save-bar aberta e pode corrigir outro
    // campo e tentar salvar de novo. Se ele desistir, fechar o modal
    // ou clicar Cancelar chama revertActivePanel(), que aí sim desfaz
    // os previews.
    return; // mantém campos e save-bar como estavam
  }

  trackedFields.forEach(el => state.initialValues.set(el, el.value));

  if (state.pendingTheme !== null) {
    state.initialTheme = state.pendingTheme;
    state.pendingTheme = null;
    localStorage.setItem(THEME_STORAGE_KEY, state.initialTheme);
  }

  // Escala de fonte não tem "pendingTheme" próprio (é só um [data-track]
  // normal), então o cache de localStorage é atualizado direto aqui a
  // partir do payload já confirmado pela API.
  if (payload['f-fonte'] !== undefined) {
    const nome = TAMANHO_FONTE_POR_INDICE[Number(payload['f-fonte'])];
    if (nome) localStorage.setItem(FONT_STORAGE_KEY, nome);
  }

  // Reflete o que acabou de ser confirmado pela API também no
  // snapshot de sessionStorage (bion-dados-usuario), que
  // initHomePage.js relê em toda navegação de página e
  // preencherPainelPerfil.js trata como fonte de verdade.
  //
  // Sem isso, o valor salvo aqui fica correto no backend e em
  // localStorage (no caso do tema/fonte), mas a PRÓXIMA página lê o
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
// por preferenciasLoader.js (carregado no <head>, antes do primeiro
// paint -- evita flash de tema errado enquanto este modal ainda está
// sendo buscado/injetado). Aqui só marcamos o swatch ativo certo e
// sincronizamos panelState, que dependem do modal já existir no DOM.
//
// Escala de fonte não precisa do equivalente aqui: preencherPreferencias.js
// (chamado depois que o payload de /me chega) já faz esse trabalho via
// definirValorInicial, e o valor inicial do slider no HTML já é
// coerente com data-font-size padrão do CSS.
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