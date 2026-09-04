// themeLoader.js
//
// Aplica o tema salvo em localStorage no <html data-theme="...">
// o mais cedo possível -- antes do primeiro paint da página.
//
// Por quê este arquivo existe separado de settings.js:
// settings.js também restaura o tema salvo (restoreSavedTheme), mas
// agora é carregado como módulo DEPOIS que settingsModal.html termina
// de ser buscado via fetch (ver settingsLoader.js) -- então há uma
// janela real em que a página já pintou com o tema padrão do HTML
// estático antes do tema salvo ser aplicado, causando um "flash" de
// cor errada (FOUC) sempre que o tema salvo for diferente do
// data-theme fixo no <html> da página.
//
// Este script cuida SÓ da parte que precisa ser instantânea (setar
// data-theme no <html>). A parte que depende do modal existir --
// marcar o botão de tema ativo em #panel-preferencias, sincronizar
// panelState -- continua em settings.js, que roda depois.
//
// localStorage aqui é só um CACHE local para matar o FOUC -- a fonte
// de verdade é a API. Assim que o payload de /me chega (login ou
// refresh de sessão), preencherPainelPerfil.js (preencherTema) pisa
// em cima do que estiver aqui com o valor oficial da API e também
// atualiza este mesmo localStorage, para que a próxima carga de
// página (antes do /me responder) já comece com o valor mais recente
// conhecido.
//
// Uso: <script src=".../applyTheme.js"></script> (SEM type="module",
// SEM defer/async) colocado no <head>, antes de qualquer <link
// rel="stylesheet"> que dependa de --var de tema, e certamente antes
// de settingsLoader.js. Script síncrono e bloqueante de propósito:
// é o único jeito de garantir que roda antes do primeiro paint.

(function aplicarTemaSalvoCedo() {
  try {
    const salvo = localStorage.getItem('bion-theme');
    if (salvo) document.documentElement.dataset.theme = salvo;
  } catch {
    // localStorage indisponível (modo privado restritivo, etc.) --
    // sem problema, a página segue com o data-theme padrão do HTML.
  }
})();