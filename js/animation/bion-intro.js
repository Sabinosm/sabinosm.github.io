/* B-ÍON · INTRO
   Requer: bion-core.js (antes deste arquivo)
   Fundo: grade + brilho + partículas que reagem ao mouse

   1. Átomo (B) entra sozinho no centro (fade + zoom, órbitas se desenham)
   2. "- íon" entra pela direita, empurrando o átomo p/ a esquerda
      (o conjunto continua centralizado)
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

  var SLOW = 1.3; /* 1 = original; 1.3 = 30% mais devagar */
  var STORAGE_KEY = 'bion-intro-done';
  var autoplay = !document.currentScript ||
                 document.currentScript.getAttribute('data-autoplay') !== 'false';

  /* linha do tempo (ms) — tudo escala com SLOW */
  var T = {
    atomIn:      Math.round(850 * SLOW), /* átomo entra sozinho (fade + zoom + órbitas) */
    hold:        Math.round(450 * SLOW), /* respiro com o B sozinho no centro */
    expand:      Math.round(900 * SLOW), /* caixa do texto abre e empurra o átomo p/ esquerda */
    letterStart: Math.round(200 * SLOW), /* atraso da 1ª letra depois que a caixa começa a abrir */
    stagger:     Math.round(100 * SLOW), /* intervalo entre letras */
    char:        Math.round(350 * SLOW), /* duração de cada letra */
    end:         Math.round(850 * SLOW)  /* pausa com o logo completo antes de esmaecer */
  };

  function playIntro(onDone) {
    var chars = ['-', ' ', 'í', 'o', 'n'];

    var overlay = document.createElement('div');
    overlay.id = 'bion-intro';
    overlay.className = 'bion-overlay';
    overlay.style.setProperty('--atom-in', T.atomIn + 'ms');
    overlay.style.setProperty('--expand',  T.expand + 'ms');
    overlay.style.setProperty('--char',    T.char + 'ms');
    overlay.innerHTML =
      '<div class="bion-intro-logo">' +
        window.Bion.buildAtom(SLOW) +
        '<div class="bion-intro-word"><div class="bion-intro-word-inner"></div></div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    var stopBg = window.Bion.createBackground(overlay);

    /* letras já existem (invisíveis), cada uma com seu atraso de entrada */
    var inner = overlay.querySelector('.bion-intro-word-inner');
    chars.forEach(function (c, i) {
      var s = document.createElement('span');
      s.textContent = c === ' ' ? '\u00A0' : c;
      s.style.animationDelay = (T.letterStart + i * T.stagger) + 'ms';
      inner.appendChild(s);
    });

    var expandTime = Math.max(T.expand, T.letterStart + (chars.length - 1) * T.stagger + T.char);

    /* 1) B sozinho → 2) letras entram pela direita → 3) esmaece */
    setTimeout(function () {
      overlay.classList.add('bion-expand');
      setTimeout(fadeOut, expandTime + T.end);
    }, T.atomIn + T.hold);

    function fadeOut() {
      overlay.classList.add('bion-hidden'); /* esmaece logo + fundo */
      document.body.style.overflow = '';
      setTimeout(function () { stopBg(); overlay.remove(); }, 950);
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
    if (document.body) {
      start(); /* script no início do <body>: cobre a página antes de ela aparecer */
    } else {
      document.addEventListener('DOMContentLoaded', start);
    }
  }
})();