/* B-ÍON · INTRO
   Requer: bion-core.js (antes deste arquivo)
   Fundo: grade + brilho + partículas que reagem ao mouse

   1. Núcleo (B) parado no centro, elétrons girando
   2. "- íon" digita letra a letra ao lado
   3. Tudo esmaece suavemente e a página aparece

   Uso:
     Bion.playIntro(onDone)   → toca a intro manualmente

   Por padrão toca sozinha 1x por sessão.
   Para desativar o autoplay:
     <script src="bion-intro.js" data-autoplay="false"></script> */
(function () {
  'use strict';

  if (!window.Bion || !window.Bion.buildAtom) {
    console.error('[Bion] Carregue bion-core.js antes de bion-intro.js');
    return;
  }

  var STORAGE_KEY = 'bion-intro-done';
  var autoplay = !document.currentScript ||
                 document.currentScript.getAttribute('data-autoplay') !== 'false';

  function playIntro(onDone) {
    var overlay = document.createElement('div');
    overlay.id = 'bion-intro';
    overlay.className = 'bion-overlay';
    overlay.innerHTML =
      '<div class="bion-intro-logo">' +
        window.Bion.buildAtom() +
        '<div class="bion-intro-word" id="bion-word"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    var stopBg = window.Bion.createBackground(overlay);

    var word = overlay.querySelector('#bion-word');
    var chars = ['-', ' ', 'í', 'o', 'n'];
    var i = 0;

    var typer = setInterval(function () {
      if (i >= chars.length) {
        clearInterval(typer);
        setTimeout(fadeOut, 850);
        return;
      }
      var s = document.createElement('span');
      s.textContent = chars[i] === ' ' ? '\u00A0' : chars[i];
      word.appendChild(s);
      i++;
    }, 190);

    function fadeOut() {
      overlay.classList.add('bion-hidden'); /* esmaece logo + fundo */
      document.body.style.overflow = '';
      setTimeout(function () { stopBg(); overlay.remove(); }, 700);
      if (onDone) onDone();
    }
  }

  window.Bion.playIntro = playIntro;

  /* autoplay: 1x por sessão */
  function seen() {
    try { return !!sessionStorage.getItem(STORAGE_KEY); } catch (e) { return false; }
  }
  function markSeen() {
    try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
  }

  if (autoplay && !seen()) {
    var start = function () { playIntro(markSeen); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }
})();