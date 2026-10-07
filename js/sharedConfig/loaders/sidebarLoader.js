// sharedConfig/loaders/sidebarLoader.js
//
// Carrega a sidebar ÚNICA dentro de <div id="sidebar-slot"></div>,
// remove os itens que o usuário não pode ver (data-requer, ver
// sidebarPermissoes.js), resolve os links e marca o item ativo.
//
// ATENÇÃO: este arquivo usa `import`, então o <script> que o carrega
// em cada página precisa ser type="module".

import { aplicarPermissoesSidebar } from '../sidebarPermissoes.js';

// Resolvido a partir DESTE arquivo, não da página: continua valendo
// quando uma página muda de pasta. O sidebar.html fica junto do
// settingsModal.html; ajuste se for outro lugar.
const URL_SIDEBAR = new URL('../../../html/pages/user/sidebar.html', import.meta.url);

async function carregarSidebar() {
  const slot = document.getElementById('sidebar-slot');
  if (!slot) return;

  try {
    const resp = await fetch(URL_SIDEBAR);
    if (!resp.ok) throw new Error(`Falha ao carregar sidebar.html (${resp.status})`);
    const html = await resp.text();

    // Filtra ANTES de entrar no DOM: sem flash de itens proibidos.
    const modelo = document.createElement('template');
    modelo.innerHTML = html;
    aplicarPermissoesSidebar(modelo.content);
    resolverLinks(modelo.content);

    slot.replaceWith(modelo.content); // substitui o <div id="sidebar-slot"> pelo <nav>

    marcarItemAtivo();
  } catch (erro) {
    console.error('Erro ao carregar a sidebar:', erro);
  }
}

// Os href do sidebar.html são relativos ao PRÓPRIO
// sidebar.html, não à página que o injeta. Viram caminhos absolutos
// do servidor, então o mesmo item funciona em qualquer profundidade.
function resolverLinks(raiz) {
  raiz.querySelectorAll('a[href]').forEach((a) => {
    a.setAttribute('href', new URL(a.getAttribute('href'), URL_SIDEBAR).pathname);
  });
}

function marcarItemAtivo() {
  // Compara o caminho COMPLETO (não só o nome do arquivo): duas zonas
  // podem ter páginas com o mesmo nome.
  const atual = window.location.pathname;

  document.querySelectorAll('.sidebar .nav-item[data-nav]').forEach((item) => {
    item.classList.toggle('nav-item--active', item.getAttribute('href') === atual);
  });
}

/**
 * Promise que resolve quando a sidebar já está no DOM (ou quando o
 * carregamento falhou -- carregarSidebar() captura o erro e nunca
 * rejeita). initPagina.js a aguarda antes de preencher avatar e nome.
 */
export const sidebarPronta = carregarSidebar();