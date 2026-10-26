// Bioluminescent wake: plankton drift along a current and light up where something moves through them.
(function () {
  var canvases = document.querySelectorAll('canvas[data-wake]');
  if (!canvases.length) return;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var BG = '3, 6, 11';

  // core: tight bright ribbon on the current; loose: dimmer drift around it; ambient: faint specks anywhere
  var CONFIG = {
    hero: { density: 210, max: 3600, core: 0.026, loose: 0.085, ambient: 0.08, fade: 0.1, interactive: true, ignite: true, speed: 1, size: 0.8 },
    close: { density: 400, max: 1700, core: 0.03, loose: 0.095, ambient: 0.07, fade: 0.12, interactive: true, ignite: false, speed: 0.8, size: 0.75 },
    calm: { density: 800, max: 800, core: 0.036, loose: 0.11, ambient: 0.12, fade: 0.16, interactive: false, ignite: false, speed: 0.55, size: 0.65 }
  };

  function spinePoints(kind, w) {
    var narrow = w < 760;
    if (kind === 'hero') {
      // on phones the current hugs the right edge through the first screen, behind the headline
      return narrow
        ? [[1.08, -0.02], [0.74, 0.08], [0.96, 0.2], [0.62, 0.33], [0.9, 0.46], [0.7, 0.6], [1.08, 0.72]]
        : [[1.04, 0.0], [0.76, 0.16], [0.9, 0.42], [0.62, 0.6], [0.74, 0.84], [1.04, 0.98]];
    }
    if (kind === 'close') {
      return narrow
        ? [[-0.06, 0.86], [0.34, 0.8], [0.66, 0.92], [1.06, 0.84]]
        : [[-0.06, 0.88], [0.3, 0.76], [0.58, 0.9], [0.84, 0.74], [1.06, 0.82]];
    }
    return narrow
      ? [[0.3, -0.05], [0.66, 0.12], [1.06, 0.06]]
      : [[0.52, -0.06], [0.7, 0.3], [0.86, 0.16], [1.06, 0.4]];
  }

  function sprite(rgb, size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    var r = size / 2;
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, 'rgba(' + rgb + ',0.95)');
    grad.addColorStop(0.5, 'rgba(' + rgb + ',0.22)');
    grad.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }
  var CORE_BLUE = sprite('30, 136, 255', 32);
  var CORE_CYAN = sprite('102, 246, 255', 32);
  var HALO = sprite('34, 128, 255', 64);

  function gauss() {
    var u = 1 - Math.random();
    var v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Catmull-Rom through the control points, sampled into a polyline with normals
  function sampleSpine(points, w, h) {
    var P = points.map(function (p) { return [p[0] * w, p[1] * h]; });
    var out = [];
    var steps = 48;
    for (var i = 0; i < P.length - 1; i++) {
      var p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || P[i + 1];
      for (var j = 0; j < steps; j++) {
        var t = j / steps, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    out.push(P[P.length - 1]);
    var normals = out.map(function (p, k) {
      var a = out[Math.max(0, k - 1)], b = out[Math.min(out.length - 1, k + 1)];
      var dx = b[0] - a[0], dy = b[1] - a[1];
      var len = Math.hypot(dx, dy) || 1;
      return [-dy / len, dx / len];
    });
    return { pts: out, normals: normals };
  }

  function initWake(canvas) {
    var kind = canvas.dataset.wake;
    var cfg = CONFIG[kind] || CONFIG.calm;
    var ctx = canvas.getContext('2d');
    var w = 1, h = 1, spine = null, parts = [], trail = [];
    var t = 0, last = 0, raf = 0, visible = false;
    var ignite = cfg.ignite && !reduceMotion ? 0 : 1;
    var pointer = { x: -9999, y: -9999, vx: 0, vy: 0, speed: 0, inside: false, lastT: 0 };
    var narrow = false;

    function seed() {
      var n = Math.min(cfg.max, Math.round((w * h) / cfg.density));
      var scale = Math.min(w, h * 1.4);
      parts = [];
      for (var i = 0; i < n; i++) {
        var roll = Math.random();
        if (roll < cfg.ambient) {
          parts.push({ amb: true, x: Math.random() * w, y: Math.random() * h, base: 0.05 + Math.random() * 0.16, size: (0.35 + Math.random() * 0.6) * cfg.size, e: 0, dx: 0, dy: 0 });
          continue;
        }
        var core = roll < cfg.ambient + (1 - cfg.ambient) * 0.62;
        var g = gauss();
        parts.push({
          amb: false,
          s: Math.random(),
          d: g * scale * (core ? cfg.core : cfg.loose),
          sp: (0.008 + Math.random() * 0.018) * cfg.speed,
          jt: gauss() * 0.004,
          ph: Math.random() * Math.PI * 2,
          // brightest at the centre of the ribbon, fading outward
          base: core ? 0.35 + 0.6 * Math.exp(-g * g * 0.9) * Math.random() + 0.15 : 0.08 + Math.random() * 0.22,
          size: (core ? 0.45 + Math.random() * 0.9 : 0.35 + Math.random() * 0.7) * cfg.size,
          e: 0, dx: 0, dy: 0
        });
      }
    }

    function resize() {
      var rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      spine = sampleSpine(spinePoints(kind, w), w, h);
      narrow = w < 760;
      seed();
      ctx.fillStyle = 'rgb(' + BG + ')';
      ctx.fillRect(0, 0, w, h);
    }

    function step(dt) {
      t += dt;
      if (ignite < 1) ignite = Math.min(1, ignite + dt / 1.6);
      var level = 0.38 + 0.62 * (1 - Math.pow(2, -10 * ignite));
      pointer.speed *= 0.9;
      var R = Math.max(90, Math.min(w, h) * 0.16);
      var R2 = R * R;
      var N = spine.pts.length - 1;

      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var x, y;
        if (p.amb) {
          var ang = Math.sin(p.x * 0.004 + t * 0.12) * 2.2 + Math.cos(p.y * 0.005 - t * 0.08) * 2.2;
          p.x += Math.cos(ang) * 5 * dt;
          p.y += Math.sin(ang) * 5 * dt;
          if (p.x < 0) p.x += w; else if (p.x > w) p.x -= w;
          if (p.y < 0) p.y += h; else if (p.y > h) p.y -= h;
          x = p.x; y = p.y;
        } else {
          p.s += p.sp * dt;
          if (p.s >= 1) p.s -= 1;
          // interpolate between samples so particles glide instead of snapping into rows
          var fk = Math.min(N - 0.0001, Math.max(0, (p.s + p.jt) * N));
          var k = Math.floor(fk), fr = fk - k;
          var a0 = spine.pts[k], a1 = spine.pts[k + 1], nm = spine.normals[k];
          var d = p.d * (1 + 0.22 * Math.sin(t * 0.7 + p.ph));
          x = a0[0] + (a1[0] - a0[0]) * fr + nm[0] * d;
          y = a0[1] + (a1[1] - a0[1]) * fr + nm[1] * d;
        }
        if (cfg.interactive && pointer.inside) {
          var ddx = x + p.dx - pointer.x, ddy = y + p.dy - pointer.y;
          var dist2 = ddx * ddx + ddy * ddy;
          if (dist2 < R2) {
            var f = 1 - Math.sqrt(dist2) / R;
            p.e = Math.min(1.5, p.e + f * (0.05 + pointer.speed * 0.006));
            p.dx += pointer.vx * f * 0.018;
            p.dy += pointer.vy * f * 0.018;
          }
        }
        p.e *= 0.958;
        p.dx *= 0.968;
        p.dy *= 0.968;
        p.ox = p.rx === undefined ? x + p.dx : p.rx;
        p.oy = p.ry === undefined ? y + p.dy : p.ry;
        p.rx = x + p.dx;
        p.ry = y + p.dy;
        // on phones only the stretch behind the text column is dimmed; the right gutter keeps full light
        p.b = p.base * level * (narrow && kind === 'hero' && x < w * 0.62 ? 0.72 : 1) + p.e;
      }

      for (var j = trail.length - 1; j >= 0; j--) {
        var q = trail[j];
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vx *= 0.95;
        q.vy *= 0.95;
        q.life -= dt / 1.4;
        if (q.life <= 0) trail.splice(j, 1);
      }
    }

    function draw() {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(' + BG + ',' + (narrow ? cfg.fade * 0.7 : cfg.fade) + ')';
      ctx.fillRect(0, 0, w, h);

      // faint current lines beside the spine
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(40, 130, 255, 0.03)';
      for (var o = -4; o <= 4; o++) {
        if (o === 0) continue;
        ctx.beginPath();
        for (var k = 0; k < spine.pts.length; k += 3) {
          var off = o * 18 * (1 + Math.abs(o) * 0.15) + Math.sin(t * 0.3 + k * 0.05 + o) * 7;
          var px = spine.pts[k][0] + spine.normals[k][0] * off;
          var py = spine.pts[k][1] + spine.normals[k][1] * off;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      ctx.globalCompositeOperation = 'lighter';
      // filaments: each particle draws its own short streak, and the slow fade lets streaks join into threads
      ctx.lineCap = 'round';
      for (var s = 0; s < parts.length; s++) {
        var ps = parts[s];
        if (ps.amb || ps.b < 0.2) continue;
        ctx.globalAlpha = Math.min(0.5, ps.b * 0.4);
        ctx.strokeStyle = ps.b > 1.05 ? 'rgb(102, 246, 255)' : 'rgb(36, 132, 255)';
        ctx.lineWidth = ps.size * 0.9;
        ctx.beginPath();
        ctx.moveTo(ps.ox, ps.oy);
        ctx.lineTo(ps.rx, ps.ry);
        ctx.stroke();
      }
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var b = p.b;
        if (b < 0.03) continue;
        var a = Math.min(1, b);
        if (b > 0.78) {
          var hs = p.size * 7 * Math.min(1.7, b);
          ctx.globalAlpha = Math.min(0.42, (b - 0.7) * 0.6);
          ctx.drawImage(HALO, p.rx - hs, p.ry - hs, hs * 2, hs * 2);
        }
        var r = p.size * (1.0 + 1.4 * Math.min(1.2, b));
        ctx.globalAlpha = a;
        ctx.drawImage(b > 1.05 ? CORE_CYAN : CORE_BLUE, p.rx - r, p.ry - r, r * 2, r * 2);
      }
      for (var j = 0; j < trail.length; j++) {
        var q = trail[j];
        var tr = 1.2 + 3.4 * q.life;
        ctx.globalAlpha = Math.min(1, q.life * 1.1);
        ctx.drawImage(CORE_CYAN, q.x - tr, q.y - tr, tr * 2, tr * 2);
      }
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      raf = 0;
      if (!visible || document.hidden) return;
      var dt = Math.min(0.05, (now - (last || now)) / 1000) * (narrow ? 1.5 : 1);
      last = now;
      step(dt);
      draw();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (reduceMotion || raf) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    }

    function renderStill() {
      for (var i = 0; i < 90; i++) step(1 / 30);
      ctx.fillStyle = 'rgb(' + BG + ')';
      ctx.fillRect(0, 0, w, h);
      var keep = cfg.fade;
      cfg.fade = 1;
      draw();
      cfg.fade = keep;
    }

    function onMove(clientX, clientY) {
      var rect = canvas.getBoundingClientRect();
      var x = clientX - rect.left, y = clientY - rect.top;
      var inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      var now = performance.now();
      if (pointer.inside && inside) {
        var dtm = Math.max(8, now - pointer.lastT);
        pointer.vx = ((x - pointer.x) / dtm) * 16;
        pointer.vy = ((y - pointer.y) / dtm) * 16;
        pointer.speed = Math.min(80, Math.hypot(pointer.vx, pointer.vy));
        var count = Math.min(5, Math.floor(pointer.speed / 7));
        for (var i = 0; i < count && trail.length < 260; i++) {
          trail.push({
            x: x + gauss() * 4, y: y + gauss() * 4,
            vx: -pointer.vx * (0.4 + Math.random() * 0.6) + gauss() * 10,
            vy: -pointer.vy * (0.4 + Math.random() * 0.6) + gauss() * 10,
            life: 0.6 + Math.random() * 0.4
          });
        }
      }
      pointer.x = x;
      pointer.y = y;
      pointer.inside = inside;
      pointer.lastT = now;
    }

    resize();
    if (reduceMotion) renderStill();

    if (cfg.interactive && !reduceMotion) {
      window.addEventListener('pointermove', function (e) { onMove(e.clientX, e.clientY); }, { passive: true });
      window.addEventListener('touchmove', function (e) {
        if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: true });
      canvas.parentElement.addEventListener('pointerleave', function () { pointer.inside = false; });
    }

    var resizeTimer = 0;
    new ResizeObserver(function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        resize();
        if (reduceMotion) renderStill();
      }, 120);
    }).observe(canvas.parentElement);

    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) start();
    }, { threshold: 0.02 }).observe(canvas);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && visible) start();
    });
  }

  canvases.forEach(initWake);

  // the readout that traces the visitor's own movement
  var readout = document.querySelector('[data-trace]');
  if (readout) {
    var countEl = readout.querySelector('[data-trace-count]');
    var agoEl = readout.querySelector('[data-trace-ago]');
    var events = 0, lastSeen = 0, pending = false;
    var mark = function () {
      events++;
      lastSeen = performance.now();
      if (!pending) {
        pending = true;
        requestAnimationFrame(function () {
          pending = false;
          countEl.textContent = events.toLocaleString('en-US');
          readout.classList.add('is-excited');
        });
      }
    };
    window.addEventListener('pointermove', mark, { passive: true });
    window.addEventListener('touchmove', mark, { passive: true });
    setInterval(function () {
      if (!lastSeen) return;
      var s = (performance.now() - lastSeen) / 1000;
      agoEl.textContent = s < 1 ? 'just now' : Math.floor(s) + 's ago';
      if (s > 2) readout.classList.remove('is-excited');
    }, 250);
  }
})();
