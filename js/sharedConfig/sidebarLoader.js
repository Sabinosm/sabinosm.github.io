// Carrega a sidebar compartilhada dentro de <div id="sidebar-slot"></div>
// e marca automaticamente o item ativo com base no arquivo HTML atual.

async function carregarSidebar() {
  const slot = document.getElementById('sidebar-slot');
  if (!slot) return;

  try {
    const resp = await fetch('sidebar.html');
    if (!resp.ok) throw new Error(`Falha ao carregar sidebar.html (${resp.status})`);
    const html = await resp.text();
    slot.outerHTML = html; // substitui o <div id="sidebar-slot"> pelo <nav> em si

    marcarItemAtivo();
  } catch (erro) {
    console.error('Erro ao carregar a sidebar:', erro);
  }
}

function marcarItemAtivo() {
  // Pega o nome do arquivo atual, ex: "adminEmpresa.html"
  const paginaAtual = window.location.pathname.split('/').pop();

  document.querySelectorAll('.sidebar .nav-item[data-nav]').forEach((item) => {
    const href = item.getAttribute('href');
    if (href === paginaAtual) {
      item.classList.add('nav-item--active');
    } else {
      item.classList.remove('nav-item--active');
    }
  });
}

carregarSidebar();