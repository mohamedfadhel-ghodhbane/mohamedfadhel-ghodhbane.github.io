// Copy-to-clipboard, code block copy buttons, article reading aids, and the articles page finder.
(function () {
  // copies the text; where the clipboard is blocked, selects the target so the visitor can copy it by hand
  function copyText(text, label, target) {
    var reset = function () { setTimeout(function () { label.textContent = 'Copy'; }, 1800); };
    var fallback = function () {
      if (target) {
        var range = document.createRange();
        range.selectNodeContents(target);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      label.textContent = 'Selected';
      reset();
    };
    try {
      navigator.clipboard.writeText(text).then(function () { label.textContent = 'Copied'; reset(); }, fallback);
    } catch (e) {
      fallback();
    }
  }

  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    var label = btn.querySelector('[data-copy-label]') || btn;
    btn.addEventListener('click', function () {
      copyText(btn.dataset.copy, label, document.getElementById(btn.dataset.copyTarget || ''));
    });
  });

  // each code block in an article gets a bar with its language and a copy button
  var LANGS = { kql: 'KQL', html: 'HTML', json: 'JSON', yaml: 'YAML', bash: 'Bash', powershell: 'PowerShell', python: 'Python' };
  document.querySelectorAll('.prose pre').forEach(function (pre) {
    var code = pre.querySelector('code') || pre;
    var key = (pre.dataset.language || '').toLowerCase();
    var block = document.createElement('div');
    var bar = document.createElement('div');
    var lang = document.createElement('span');
    var btn = document.createElement('button');
    var label = document.createElement('span');
    var hint = document.createElement('span');
    block.className = 'code-block';
    bar.className = 'code-bar';
    lang.className = 'code-lang';
    // plain text blocks (diagrams, output) get no language label
    lang.textContent = LANGS[key] || (key && key !== 'plaintext' && key !== 'text' ? key.toUpperCase() : '');
    lang.hidden = !lang.textContent;
    btn.type = 'button';
    btn.className = 'code-copy';
    label.textContent = 'Copy';
    label.setAttribute('aria-live', 'polite');
    hint.className = 'sr-only';
    hint.textContent = lang.textContent ? ' ' + lang.textContent + ' code' : ' code';
    btn.append(label, hint);
    bar.append(lang, btn);
    pre.parentNode.insertBefore(block, pre);
    block.append(bar, pre);
    btn.addEventListener('click', function () {
      copyText(code.textContent.replace(/\n+$/, ''), label, code);
    });
  });

  // article table of contents: mark the section currently being read
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('[data-toc] a'));
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var sections = tocLinks.map(function (a) { return document.getElementById(decodeURIComponent(a.hash.slice(1))); });
    var setCurrent = function (id) {
      tocLinks.forEach(function (a) { a.setAttribute('aria-current', String(a.hash.slice(1) === id)); });
    };
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { e.target.dataset.seen = e.isIntersecting || e.boundingClientRect.top < 0 ? '1' : ''; });
      var current = null;
      sections.forEach(function (s) { if (s && s.dataset.seen) current = s; });
      setCurrent(current ? current.id : '');
    }, { rootMargin: '-80px 0px -65% 0px' });
    sections.forEach(function (s) { if (s) observer.observe(s); });
  }

  // reading progress along the top edge of article pages
  var bar = document.querySelector('[data-progress]');
  var prose = document.querySelector('[data-prose]');
  if (bar && prose) {
    var start = 0, end = 1, ticking = false;
    var measure = function () {
      var r = prose.getBoundingClientRect();
      start = r.top + window.scrollY - window.innerHeight * 0.2;
      end = r.bottom + window.scrollY - window.innerHeight * 0.8;
    };
    var paint = function () {
      ticking = false;
      var p = Math.max(0, Math.min(1, (window.scrollY - start) / Math.max(1, end - start)));
      bar.style.transform = 'scaleX(' + p + ')';
    };
    new ResizeObserver(function () { measure(); paint(); }).observe(document.body);
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(paint); }
    }, { passive: true });
  }

  var list = document.querySelector('[data-posts]');
  if (!list) return;
  var rows = Array.prototype.slice.call(list.querySelectorAll('.post'));
  rows.forEach(function (row) {
    row.querySelectorAll('[data-hl]').forEach(function (el) { el.dataset.text = el.textContent; });
  });
  var search = document.getElementById('post-search');
  var count = document.querySelector('[data-count]');
  var empty = document.querySelector('[data-empty]');
  var filters = document.querySelectorAll('[data-filter]');
  var topics = document.querySelectorAll('[data-topic]');
  var type = 'all';
  var ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(s) {
    return s.replace(/[&<>"']/g, function (c) { return ENTITIES[c]; });
  }

  // wraps every match in <mark>, the light on what the search found
  function highlight(el, q) {
    var text = el.dataset.text;
    var lower = text.toLowerCase();
    var idx = q ? lower.indexOf(q) : -1;
    if (idx === -1) { el.textContent = text; return false; }
    var out = '', pos = 0;
    while (idx !== -1) {
      out += esc(text.slice(pos, idx)) + '<mark>' + esc(text.slice(idx, idx + q.length)) + '</mark>';
      pos = idx + q.length;
      idx = lower.indexOf(q, pos);
    }
    el.innerHTML = out + esc(text.slice(pos));
    return true;
  }

  function apply() {
    var q = search.value.trim().toLowerCase();
    var shown = 0;
    rows.forEach(function (row) {
      var hit = false;
      row.querySelectorAll('[data-hl]').forEach(function (el) { if (highlight(el, q)) hit = true; });
      var visible = (type === 'all' || row.dataset.type === type) && (!q || hit);
      row.hidden = !visible;
      if (visible) shown++;
    });
    var filtered = q || type !== 'all';
    count.textContent = filtered
      ? (shown === 1 ? '1 entry matches' : shown + ' entries match')
      : (shown === 1 ? '1 entry' : shown + ' entries');
    empty.hidden = shown !== 0;
    topics.forEach(function (btn) { btn.setAttribute('aria-pressed', String(q !== '' && btn.dataset.topic === q)); });
  }

  search.addEventListener('input', apply);
  filters.forEach(function (btn) {
    btn.addEventListener('click', function () {
      type = btn.dataset.filter;
      filters.forEach(function (other) { other.setAttribute('aria-pressed', String(other === btn)); });
      apply();
    });
  });
  topics.forEach(function (btn) {
    btn.addEventListener('click', function () {
      search.value = btn.getAttribute('aria-pressed') === 'true' ? '' : btn.dataset.topic;
      apply();
    });
  });

  // tags elsewhere on the site link here as ?topic=kql
  var initial = new URLSearchParams(location.search).get('topic');
  if (initial) { search.value = initial; apply(); }
})();
