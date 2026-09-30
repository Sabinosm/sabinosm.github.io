// preferenciasLoader.js
//
// Aplica cedo, antes do primeiro paint, as duas preferências visuais
// cacheadas em localStorage: tema (data-theme) e escala de fonte
// (data-font-size). Era dois arquivos (themeLoader.js + fontLoader.js)
// com o mesmo padrão -- consolidado aqui porque preferencias.css
// (antes themes.css) também juntou as regras dos dois num só lugar.
//
// localStorage aqui é só CACHE local para matar o flash de tema/fonte
// errados -- a fonte de verdade é a API. Assim que o payload de /me
// chega, preencherPreferencias.js (preencherTema + preencherFonte)
// pisa em cima do que estiver aqui com o valor oficial e também
// atualiza este mesmo localStorage.
//
// Uso: <script src=".../preferenciasLoader.js"></script> no <head>,
// SEM defer/async, antes de qualquer <link rel="stylesheet"> que
// dependa de --var de tema/fonte, e antes de settingsLoader.js.

(function aplicarPreferenciasSalvasCedo() {
  try {
    const tema = localStorage.getItem('bion-theme');
    if (tema) document.documentElement.dataset.theme = tema;
  } catch {
    // localStorage indisponível -- segue com o data-theme padrão do HTML
  }

  try {
    const fonte = localStorage.getItem('bion-font-size');
    if (fonte) document.documentElement.dataset.fontSize = fonte;
  } catch {
    // localStorage indisponível -- segue com o data-font-size padrão do CSS
  }
})();