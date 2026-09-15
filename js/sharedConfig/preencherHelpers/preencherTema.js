// Sincroniza o tema com o valor vindo do payload (sessionStorage,
// ver USER_CACHE_KEY em userCache.js -- este payload É o snapshot de
// /me, não um fetch novo).

const THEME_STORAGE_KEY = 'bion-theme';

/**
 * themeLoader.js já aplicou o tema salvo em localStorage antes do
 * primeiro paint (evita FOUC). Aqui, sobrescrevemos com o valor do
 * snapshot -- cobre o caso de o usuário ter mudado o tema em outro
 * dispositivo/sessão desde a última vez que este navegador salvou
 * algo em localStorage.
 *
 * IMPORTANTE: desde a introdução de userCache.js, qualquer save de
 * configurações bem-sucedido (ver settings.js) já atualiza este
 * mesmo snapshot via atualizarDadosUsuarioCache(). Isso garante que
 * o `tema` lido aqui nunca fica "atrás" de uma mudança que o usuário
 * acabou de salvar na aba Preferências -- se ficar, o bug está na
 * gravação (settings.js não chamou atualizarDadosUsuarioCache), não
 * aqui.
 *
 * Se o valor do snapshot for igual ao que já está aplicado, isso é
 * essencialmente um no-op visual (sem flash).
 */
export function preencherTema(configuracoes) {
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

/**
 * Se o modal de Configurações já estiver no DOM (settingsLoader.js já
 * rodou), marca o swatch de tema ativo e atualiza o initialTheme do
 * panelState do settings.js, para não aparecer como "alteração
 * pendente" na save-bar por causa de uma diferença que já veio
 * resolvida da API.
 *
 * Se o modal ainda não existir (ordem entre settingsLoader.js e este
 * módulo não é garantida), não faz nada aqui -- a auto-sincronização
 * que já existe em settings.js (sincronizarUiComTemaAtual, que roda
 * ao final do módulo) cobre esse caso lendo o data-theme já setado
 * acima.
 */
function sincronizarSwatchDoModal(tema) {
  const prefsPanel = document.getElementById('panel-preferencias');
  if (!prefsPanel) return;

  prefsPanel.querySelectorAll('.theme-option').forEach(b => {
    b.classList.toggle('theme-option--active', b.dataset.themeOption === tema);
  });
}