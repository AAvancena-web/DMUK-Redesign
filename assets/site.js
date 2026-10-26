(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- mobile drawer ---------- */
  var burger = document.getElementById('burger');
  var drawer = document.getElementById('drawer');
  function setDrawer(open) {
    drawer.classList.toggle('open', open);
    burger.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  }
  // the landing page has no drawer, so only wire it up when it exists
  if (burger && drawer) {
  burger.addEventListener('click', function () { setDrawer(!drawer.classList.contains('open')); });
  drawer.addEventListener('click', function (e) {
    // the caret only expands the submenu; it must not close the drawer
    if (e.target.closest('.dl-caret')) return;
    if (e.target === drawer || e.target.closest('a')) setDrawer(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer.classList.contains('open')) setDrawer(false);
  });
  }

  /* ---------- services dropdown ---------- */
  (function () {
    var item = document.querySelector('.nav-item[data-sub]');
    if (!item) return;
    var caret = item.querySelector('.nav-caret');
    var shutTimer = null;
    // hover opens it loosely; the caret pins it, so a click while hovering does
    // not read as "close" the way a plain toggle would
    var pinned = false;

    function set(open) {
      clearTimeout(shutTimer);
      item.classList.toggle('open', open);
      if (caret) caret.setAttribute('aria-expanded', String(open));
    }
    function unpin() { pinned = false; set(false); }
    // hover is a convenience on pointer devices; the caret is the real control
    function hoverable() {
      return window.matchMedia('(min-width: 1080px) and (hover: hover)').matches;
    }
    item.addEventListener('mouseenter', function () { if (hoverable()) set(true); });
    item.addEventListener('mouseleave', function () {
      if (!hoverable() || pinned) return;
      // a short grace period, so crossing the gap to the panel does not shut it
      shutTimer = setTimeout(function () { set(false); }, 140);
    });
    if (caret) {
      caret.addEventListener('click', function (e) {
        e.preventDefault();
        pinned = !pinned;
        set(pinned);
      });
    }
    // keyboard: the panel closes once focus leaves the whole group
    item.addEventListener('focusout', function (e) {
      if (!pinned && !item.contains(e.relatedTarget)) set(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && item.classList.contains('open')) {
        unpin();
        if (caret) caret.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (!item.contains(e.target)) unpin();
    });
  })();

  /* ---------- drawer submenu ---------- */
  (function () {
    var row = document.querySelector('.dl-row[data-drawer-sub]');
    if (!row) return;
    var caret = row.querySelector('.dl-caret');
    if (!caret) return;
    caret.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var open = !row.classList.contains('open');
      row.classList.toggle('open', open);
      caret.setAttribute('aria-expanded', String(open));
    });
  })();

  /* ---------- header solidifies once past the banner ---------- */
  var header = document.getElementById('siteHeader');
  var hero = document.getElementById('home');
  var solidAt = 8;
  function measure() {
    solidAt = hero ? Math.max(hero.offsetHeight - header.offsetHeight - 40, 8) : 8;
  }
  function onScroll() {
    header.classList.toggle('stuck', (window.scrollY || window.pageYOffset) > solidAt);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { measure(); onScroll(); }, { passive: true });
  window.addEventListener('load', function () { measure(); onScroll(); });
  measure(); onScroll();

  /* ---------- reveal ---------- */
  var revealables = document.querySelectorAll('.rv');
  if (reduce || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry, i) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        setTimeout(function () { el.classList.add('in'); }, Math.min(i, 4) * 90);
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    revealables.forEach(function (el) { io.observe(el); });
  }

  /* ---------- headings light up letter by letter as they scroll through ---------- */
  (function () {
    var SCRIM = '27,11,17';
    // each heading declares what it fades from and to, so a section on a light
    // ground runs pale-to-dark instead of dark-to-white
    function pair(el, prop, fallback) {
      var v = getComputedStyle(el).getPropertyValue(prop).trim();
      var n = v ? v.split(',').map(function (x) { return parseInt(x, 10); }) : [];
      return n.length === 3 && n.every(function (x) { return x >= 0 && x <= 255; }) ? n : fallback;
    }
    // how many letters are mid-fade at once — higher is a softer, wider sweep
    var SPREAD = 5.5;

    function wire(head) {
      if (!head) return;
      var words = [].slice.call(head.querySelectorAll('.w'));
      if (!words.length) return;
      var DIM = pair(head, '--fill-dim', [58, 52, 56]);
      var LIT = pair(head, '--fill-lit', [255, 255, 255]);

      // split each word into letters, keeping the word itself unbreakable
      var letters = [];
      words.forEach(function (w) {
        var text = w.textContent, frag = document.createDocumentFragment();
        for (var k = 0; k < text.length; k++) {
          var c = document.createElement('span');
          c.className = 'c';
          c.textContent = text.charAt(k);
          frag.appendChild(c);
          letters.push(c);
        }
        w.textContent = '';
        w.appendChild(frag);
      });
      head.classList.add('is-split');

      // three ways a letter can be painted: a plain colour, a scrim over a
      // gradient fill, or the stroke of an outlined letter
      var kind = letters.map(function (c) {
        if (!c.closest) { return 'colour'; }
        if (c.closest('.accent')) { return 'scrim'; }
        if (c.closest('.outline')) { return 'stroke'; }
        return 'colour';
      });

      if (reduce) {
        var full = 'rgb(' + LIT.join(',') + ')';
        letters.forEach(function (c, i) {
          if (kind[i] === 'scrim') { c.style.backgroundImage = 'none'; }
          else if (kind[i] === 'stroke') { c.style.webkitTextStrokeColor = full; }
          else { c.style.color = full; }
        });
        return;
      }

      var ticking = false;

      function paint() {
        ticking = false;
        var r = head.getBoundingClientRect();
        var de = document.documentElement;
        var vh = window.innerHeight || de.clientHeight;
        // 0 while it is still low in the viewport, 1 once it has risen past the middle
        var start = vh * 0.95, end = vh * 0.16;
        var p = (start - r.top) / (start - end);
        p = Math.max(0, Math.min(1, p));
        // a heading close to the foot of the page never rises that far, so finish
        // the run once there is nothing left to scroll
        var maxY = de.scrollHeight - vh;
        if (maxY > 0 && window.pageYOffset >= maxY - 2) p = 1;

        var n = letters.length, span = n - 1 + SPREAD;
        for (var i = 0; i < n; i++) {
          // each letter fades over its own slice, overlapping its neighbours
          var lp = (p * span - i) / SPREAD;
          lp = Math.max(0, Math.min(1, lp));
          if (kind[i] === 'scrim') {
            var a = (0.86 * (1 - lp)).toFixed(3);
            var c = 'rgba(' + SCRIM + ',' + a + ')';
            letters[i].style.backgroundImage = 'linear-gradient(' + c + ',' + c + ')';
          } else {
            var mix = 'rgb(' +
              Math.round(DIM[0] + (LIT[0] - DIM[0]) * lp) + ',' +
              Math.round(DIM[1] + (LIT[1] - DIM[1]) * lp) + ',' +
              Math.round(DIM[2] + (LIT[2] - DIM[2]) * lp) + ')';
            if (kind[i] === 'stroke') { letters[i].style.webkitTextStrokeColor = mix; }
            else { letters[i].style.color = mix; }
          }
        }
      }
      function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(paint);
      }
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
      paint();
    }

    // every heading that opts in carries .lit, so new pages need no change here
    [].slice.call(document.querySelectorAll('.lit')).forEach(wire);
  })();

  /* ---------- the difference rail draws itself as you scroll past ---------- */
  (function () {
    var rail = document.getElementById('procRail');
    var spine = document.getElementById('procSpine');
    var orb = document.getElementById('procOrb');
    var dust = document.getElementById('procDust');
    if (!rail || !spine) return;
    var items = [].slice.call(rail.querySelectorAll('.proc-step'));

    // a scatter of faint specks behind the rail
    if (dust && !reduce) {
      var html = '';
      for (var d = 0; d < 34; d++) {
        html += '<span style="left:' + (Math.random() * 100).toFixed(2) + '%;top:' +
                (Math.random() * 100).toFixed(2) + '%;opacity:' + (0.16 + Math.random() * 0.5).toFixed(2) + '"></span>';
      }
      dust.innerHTML = html;
    }

    if (reduce) {
      items.forEach(function (it) { it.classList.add('passed'); });
      return;
    }

    var ticking = false;

    function paint() {
      ticking = false;
      var r = rail.getBoundingClientRect();
      var de = document.documentElement;
      var vh = window.innerHeight || de.clientHeight;
      // the head of the line sits a little above the middle of the screen
      var head = vh * 0.58;
      var p = (head - r.top) / r.height;
      p = Math.max(0, Math.min(1, p));
      // with little page left below the rail it never rises that far, so finish
      // the draw once there is nothing more to scroll
      var maxY = de.scrollHeight - vh;
      if (maxY > 0 && window.pageYOffset >= maxY - 2) p = 1;

      spine.style.setProperty('--fill', p.toFixed(4));
      rail.classList.toggle('lit', p > 0.002 && p < 0.999);
      if (orb) { orb.style.top = (p * r.height).toFixed(1) + 'px'; }

      var headY = r.top + p * r.height;
      items.forEach(function (it) {
        var n = it.querySelector('.proc-node').getBoundingClientRect();
        it.classList.toggle('passed', headY >= n.top + n.height / 2 - 1);
      });
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(paint);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    paint();
  })();

  /* ---------- the stat cards start as a held hand and are dealt out ---------- */
  (function () {
    var fan = document.getElementById('resFan');
    if (!fan) return;
    var cards = [].slice.call(fan.querySelectorAll('.res-card'));
    if (!cards.length) return;

    var n = cards.length, mid = (n - 1) / 2;
    // where each card settles once it has been dealt
    var REST_ROT = [-8, -4, 0, 4, 8];
    var REST_Y = [30, 10, -16, 10, 30];
    var spread = false, ticking = false;

    function canDeal() {
      return !reduce && window.matchMedia('(min-width: 901px)').matches;
    }

    function clear() {
      cards.forEach(function (c) {
        c.style.removeProperty('--x');
        c.style.removeProperty('--y');
        c.style.removeProperty('--r');
        c.style.removeProperty('--s');
      });
    }

    function paint() {
      ticking = false;
      if (!spread) return;

      var r = fan.getBoundingClientRect();
      var de = document.documentElement;
      var vh = window.innerHeight || de.clientHeight;
      // closed while the fan is still low on the screen, fully dealt by the time
      // it has risen past the middle
      var start = vh * 0.98, end = vh * 0.42;
      var p = (start - r.top) / (start - end);
      p = Math.max(0, Math.min(1, p));
      var maxY = de.scrollHeight - vh;
      if (maxY > 0 && window.pageYOffset >= maxY - 2) p = 1;

      // ease out, so the cards fly apart quickly then settle
      var e = 1 - Math.pow(1 - p, 3);
      var step = cards[0].offsetWidth + parseFloat(getComputedStyle(fan).columnGap || 0);

      for (var i = 0; i < n; i++) {
        var d = i - mid;
        // closed: every card pulled back to the middle, overlapping like a hand
        var x = (1 - e) * (-d * step * 0.80);
        // closed: fanned hard from one corner; dealt: the gentle resting arc
        var rot = REST_ROT[i] * e + (d * 7.5 + 4) * (1 - e);
        var y = REST_Y[i] * e + (Math.abs(d) * 5 + 18) * (1 - e);
        var sc = 0.9 + 0.1 * e;
        cards[i].style.setProperty('--x', x.toFixed(1) + 'px');
        cards[i].style.setProperty('--y', y.toFixed(1) + 'px');
        cards[i].style.setProperty('--r', rot.toFixed(2) + 'deg');
        cards[i].style.setProperty('--s', sc.toFixed(3));
      }
    }

    function measure() {
      spread = canDeal();
      if (!spread) { clear(); return; }
      paint();
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(paint);
    }

    // held cards overlap, so the one nearest the viewer is the one on the right
    cards.forEach(function (c, i) { c.style.zIndex = i + 1; });

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    window.addEventListener('load', measure);
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(measure); }
    measure();
  })();

  /* ---------- what we do: the card row rides left as you scroll down ---------- */
  (function () {
    var rail = document.getElementById('wwdRail');
    var stick = document.getElementById('wwdStick');
    var track = document.getElementById('wwdTrack');
    if (!rail || !stick || !track) return;

    var shift = 0, ticking = false, pinned = false;

    // the row only takes over the scroll when there is room to pin it
    function canPin() {
      return !reduce && window.matchMedia('(min-width: 900px)').matches;
    }

    function measure() {
      pinned = canPin();
      stick.classList.toggle('is-swipe', !pinned);
      track.classList.toggle('is-swipe', !pinned);

      if (!pinned) {
        rail.style.height = '';
        track.style.transform = '';
        shift = 0;
        return;
      }
      // how far the row has to travel for its last card to sit flush on the right
      track.style.transform = 'none';
      shift = Math.max(0, track.scrollWidth - stick.clientWidth);
      // one pixel of vertical scroll per pixel of travel, so the pace feels natural
      rail.style.height = (stick.offsetHeight + shift) + 'px';
      paint();
    }

    function paint() {
      ticking = false;
      if (!pinned || shift <= 0) return;
      var r = rail.getBoundingClientRect();
      var travel = rail.offsetHeight - stick.offsetHeight;
      var p = travel > 0 ? (-r.top + parseFloat(getComputedStyle(stick).top || 0)) / travel : 0;
      p = Math.max(0, Math.min(1, p));
      track.style.transform = 'translate3d(' + (-p * shift).toFixed(1) + 'px,0,0)';
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(paint);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    window.addEventListener('load', measure);
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(measure); }
    measure();
  })();

  /* ---------- reviews: one quote at a time ---------- */
  (function () {
    var stage = document.getElementById('rvStage');
    if (!stage) return;
    var slides = [].slice.call(stage.querySelectorAll('.rv-quote'));
    var dots = [].slice.call(document.querySelectorAll('.rv-dot'));
    if (slides.length < 2) return;

    var i = 0, timer = null, HOLD = 7000;

    function show(n) {
      i = (n + slides.length) % slides.length;
      slides.forEach(function (s, k) {
        s.classList.toggle('is-on', k === i);
        if (k === i) { s.removeAttribute('hidden'); } else { s.setAttribute('hidden', ''); }
      });
      dots.forEach(function (d, k) {
        d.classList.toggle('is-on', k === i);
        d.setAttribute('aria-selected', k === i ? 'true' : 'false');
      });
      fit();
    }
    function fit() {
      stage.style.height = slides[i].offsetHeight + 'px';
    }
    function start() { if (!reduce) { stop(); timer = setInterval(function () { show(i + 1); }, HOLD); } }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }

    dots.forEach(function (d) {
      d.addEventListener('click', function () { show(+d.dataset.i); start(); });
    });
    stage.addEventListener('mouseenter', stop);
    stage.addEventListener('mouseleave', start);
    stage.addEventListener('focusin', stop);
    stage.addEventListener('focusout', start);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { stop(); } else { start(); }
    });

    show(0);
    start();
    window.addEventListener('resize', fit);
    window.addEventListener('load', fit);
    // the stage is sized from rendered text, so re-measure once webfonts land
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(fit); }
  })();

  var yr = document.getElementById('yr');
  if (yr) { yr.textContent = new Date().getFullYear(); }

  /* ---------- form validation (demo only — wire to your handler) ---------- */
  var phoneOk = /^(\+?61|0)[\s-]?[2-478](?:[\s-]?\d){8}$/;
  var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  document.querySelectorAll('.quote-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var valid = true;
      form.querySelectorAll('[required]').forEach(function (input) {
        var field = input.closest('.field');
        var v = (input.value || '').trim();
        var ok = v.length > 0;
        if (ok && input.type === 'tel') ok = phoneOk.test(v.replace(/\s+/g, ' '));
        if (ok && input.type === 'email') ok = emailOk.test(v);
        field.classList.toggle('err', !ok);
        if (!ok && valid) input.focus();
        if (!ok) valid = false;
      });
      if (!valid) return;

      var btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      setTimeout(function () { form.classList.add('is-sent'); }, 500);
    });

    form.querySelectorAll('input, select').forEach(function (input) {
      ['input', 'change'].forEach(function (ev) {
        input.addEventListener(ev, function () {
          var f = input.closest('.field');
          if (f) f.classList.remove('err');
        });
      });
    });
  });
})();
