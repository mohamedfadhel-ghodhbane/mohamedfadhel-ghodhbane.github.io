// The trace: a paper strip-chart recorder in the home page hero. An ink pen plots the visitor's activity as the
// paper scrolls; when a burst of movement crosses the dashed threshold, the peak is ringed and marked "detected".
(function () {
  var canvas = document.querySelector('canvas[data-trace]');
  if (!canvas) return;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var css = getComputedStyle(document.documentElement);
  var INK = css.getPropertyValue('--text').trim() || '#1f1d1a';
  var ACCENT = css.getPropertyValue('--accent').trim() || '#086b50';
  var RULE = css.getPropertyValue('--rule').trim() || '#ddd5c6';
  var LABEL_FONT = '600 11px ' + (css.getPropertyValue('--font-body').trim() || 'sans-serif');

  var RATE = 40;              // samples per second
  var THRESHOLD = 0.55;       // a peak above this value counts as a detection
  var NARROW_FRAME = 1000 / 30;
  var LABEL_LIFE = 2200;      // ms the "detected" label stays visible

  var ctx = canvas.getContext('2d');
  var w = 1, h = 1, narrow = false, speed = 60;
  var R = { x0: 0, x1: 1, pen: 1, base: 0, top: 0 };
  var samples = [];           // values, newest last
  var markers = [];           // { serial, v, born }
  var serial = 0, acc = 0, energy = 0, wander = 0, drift = 0;
  var peak = null, lastMark = -1e9, lastPointer = 0, nextBlip = 0;
  var raf = 0, last = 0, visible = false, sized = false;
  var pointer = { x: 0, y: 0, t: 0, has: false };

  function valueY(v) { return R.base - v * (R.base - R.top); }

  // quiet baseline: a slow wander plus fine jitter, with spikes from activity on top
  function nextValue() {
    drift += (Math.random() - 0.5) * 0.003;
    drift *= 0.95;
    wander = Math.max(-0.06, Math.min(0.1, (wander + drift) * 0.98));
    var v = 0.03 + wander + (Math.random() - 0.5) * 0.035 + energy * (0.55 + 0.45 * Math.random());
    energy *= 0.86;
    return Math.max(-0.12, Math.min(1.04, v));
  }

  function push(v, now) {
    samples.push(v);
    serial++;
    // track a peak while above the threshold; mark it once the line comes back down
    if (v >= THRESHOLD) {
      if (!peak || v > peak.v) peak = { serial: serial, v: v };
    } else if (peak) {
      if (peak.serial - lastMark > RATE * 0.8) {
        markers.push({ serial: peak.serial, v: peak.v, born: now });
        lastMark = peak.serial;
      }
      peak = null;
    }
    var keep = Math.ceil((R.pen - R.x0) / (speed / RATE)) + 4;
    if (samples.length > keep) samples.splice(0, samples.length - keep);
  }

  function layout(width, height) {
    w = Math.max(1, width);
    h = Math.max(1, height);
    narrow = w < 900;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (narrow) {
      // phones and tablets: a band under the buttons, the full width of the hero
      R = { x0: 0, x1: w, pen: w - 34, base: h - 46, top: h - 150 };
      speed = 42;
    } else {
      // desktop: the right side of the hero, clear of the headline
      var mid = h * 0.52, amp = Math.min(h * 0.24, 160);
      R = { x0: w * 0.54, x1: w, pen: w - Math.min(120, w * 0.08), base: mid + amp * 0.55, top: mid - amp };
      speed = 70;
    }
  }

  // fill the paper on first load so the chart arrives complete, with one past detection already ringed
  function prefill(now) {
    samples = []; markers = []; peak = null; lastMark = -1e9;
    nextBlip = now + 1800;
    var n = Math.ceil((R.pen - R.x0) / (speed / RATE));
    var spikeAt = Math.round(n * 0.62);
    for (var i = 0; i < n; i++) {
      if (i === spikeAt) energy = 0.85;
      if (i === Math.round(n * 0.3)) energy = Math.max(energy, 0.32);
      push(nextValue(), now - LABEL_LIFE);
    }
  }

  function draw(now) {
    ctx.clearRect(0, 0, w, h);
    var dx = speed / RATE;
    var shift = acc * dx;               // sub-sample scroll keeps the paper moving smoothly between samples
    var span = R.pen - R.x0;
    var fade = function (x) { return Math.max(0, Math.min(1, (x - R.x0) / (span * 0.28))); };
    var yT = valueY(THRESHOLD);

    // paper: baseline rule, a tick every second, and the pen carriage
    ctx.lineWidth = 1;
    ctx.strokeStyle = RULE;
    ctx.beginPath();
    ctx.moveTo(R.x0, R.base + 0.5);
    ctx.lineTo(R.x1, R.base + 0.5);
    for (var s = serial - (serial % RATE); ; s -= RATE) {
      var tx = R.pen - (serial - s) * dx - shift;
      if (tx < R.x0) break;
      ctx.moveTo(tx, R.base + 3);
      ctx.lineTo(tx, R.base + 9);
    }
    ctx.moveTo(R.pen + 0.5, R.top - 18);
    ctx.lineTo(R.pen + 0.5, R.base + 9);
    ctx.stroke();

    // the threshold
    ctx.save();
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = ACCENT;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(R.x0, yT + 0.5);
    ctx.lineTo(R.x1, yT + 0.5);
    ctx.stroke();
    ctx.restore();
    ctx.font = LABEL_FONT;
    ctx.fillStyle = ACCENT;
    ctx.globalAlpha = 0.85;
    ctx.fillText('threshold', narrow ? R.x0 + 8 : Math.min(R.pen + 10, R.x1 - ctx.measureText('threshold').width - 8), yT - 7);
    ctx.globalAlpha = 1;

    // the ink trace, fading in from the left edge of the paper
    var grad = ctx.createLinearGradient(R.x0, 0, R.x0 + span * 0.35, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, INK);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    var n = samples.length;
    var started = false;
    for (var i = 0; i < n; i++) {
      var x = R.pen - (n - 1 - i) * dx - shift;
      if (x < R.x0) continue;
      var y = valueY(samples[i]);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    var headY = valueY(n ? samples[n - 1] : 0);
    if (started) ctx.lineTo(R.pen, headY);
    ctx.stroke();

    // the pen
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(R.pen, headY, 2.6, 0, Math.PI * 2);
    ctx.fill();

    // detections: an accent ring that draws in, with a short-lived label
    ctx.strokeStyle = ACCENT;
    ctx.fillStyle = ACCENT;
    ctx.lineWidth = 1.6;
    for (var m = markers.length - 1; m >= 0; m--) {
      var mk = markers[m];
      var mx = R.pen - (serial - mk.serial) * dx - shift;
      if (mx < R.x0 - 20) { markers.splice(m, 1); continue; }
      var age = now - mk.born;
      var grow = 1 - Math.pow(1 - Math.min(1, age / 380), 3);
      var my = valueY(mk.v);
      ctx.globalAlpha = fade(mx);
      ctx.beginPath();
      ctx.arc(mx, my, 3 + 7 * grow, 0, Math.PI * 2);
      ctx.stroke();
      if (age < LABEL_LIFE) {
        var la = age < 200 ? age / 200 : age > LABEL_LIFE - 500 ? (LABEL_LIFE - age) / 500 : 1;
        ctx.globalAlpha = la * fade(mx);
        var label = 'detected';
        ctx.fillText(label, mx - ctx.measureText(label).width / 2, my - 17);
      }
    }
    ctx.globalAlpha = 1;
  }

  function step(now, elapsed) {
    acc += (elapsed / 1000) * RATE;
    // when nobody is moving, the line still twitches now and then, sometimes enough to trip the threshold
    if (now - lastPointer > 2500 && now > nextBlip) {
      energy = Math.max(energy, Math.random() < 0.4 ? 0.68 + 0.25 * Math.random() : 0.18 + 0.25 * Math.random());
      nextBlip = now + 2600 + Math.random() * 3600;
    }
    while (acc >= 1) {
      push(nextValue(), now);
      acc -= 1;
    }
  }

  function frame(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    if (narrow && last && now - last < NARROW_FRAME - 4) {
      raf = requestAnimationFrame(frame);
      return;
    }
    var elapsed = Math.min(100, now - (last || now));
    last = now;
    step(now, elapsed);
    draw(now);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (reduceMotion || raf || !sized) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  // movement anywhere on the page feeds the chart: faster movement, taller spike
  function onMove(x, y) {
    var now = performance.now();
    if (pointer.has && visible) {
      var dt = Math.max(8, now - pointer.t);
      var pxPerMs = Math.hypot(x - pointer.x, y - pointer.y) / dt;
      energy = Math.max(energy, Math.min(1, pxPerMs / 2.2));
      lastPointer = now;
    }
    pointer.x = x; pointer.y = y; pointer.t = now; pointer.has = true;
  }

  if (!reduceMotion) {
    window.addEventListener('pointermove', function (e) { onMove(e.clientX, e.clientY); }, { passive: true });
    window.addEventListener('touchmove', function (e) {
      if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
  }

  // the observer reports the canvas size right after layout, so sizing never forces a reflow
  new ResizeObserver(function (entries) {
    var box = entries[0].contentRect;
    var first = !sized;
    layout(box.width, box.height);
    sized = true;
    if (first) prefill(performance.now());
    draw(performance.now());
    if (first && visible) start();
  }).observe(canvas);

  new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
    if (visible) start();
  }, { threshold: 0.02 }).observe(canvas);

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && visible) start();
  });
})();
