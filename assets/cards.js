/* Card polish: cursor spotlight, gentle tilt on service cards,
   count-up numbers and growing bars when they scroll into view. */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var SEL = '.fx';
  [].forEach.call(document.querySelectorAll(SEL), function (c) {
    var a = document.createElement('i'); a.className = 'fx-spot'; a.setAttribute('aria-hidden', 'true');
    var b = document.createElement('i'); b.className = 'fx-ring'; b.setAttribute('aria-hidden', 'true');
    c.appendChild(a); c.appendChild(b);
  });

  /* spotlight follows the cursor inside each card */
  if (fine) {
    document.addEventListener('pointermove', function (e) {
      var card = e.target.closest && e.target.closest(SEL);
      if (!card) return;
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }

  /* tilt: service cards lean toward the cursor */
  if (fine && !reduce) {
    [].forEach.call(document.querySelectorAll('.tilt'), function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = 'perspective(900px) rotateX(' + (-y * 7).toFixed(2) + 'deg) rotateY(' + (x * 9).toFixed(2) + 'deg) translateY(-6px)';
      });
      card.addEventListener('pointerleave', function () { card.style.transform = ''; });
    });
  }

  /* count-up numbers */
  function fmt(v, dec) { return dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-GB'); }
  function run(el) {
    var end = parseFloat(el.getAttribute('data-count')), dec = +(el.getAttribute('data-dec') || 0);
    var pre = el.getAttribute('data-prefix') || '', suf = el.getAttribute('data-suffix') || '';
    if (reduce) { el.textContent = pre + fmt(end, dec) + suf; return; }
    var t0 = null, dur = 1600;
    function tick(t) {
      if (!t0) t0 = t;
      var p = Math.min((t - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = pre + fmt(end * e, dec) + suf;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  var counters = document.querySelectorAll('[data-count]');
  var groups = document.querySelectorAll('.grow-in');
  if (!('IntersectionObserver' in window)) {
    [].forEach.call(counters, run);
    [].forEach.call(groups, function (g) { g.classList.add('grown'); });
    return;
  }
  [].forEach.call(counters, function (el) {
    var pre = el.getAttribute('data-prefix') || '', suf = el.getAttribute('data-suffix') || '';
    el.textContent = pre + '0' + suf;
  });
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      if (en.target.hasAttribute('data-count')) run(en.target);
      else en.target.classList.add('grown');
    });
  }, { threshold: 0.35 });
  [].forEach.call(counters, function (el) { io.observe(el); });
  [].forEach.call(groups, function (el) { io.observe(el); });
})();
