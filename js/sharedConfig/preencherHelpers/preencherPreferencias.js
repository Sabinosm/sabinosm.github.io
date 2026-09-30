// preencherPreferencias.js
//
// Sincroniza tema e escala de fonte com o valor vindo do payload
// (sessionStorage, ver USER_CACHE_KEY em userCache.js -- este payload
// É o snapshot de /me, não um fetch novo).
//
// Era dois arquivos (preencherTema.js + preencherFonte.js) com o
// mesmo padrão -- consolidado aqui pelo mesmo motivo de
// preferencias.css e preferenciasLoader.js: tema e fonte são a mesma
// categoria de preferência (aplicar no <html>, cachear em
// localStorage, sincronizar o painel de Preferências).

import { definirValorInicial } from '../settingsHelpers/settingsPaineis.js';

const THEME_STORAGE_KEY = 'bion-theme';
const FONT_STORAGE_KEY = 'bion-font-size';
const TAMANHO_FONTE_POR_INDICE = ['pequeno', 'medio', 'grande'];

/**
 * preferenciasLoader.js já aplicou tema e fonte salvos em localStorage
 * antes do primeiro paint (evita flash). Aqui, sobrescrevemos com o
 * valor do snapshot -- cobre o caso de o usuário ter mudado a
 * preferência em outro dispositivo/sessão desde a última vez que este
 * navegador salvou algo em localStorage.
 *
 * IMPORTANTE: desde a introdução de userCache.js, qualquer save de
 * configurações bem-sucedido (ver settings.js) já atualiza este mesmo
 * snapshot via atualizarDesignCache(). Isso garante que os valores
 * lidos aqui nunca ficam "atrás" de uma mudança que o usuário acabou
 * de salvar na aba Preferências -- se ficarem, o bug está na
 * gravação, não aqui.
 */
export function preencherPreferencias(configuracoes) {
  preencherTema(configuracoes);
  preencherFonte(configuracoes);
}

function preencherTema(configuracoes) {
  const tema = configuracoes?.design?.tema;
  if (!tema) return;

  document.documentElement.dataset.theme = tema;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, tema);
  } catch {
    // localStorage indisponível (modo privado restritivo, etc.) --
    // o tema ainda fica aplicado via data-theme nesta sessão.
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
    // localStorage indisponível -- fonte ainda fica aplicada nesta sessão
  }

  sincronizarSliderDoModal(tamanho);
}

/**
 * Se o modal de Configurações já estiver no DOM (settingsLoader.js já
 * rodou), marca o swatch de tema ativo e corrige o initialTheme do
 * panelState, para não aparecer como "alteração pendente" na save-bar
 * por causa de uma diferença que já veio resolvida da API.
 *
 * Se o modal ainda não existir, não faz nada aqui -- a
 * auto-sincronização que já existe em settingsPaineis.js
 * (sincronizarUiComTemaAtual, que roda ao final do módulo) cobre esse
 * caso lendo o data-theme já setado acima.
 */
function sincronizarSwatchDoModal(tema) {
  const prefsPanel = document.getElementById('panel-preferencias');
  if (!prefsPanel) return;

  prefsPanel.querySelectorAll('.theme-option').forEach(b => {
    b.classList.toggle('theme-option--active', b.dataset.themeOption === tema);
  });
}

/**
 * Equivalente ao de cima, mas para o slider de fonte: preenche o
 * valor e corrige o initialValues via definirValorInicial (exportado
 * por settingsPaineis.js), pelo mesmo motivo -- sem isso, a save-bar
 * acusaria "alterado" assim que o modal fosse aberto, mesmo sem o
 * usuário ter tocado no slider.
 */
function sincronizarSliderDoModal(tamanho) {
  const slider = document.getElementById('f-fonte');
  if (!slider) return;

  const indice = TAMANHO_FONTE_POR_INDICE.indexOf(tamanho);
  if (indice === -1) return;

  slider.value = indice;
  definirValorInicial(slider, String(indice));
}