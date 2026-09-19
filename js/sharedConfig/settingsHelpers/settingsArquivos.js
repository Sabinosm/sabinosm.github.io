import { exibirFeedbackConfiguracoes } from './settingsFeedback.js';

// ============================================
// Painel "Arquivos" (#panel-arquivos, ver settingsModal.html)
//
// Sem [data-savable]: mesmo padrão do painel Segurança -- as ações
// aqui (visualizar/baixar) são imediatas, não passam pela save-bar.
//
// Arquivos são estáticos por enquanto (servidos direto do frontend,
// ex: assets/docs/termos-de-uso.pdf) -- data-file no .file-item
// aponta pro caminho. Se isso virar uma rota de API no futuro
// (ex: GET /arquivos/:id), trocar só resolverUrlArquivo() abaixo.
// ============================================

const fileList = document.getElementById('file-list');

function resolverUrlArquivo(caminho) {
  return caminho;
}

function baixarArquivo(url, nomeArquivo) {
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

fileList?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const item = btn.closest('.file-item');
  const caminho = item?.dataset.file;
  if (!caminho) return;

  const url = resolverUrlArquivo(caminho);
  const nomeArquivo = item.querySelector('.file-name')?.textContent?.trim() || 'documento';

  if (btn.dataset.action === 'visualizar') {
    // Abre em nova aba; navegadores renderizam PDF nativamente.
    const janela = window.open(url, '_blank', 'noopener');
    if (!janela) {
      exibirFeedbackConfiguracoes('Não foi possível abrir o documento. Verifique se pop-ups estão bloqueados.', 'erro');
    }
  } else if (btn.dataset.action === 'baixar') {
    baixarArquivo(url, nomeArquivo);
  }
});