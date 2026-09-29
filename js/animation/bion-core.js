/* B-ÍON · CORE
   Cria o namespace window.Bion e o átomo (SVG) usado pela intro e pelo loader.
   Conceito: o B é o NÚCLEO (parado, central),
   os ELÉTRONS (bolinhas) giram pelas ÓRBITAS (linhas fixas).
   Carregue este arquivo ANTES de bion-intro.js e/ou bion-loader.js. */
(function () {
  'use strict';

  var uid = 0;

  /* caminho elíptico da órbita (rx 27 × ry 10, centro 32,32) */
  var ORBIT_PATH = 'M 5 32 A 27 10 0 1 1 59 32 A 27 10 0 1 1 5 32 Z';

  function buildAtom(slow) {
    slow = slow || 1; /* multiplicador de duração: 1.3 = 30% mais lento */
    uid++;
    function orbit(rot, dur, begin) {
      dur = (dur * slow).toFixed(2) + 's';
      begin = (begin * slow).toFixed(2) + 's';
      var id = 'bion-orb-' + uid + '-' + rot;
      return (
        '<g transform="rotate(' + rot + ' 32 32)">' +
          '<path id="' + id + '" d="' + ORBIT_PATH + '" fill="none" stroke="rgba(245,245,245,.7)" stroke-width="1"/>' +
          '<circle r="2.4" fill="#F5F5F5">' +
            '<animateMotion dur="' + dur + '" begin="' + begin + '" repeatCount="indefinite">' +
              '<mpath href="#' + id + '"/>' +
            '</animateMotion>' +
          '</circle>' +
        '</g>'
      );
    }
    return (
      '<div class="bion-atom">' +
        '<svg viewBox="0 0 64 64">' +
          orbit(0,   3.4, 0) +
          orbit(60,  5.1, -1.7) +
          orbit(120, 6.8, -3.2) +
        '</svg>' +
        '<div class="bion-b">B</div>' +
      '</div>'
    );
  }

  /* ── FUNDO DE PARTÍCULAS ──
     Rede de partículas conectadas que reagem ao mouse (mesmo visual das
     páginas de erro). Cria um <canvas> dentro do overlay (e aplica a grade + brilho via classe .bion-bg) e devolve stop(),
     que cancela a animação. Não depende de nenhum outro arquivo. */
  function createBackground(host) {
    var canvas = document.createElement('canvas');
    canvas.className = 'bion-bg-canvas';
    host.classList.add('bion-bg');
    host.insertBefore(canvas, host.firstChild);
    var ctx = canvas.getContext('2d');

    var COUNT = 68, LINK_DIST = 145, REPEL_DIST = 110, REPEL_STR = 0.55, BASE_SPEED = 0.22;
    var LINE_RGB = '200, 200, 200', DOT_RGB = '200, 200, 200';
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var W = 0, H = 0, nodes = [], raf = 0, stopped = false;
    var mouse = { x: -9999, y: -9999 };

    function onMove(e) { mouse.x = e.clientX; mouse.y = e.clientY; }
    function onLeave() { mouse.x = -9999; mouse.y = -9999; }
    function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }

    function makeNode() {
      var a = Math.random() * Math.PI * 2;
      var s = BASE_SPEED * (0.5 + Math.random() * 0.7);
      return { x: Math.random() * W, y: Math.random() * H,
               vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 0.9 + Math.random() * 1.3 };
    }

    function tick() {
      if (stopped) return;
      ctx.clearRect(0, 0, W, H);
      var i, j, n;

      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        var dx = n.x - mouse.x, dy = n.y - mouse.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < REPEL_DIST && dist > 0) {
          var f = (1 - dist / REPEL_DIST) * REPEL_STR;
          n.vx += (dx / dist) * f;
          n.vy += (dy / dist) * f;
        }
        var spd = Math.sqrt(n.vx * n.vx + n.vy * n.vy) || 0.001;
        var cap = BASE_SPEED * 4;
        if (spd > cap) { n.vx = n.vx / spd * cap; n.vy = n.vy / spd * cap; }
        n.vx += (n.vx / spd) * (BASE_SPEED - spd) * 0.006;
        n.vy += (n.vy / spd) * (BASE_SPEED - spd) * 0.006;
        n.x += n.vx; n.y += n.vy;
        if (n.x < -20) n.x = W + 20;
        if (n.x > W + 20) n.x = -20;
        if (n.y < -20) n.y = H + 20;
        if (n.y > H + 20) n.y = -20;
      }

      for (i = 0; i < nodes.length; i++) {
        for (j = i + 1; j < nodes.length; j++) {
          var lx = nodes[i].x - nodes[j].x, ly = nodes[i].y - nodes[j].y;
          var d = Math.sqrt(lx * lx + ly * ly);
          if (d < LINK_DIST) {
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = 'rgba(' + LINE_RGB + ',' + ((1 - d / LINK_DIST) * 0.124) + ')';
            ctx.lineWidth = 0.4;
            ctx.stroke();
          }
        }
      }

      ctx.fillStyle = 'rgba(' + DOT_RGB + ',0.32)';
      for (i = 0; i < nodes.length; i++) {
        ctx.beginPath();
        ctx.arc(nodes[i].x, nodes[i].y, nodes[i].r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reduced) raf = requestAnimationFrame(tick); /* movimento reduzido: quadro estático */
    }

    function stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('resize', resize);
    }

    resize();
    for (var k = 0; k < COUNT; k++) nodes.push(makeNode());
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);
    window.addEventListener('resize', resize);
    tick();
    return stop;
  }

  window.Bion = window.Bion || {};
  window.Bion.buildAtom = buildAtom;
  window.Bion.createBackground = createBackground;
})();