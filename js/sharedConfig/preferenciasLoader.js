// preferenciasLoader.js
//
// Aplica cedo, antes do primeiro paint, as preferências visuais
// cacheadas em localStorage: tema (data-theme), escala de fonte
// (data-font-size) e idioma (lang no <html>).
//
// localStorage aqui é só CACHE local para matar o flash de tema/fonte
// errados -- a fonte de verdade é a API. Assim que o payload de /me
// chega, preencherPreferencias.js pisa em cima do que estiver aqui
// com o valor oficial e também atualiza este mesmo localStorage.
//
// IMPORTANTE sobre idioma: diferente de tema/fonte (que são só CSS),
// trocar o texto visível exige o DOM já existir e o dicionário já
// carregado -- então aqui só setamos document.documentElement.lang
// cedo (evita o atributo errado por um instante), mas o TEXTO da
// página só troca quando aplicarIdioma() rodar de verdade, em
// preencherPreferencias.js. Um flash de texto no idioma anterior
// (ex: pt-BR por um instante numa sessão em en-US) é esperado e não
// tem como ser eliminado só com este loader.
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

  try {
    const idioma = localStorage.getItem('bion-idioma');
    if (idioma) document.documentElement.lang = idioma;
  } catch {
    // localStorage indisponível -- segue com o lang padrão do HTML
  }
})();