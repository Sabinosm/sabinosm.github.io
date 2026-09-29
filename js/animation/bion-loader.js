/* B-ÍON · LOADER
   Requer: bion-core.js (antes deste arquivo)

   Uso:
     Bion.showLoading(2500)  → some sozinho após 2,5s
     var hide = Bion.showLoading();  → chame hide() quando terminar

   Exemplo com fetch:
     var hide = Bion.showLoading();
     fetch('/api/dados').then(render).finally(hide);

   Exemplo até a página carregar por completo:
     var hide = Bion.showLoading();
     window.addEventListener('load', hide); */
(function () {
  'use strict';

  if (!window.Bion || !window.Bion.buildAtom) {
    console.error('[Bion] Carregue bion-core.js antes de bion-loader.js');
    return;
  }

  function showLoading(duration) {
    var overlay = document.createElement('div');
    overlay.id = 'bion-loading';
    overlay.className = 'bion-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.innerHTML =
      window.Bion.buildAtom() +
      '<div class="bion-loader-text">Carregando<i>.</i><i>.</i><i>.</i></div>';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    var stopBg = window.Bion.createBackground(overlay);

    var hidden = false;
    function hide() {
      if (hidden) return;
      hidden = true;
      overlay.classList.add('bion-hidden');
      document.body.style.overflow = '';
      setTimeout(function () { stopBg(); overlay.remove(); }, 700);
    }
    if (duration) setTimeout(hide, duration);
    return hide;
  }

  window.Bion.showLoading = showLoading;
})();