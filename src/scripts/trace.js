// The network map in the home page hero: packets cross a small network, the firewall stops most of them,
// and when one gets in, the SOC traces it with a line and rings it "detected".
(function () {
  var canvas = document.querySelector('canvas[data-trace]');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var css = getComputedStyle(document.documentElement);
  var INK = css.getPropertyValue('--text').trim() || '#1f1d1a';
  var DIM = css.getPropertyValue('--text-dim').trim() || '#6c675e';
  var ACCENT = css.getPropertyValue('--accent').trim() || '#086b50';
  var PAPER = css.getPropertyValue('--paper').trim() || '#f6f3ec';
  var LABEL_FONT = '600 11px ' + (css.getPropertyValue('--font-body').trim() || 'sans-serif');

  var NARROW_FRAME = 1000 / 30;  // phones draw at 30 fps
  var PASS_RATE = 0.12;          // share of packets the firewall lets through
  var MAX_QUIET = 7;             // seconds before one is let through anyway, so every visit sees a catch
  var CATCH_LIFE = 4;            // seconds a caught packet stays on screen

  // node positions as fractions of the drawing area: entry points on the left, the firewall,
  // internal hosts, and the SOC watching from the top right
  var LAYOUT = {
    e0: [0.02, 0.15], e1: [0.02, 0.5], e2: [0.02, 0.85], fw: [0.27, 0.5],
    a: [0.46, 0.18], b: [0.5, 0.7], c: [0.66, 0.4], d: [0.7, 0.9], e: [0.84, 0.6], soc: [0.95, 0.12]
  };
  var ENTRIES = ['e0', 'e1', 'e2'];
  var LINKS = [['e0', 'fw'], ['e1', 'fw'], ['e2', 'fw'], ['fw', 'a'], ['fw', 'b'], ['a', 'c'], ['b', 'c'], ['b', 'd'], ['c', 'e'], ['d', 'e']];
  var WATCH = [['soc', 'a'], ['soc', 'c'], ['soc', 'e']];
  var ROUTES = [['fw', 'a', 'c', 'e'], ['fw', 'b', 'c', 'e'], ['fw', 'b', 'd', 'e'], ['fw', 'a', 'c']];

  var w = 1, h = 1, narrow = false, sized = false;
  var nodes = {}, packets = [], spawn = 0, sincePass = 0;
  var raf = 0, last = 0, visible = false;
  var offX = 0, offY = 0;
  var pointer = { x: -1e4, y: -1e4, inside: false };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function ease(x) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3); }

  function layout(width, height) {
    w = Math.max(1, width);
    h = Math.max(1, height);
    narrow = w < 900;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // desktop: the right side of the hero, clear of the headline; narrow screens: a band under the buttons
    var R;
    if (narrow) R = { x0: 12, x1: w - 24, top: h - 168, bottom: h - 30 };
    else {
      var mid = h * 0.52, half = Math.min(h * 0.24, 150);
      R = { x0: w * 0.55, x1: w - Math.min(64, w * 0.04), top: mid - half, bottom: mid + half };
    }
    Object.keys(LAYOUT).forEach(function (k) {
      nodes[k] = { x: R.x0 + (R.x1 - R.x0) * LAYOUT[k][0], y: R.top + (R.bottom - R.top) * LAYOUT[k][1] };
    });
  }

  function addPacket() {
    var start = ENTRIES[Math.floor(Math.random() * ENTRIES.length)];
    var pass = Math.random() < PASS_RATE || sincePass > MAX_QUIET;
    if (pass) sincePass = 0;
    var route = [start].concat(pass ? ROUTES[Math.floor(Math.random() * ROUTES.length)] : ['fw']);
    packets.push({ route: route, seg: 0, f: 0, v: rand(70, 100), pass: pass, state: 'flow', age: 0, x: nodes[start].x, y: nodes[start].y });
  }

  function step(dt) {
    sincePass += dt;
    spawn += dt * 1.1;
    while (spawn >= 1) { spawn -= 1; addPacket(); }
    for (var i = 0; i < packets.length; i++) {
      var p = packets[i];
      p.age += dt;
      if (p.state !== 'flow') continue;
      var a = nodes[p.route[p.seg]], b = nodes[p.route[p.seg + 1]];
      p.f += (p.v * dt) / (Math.hypot(b.x - a.x, b.y - a.y) || 1);
      if (p.f >= 1) {
        p.seg++;
        p.f = 0;
        if (p.seg >= p.route.length - 1) {
          var end = nodes[p.route[p.route.length - 1]];
          p.x = end.x; p.y = end.y;
          p.state = p.pass ? 'caught' : 'blocked';
          p.age = 0;
          continue;
        }
        a = nodes[p.route[p.seg]]; b = nodes[p.route[p.seg + 1]];
      }
      p.x = a.x + (b.x - a.x) * p.f;
      p.y = a.y + (b.y - a.y) * p.f;
    }
    packets = packets.filter(function (p) {
      return !(p.state === 'blocked' && p.age > 0.6) && !(p.state === 'caught' && p.age > CATCH_LIFE);
    });
  }

  function label(text, x, y, color, alpha) {
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fillText(text, x, y);
    ctx.globalAlpha = 1;
  }

  function near(k) {
    var n = nodes[k];
    return pointer.inside && Math.hypot(pointer.x - n.x, pointer.y - n.y) < 34;
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);

    // links, darker around the node under the pointer
    ctx.lineWidth = 1;
    LINKS.forEach(function (l) {
      var a = nodes[l[0]], b = nodes[l[1]], hot = near(l[0]) || near(l[1]);
      ctx.strokeStyle = hot ? INK : DIM;
      ctx.globalAlpha = hot ? 0.7 : 0.32;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    });
    // the SOC's monitoring lines
    ctx.save();
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = ACCENT;
    ctx.globalAlpha = 0.35;
    WATCH.forEach(function (l) {
      var a = nodes[l[0]], b = nodes[l[1]];
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    });
    ctx.restore();
    ctx.globalAlpha = 1;

    // nodes: entry points, the firewall box, internal hosts, the SOC
    Object.keys(nodes).forEach(function (k) {
      var n = nodes[k], hot = near(k);
      ctx.fillStyle = PAPER;
      if (k === 'fw') {
        ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
        ctx.fillRect(n.x - 6, n.y - 6, 12, 12); ctx.strokeRect(n.x - 6, n.y - 6, 12, 12);
        label('firewall', n.x, n.y - 14, DIM, 1);
      } else if (k === 'soc') {
        ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(n.x, n.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = ACCENT;
        ctx.beginPath(); ctx.arc(n.x, n.y, 3, 0, Math.PI * 2); ctx.fill();
        label('SOC', n.x, n.y - 14, ACCENT, 0.9);
      } else {
        ctx.strokeStyle = ENTRIES.indexOf(k) >= 0 ? DIM : INK;
        ctx.lineWidth = hot ? 2 : 1.4;
        ctx.beginPath(); ctx.arc(n.x, n.y, hot ? 5.5 : 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    });

    // packets: moving dots, a fading circle where the firewall stops one, a traced and ringed catch
    packets.forEach(function (p) {
      if (p.state === 'blocked') {
        var k = ease(p.age / 0.5);
        ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.globalAlpha = 1 - k;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3 + 5 * k, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (p.state === 'caught') {
        var soc = nodes.soc, grow = ease(p.age / 0.45);
        var fade = p.age > CATCH_LIFE - 0.8 ? Math.max(0, (CATCH_LIFE - p.age) / 0.8) : 1;
        ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.4; ctx.globalAlpha = fade;
        ctx.beginPath(); ctx.moveTo(soc.x, soc.y); ctx.lineTo(soc.x + (p.x - soc.x) * grow, soc.y + (p.y - soc.y) * grow); ctx.stroke();
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.6, 0, Math.PI * 2); ctx.fill();
        if (p.age > 0.4) {
          var age = p.age - 0.4;
          ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(p.x, p.y, 3 + 7 * ease(age / 0.4), 0, Math.PI * 2); ctx.stroke();
          if (age < 2.6) label('detected', p.x, p.y - 16, ACCENT, Math.min(1, age / 0.2) * (age > 2.1 ? (2.6 - age) / 0.5 : 1) * fade);
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = INK; ctx.globalAlpha = Math.min(1, p.age * 3);
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.6, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
  }

  function frame(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    if (narrow && last && now - last < NARROW_FRAME - 4) {
      raf = requestAnimationFrame(frame);
      return;
    }
    var dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    step(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (reduceMotion || raf || !sized) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  // the canvas position on the page, cached so pointer moves never have to measure layout
  function measure() {
    var r = canvas.getBoundingClientRect();
    offX = r.left + window.scrollX;
    offY = r.top + window.scrollY;
  }

  if (!reduceMotion) {
    window.addEventListener('pointermove', function (e) {
      pointer.x = e.pageX - offX;
      pointer.y = e.pageY - offY;
      pointer.inside = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= w && pointer.y <= h;
    }, { passive: true });
  }

  // the observer reports the canvas size right after layout, so sizing never forces a reflow
  new ResizeObserver(function (entries) {
    var box = entries[0].contentRect;
    var first = !sized;
    measure();
    layout(box.width, box.height);
    sized = true;
    if (first) {
      // start mid-story so the first frame already shows traffic, and one catch for still frames
      packets = []; sincePass = MAX_QUIET - 1;
      for (var i = 0; i < 240; i++) step(1 / 30);
    }
    draw();
    if (first && visible) start();
  }).observe(canvas);
  // content above the canvas can grow (fonts, images) without the canvas resizing, which shifts its offset
  new ResizeObserver(function () { measure(); }).observe(document.body);

  new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
    if (visible) start();
  }, { threshold: 0.02 }).observe(canvas);

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && visible) start();
  });
})();
