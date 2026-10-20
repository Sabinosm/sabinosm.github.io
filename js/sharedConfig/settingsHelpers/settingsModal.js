// ============================================
// B-íon — Modal de Configurações: abrir/fechar o modal e navegação por abas
// ============================================

import { limparFeedbackConfiguracoes } from './settingsFeedback.js';
import { revertActivePanel, refreshSaveBarForActivePanel } from './settingsPaineis.js';

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