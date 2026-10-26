// Copy-to-clipboard and the writing page finder.
(function () {
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    var label = btn.querySelector('[data-copy-label]') || btn;
    btn.addEventListener('click', function () {
      var text = btn.dataset.copy;
      var reset = function () { setTimeout(function () { label.textContent = 'Copy'; }, 1800); };
      var fallback = function () {
        var target = document.getElementById(btn.dataset.copyTarget || '');
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
    });
  });

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
    var published = rows.filter(function (row) { return !row.hidden && row.querySelector('.state.is-radiant'); }).length;
    count.textContent = filtered
      ? (shown === 1 ? '1 entry matches' : shown + ' entries match') + ' (' + published + ' published)'
      : (shown - published) + ' planned, ' + published + ' published';
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
})();
