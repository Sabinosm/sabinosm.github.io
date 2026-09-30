// preencherPreferencias.js
//
// Sincroniza tema, escala de fonte e idioma com o valor vindo do
// payload (sessionStorage, ver USER_CACHE_KEY em userCache.js -- este
// payload É o snapshot de /me, não um fetch novo).

import { definirValorInicial } from '../settingsHelpers/settingsPaineis.js';
import { aplicarIdioma } from '../i18n/aplicarIdioma.js';

const THEME_STORAGE_KEY = 'bion-theme';
const FONT_STORAGE_KEY = 'bion-font-size';
const IDIOMA_STORAGE_KEY = 'bion-idioma';
const TAMANHO_FONTE_POR_INDICE = ['pequeno', 'medio', 'grande'];

export function preencherPreferencias(configuracoes) {
  preencherTema(configuracoes);
  preencherFonte(configuracoes);
  preencherIdioma(configuracoes);
}

function preencherTema(configuracoes) {
  const tema = configuracoes?.design?.tema;
  if (!tema) return;

  document.documentElement.dataset.theme = tema;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, tema);
  } catch {
    // localStorage indisponível -- o tema ainda fica aplicado nesta sessão
  }

  sincronizarSwatchDoModal(tema);
}

function preencherFonte(configuracoes) {
  const tamanho = configuracoes?.design?.tamanho_fonte;
  if (!tamanho) return;

  document.documentElement.dataset.fontSize = tamanho;

  try {
    localStorage.setItem(FONT_STORAGE_KEY, tamanho);
  } catch {
    // localStorage indisponível -- a fonte ainda fica aplicada nesta sessão
  }

  sincronizarSliderDoModal(tamanho);
}

/**
 * linguagem vem da API como lista (ex: ["pt-BR"]) -- ver
 * PreferenciasSchema.linguagem no backend. Hoje só o primeiro item é
 * usado como idioma ativo da UI; a lista existir sugere suporte a
 * múltiplos idiomas preferidos no futuro, mas aplicarIdioma() só
 * troca para UM idioma de cada vez.
 */
function preencherIdioma(configuracoes) {
  const idioma = configuracoes?.preferencias?.linguagem?.[0];
  if (!idioma) return;

  aplicarIdioma(idioma);

  try {
    localStorage.setItem(IDIOMA_STORAGE_KEY, idioma);
  } catch {
    // localStorage indisponível -- o idioma ainda fica aplicado nesta sessão
  }

  sincronizarSelectDoModal(idioma);
}

function sincronizarSwatchDoModal(tema) {
  const prefsPanel = document.getElementById('panel-preferencias');
  if (!prefsPanel) return;

  prefsPanel.querySelectorAll('.theme-option').forEach(b => {
    b.classList.toggle('theme-option--active', b.dataset.themeOption === tema);
  });
}

function sincronizarSliderDoModal(tamanho) {
  const slider = document.getElementById('f-fonte');
  if (!slider) return;

  const indice = TAMANHO_FONTE_POR_INDICE.indexOf(tamanho);
  if (indice === -1) return;

  slider.value = indice;
  definirValorInicial(slider, String(indice));
}

function sincronizarSelectDoModal(idioma) {
  const select = document.getElementById('f-idioma');
  if (!select) return;

  select.value = idioma;
  definirValorInicial(select, idioma);
}