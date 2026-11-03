// The wake: a faint current of rust-colored specks on the home page that brightens where the pointer moves.
(function () {
  var canvases = document.querySelectorAll('canvas[data-wake]');
  if (!canvases.length) return;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // phones draw at 30 fps with fewer specks; decay rates scale with elapsed time so the motion looks the same
  var NARROW_FRAME = 1000 / 30;
  var NARROW_THIN = 1.35;
  // each speck trails a tail this many 60 fps frames long. The canvas is cleared every frame instead of
  // faded, because a fade on a light ground never quite returns to the paper colour and leaves a grey haze.
  var TAIL = 14;

  // core: tight ribbon on the current; loose: sparser drift around it; ambient: faint specks anywhere.
  // alpha keeps the whole effect quiet behind the text.
  var CONFIG = {
    hero: { density: 340, max: 2200, core: 0.026, loose: 0.085, ambient: 0.06, alpha: 0.62, interactive: true, ignite: true, speed: 0.8, size: 0.8 }
  };

  function spinePoints(w) {
    // on phones the current hugs the right edge, away from the headline
    return w < 760
      ? [[1.08, -0.02], [0.8, 0.1], [0.98, 0.24], [0.72, 0.38], [0.94, 0.52], [0.78, 0.66], [1.08, 0.8]]
      : [[1.04, 0.0], [0.76, 0.16], [0.9, 0.42], [0.62, 0.6], [0.74, 0.84], [1.04, 0.98]];
  }

  function sprite(rgb, size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    var r = size / 2;
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(' + rgb + ',1)');
    grad.addColorStop(0.35, 'rgba(' + rgb + ',0.7)');
    grad.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }
  var RUST = '180, 83, 42';
  var DEEP_RUST = '122, 48, 18';
  var CORE = sprite(RUST, 32);
  var CORE_LIT = sprite(DEEP_RUST, 32);

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
    var cfg = CONFIG[canvas.dataset.wake] || CONFIG.hero;
    var ctx = canvas.getContext('2d');
    var w = 1, h = 1, spine = null, parts = [], trail = [];
    var t = 0, last = 0, raf = 0, visible = false, lastTicks = 1;
    var ignite = cfg.ignite && !reduceMotion ? 0 : 1;
    var pointer = { x: -9999, y: -9999, vx: 0, vy: 0, speed: 0, inside: false, lastT: 0 };
    var narrow = false;
    var offX = 0, offY = 0;

    function seed() {
      var n = Math.min(cfg.max, Math.round((w * h) / (cfg.density * (narrow ? NARROW_THIN : 1))));
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
          // strongest at the centre of the ribbon, fading outward
          base: core ? 0.35 + 0.6 * Math.exp(-g * g * 0.9) * Math.random() + 0.15 : 0.08 + Math.random() * 0.22,
          size: (core ? 0.45 + Math.random() * 0.9 : 0.35 + Math.random() * 0.7) * cfg.size,
          e: 0, dx: 0, dy: 0
        });
      }
    }

    // the canvas position on the page, cached so pointer moves never have to measure layout
    function measure() {
      var rect = canvas.getBoundingClientRect();
      offX = rect.left + window.scrollX;
      offY = rect.top + window.scrollY;
      return rect;
    }

    function resize() {
      var rect = measure();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      narrow = w < 760;
      var dpr = Math.min(window.devicePixelRatio || 1, narrow ? 1.5 : 1.75);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      spine = sampleSpine(spinePoints(w), w, h);
      seed();
    }

    // ticks: elapsed time in 60 fps frames, so the per-frame decay rates hold at any frame rate
    function step(dt, ticks) {
      if (ticks === undefined) ticks = 1;
      lastTicks = ticks;
      t += dt;
      if (ignite < 1) ignite = Math.min(1, ignite + dt / 1.6);
      var level = 0.38 + 0.62 * (1 - Math.pow(2, -10 * ignite));
      pointer.speed *= Math.pow(0.9, ticks);
      var keepE = Math.pow(0.958, ticks), keepD = Math.pow(0.968, ticks), keepV = Math.pow(0.95, ticks);
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
          // interpolate between samples so specks glide instead of snapping into rows
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
            p.e = Math.min(1.5, p.e + f * (0.05 + pointer.speed * 0.006) * ticks);
            p.dx += pointer.vx * f * 0.018 * ticks;
            p.dy += pointer.vy * f * 0.018 * ticks;
          }
        }
        p.e *= keepE;
        p.dx *= keepD;
        p.dy *= keepD;
        p.ox = p.rx === undefined ? x + p.dx : p.rx;
        p.oy = p.ry === undefined ? y + p.dy : p.ry;
        p.rx = x + p.dx;
        p.ry = y + p.dy;
        // on phones the stretch behind the text column is quieter still
        p.b = p.base * level * (narrow && x < w * 0.62 ? 0.5 : 1) + p.e;
      }

      for (var j = trail.length - 1; j >= 0; j--) {
        var q = trail[j];
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vx *= keepV;
        q.vy *= keepV;
        q.life -= dt / 1.4;
        if (q.life <= 0) trail.splice(j, 1);
      }
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);

      // each speck trails a short tail along its last movement
      var tail = TAIL / Math.max(0.5, lastTicks);
      ctx.lineCap = 'round';
      for (var s = 0; s < parts.length; s++) {
        var ps = parts[s];
        if (ps.amb || ps.b < 0.2) continue;
        ctx.globalAlpha = Math.min(0.5, ps.b * 0.4) * cfg.alpha;
        ctx.strokeStyle = 'rgb(' + (ps.b > 1.05 ? DEEP_RUST : RUST) + ')';
        ctx.lineWidth = ps.size * 0.9;
        ctx.beginPath();
        ctx.moveTo(ps.rx - (ps.rx - ps.ox) * tail, ps.ry - (ps.ry - ps.oy) * tail);
        ctx.lineTo(ps.rx, ps.ry);
        ctx.stroke();
      }
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var b = p.b;
        if (b < 0.03) continue;
        var r = p.size * (1.0 + 1.2 * Math.min(1.2, b));
        ctx.globalAlpha = Math.min(1, b) * cfg.alpha;
        ctx.drawImage(b > 1.05 ? CORE_LIT : CORE, p.rx - r, p.ry - r, r * 2, r * 2);
      }
      for (var j = 0; j < trail.length; j++) {
        var q = trail[j];
        var tr = 1 + 2.6 * q.life;
        ctx.globalAlpha = Math.min(1, q.life * 1.1) * cfg.alpha;
        ctx.drawImage(CORE_LIT, q.x - tr, q.y - tr, tr * 2, tr * 2);
      }
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      raf = 0;
      if (!visible || document.hidden) return;
      // 4 ms of slack so a 60 Hz screen draws every second frame instead of drifting to every third
      if (narrow && last && now - last < NARROW_FRAME - 4) {
        raf = requestAnimationFrame(frame);
        return;
      }
      var elapsed = Math.min(50, now - (last || now));
      last = now;
      step((elapsed / 1000) * (narrow ? 1.5 : 1), elapsed / (1000 / 60));
      draw();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (reduceMotion || raf || !spine) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    }

    function renderStill() {
      for (var i = 0; i < 90; i++) step(1 / 30);
      draw();
    }

    // page coordinates against the cached offset: no layout read on the hot path
    function onMove(pageX, pageY) {
      if (!visible) { pointer.inside = false; return; }
      var x = pageX - offX, y = pageY - offY;
      var inside = x >= 0 && y >= 0 && x <= w && y <= h;
      var now = performance.now();
      if (pointer.inside && inside) {
        var dtm = Math.max(8, now - pointer.lastT);
        pointer.vx = ((x - pointer.x) / dtm) * 16;
        pointer.vy = ((y - pointer.y) / dtm) * 16;
        pointer.speed = Math.min(80, Math.hypot(pointer.vx, pointer.vy));
        var count = Math.min(4, Math.floor(pointer.speed / 9));
        for (var i = 0; i < count && trail.length < 200; i++) {
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

    if (cfg.interactive && !reduceMotion) {
      window.addEventListener('pointermove', function (e) { onMove(e.pageX, e.pageY); }, { passive: true });
      window.addEventListener('touchmove', function (e) {
        if (e.touches[0]) onMove(e.touches[0].pageX, e.touches[0].pageY);
      }, { passive: true });
      canvas.parentElement.addEventListener('pointerleave', function () { pointer.inside = false; });
    }

    var resizeTimer = 0;
    new ResizeObserver(function () {
      // the first callback arrives right after layout, so sizing the canvas here never forces one
      if (!spine) {
        resize();
        if (reduceMotion) renderStill(); else if (visible) start();
        return;
      }
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        resize();
        if (reduceMotion) renderStill();
      }, 120);
    }).observe(canvas.parentElement);
    // content above the canvas can grow (fonts, images) without the canvas resizing, which shifts its offset
    new ResizeObserver(function () { measure(); }).observe(document.body);

    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) start();
    }, { threshold: 0.02 }).observe(canvas);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && visible) start();
    });
  }

  canvases.forEach(initWake);
})();
