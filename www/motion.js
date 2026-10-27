/* Golifiar · movimiento: entradas al hacer scroll, contadores y cabecera.
   Todo es opcional: sin JavaScript, o con "reducir movimiento", la página se ve completa y quieta. */
(function () {
  'use strict';
  var quieto = false;
  try { quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* sin matchMedia */ }
  var soportaObs = 'IntersectionObserver' in window;
  var loc = function () { return (window.I18n && window.I18n.locale) || 'es-ES'; };
  var fmt = function (n) { return Number(n).toLocaleString(loc()); };
  var fmtDec = function (n, dec) { return Number(n).toLocaleString(loc(), { minimumFractionDigits: dec, maximumFractionDigits: dec }); };

  function contar(el) {
    var meta = Number(el.getAttribute('data-count'));
    if (!isFinite(meta)) return;
    var sufijo = el.getAttribute('data-suffix') || '';
    var dec = Number(el.getAttribute('data-dec') || 0);
    var final = (dec ? fmtDec(meta, dec) : fmt(meta)) + sufijo;
    if (quieto) { el.textContent = final; return; }
    var t0 = null, dur = 1100;
    function paso(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3), v = meta * e;
      el.textContent = (dec ? fmtDec(v, dec) : fmt(Math.round(v))) + sufijo;
      if (p < 1) requestAnimationFrame(paso); else el.textContent = final;
    }
    requestAnimationFrame(paso);
  }

  // Al cambiar de idioma los contadores ya mostrados se reescriben con el formato nuevo.
  if (window.I18n) window.I18n.alAplicar(function () {
    document.querySelectorAll('[data-count]').forEach(function (el) {
      if (!el.closest('.in-go')) return;
      var dec = Number(el.getAttribute('data-dec') || 0), m = Number(el.getAttribute('data-count'));
      el.textContent = (dec ? fmtDec(m, dec) : fmt(m)) + (el.getAttribute('data-suffix') || '');
    });
  });

  var obs = null;
  function entrar(el) {
    el.classList.add('in-go');
    el.querySelectorAll('[data-count]').forEach(contar);
    if (el.hasAttribute('data-count')) contar(el);
  }
  function observar(raiz) {
    var lista = (raiz || document).querySelectorAll('.rv, [data-go]');
    lista.forEach(function (el) {
      if (el.__visto) return;
      el.__visto = true;
      if (!soportaObs || quieto) { entrar(el); return; }
      obs.observe(el);
    });
  }

  function iniciar() {
    document.documentElement.classList.add('js-motion');
    if (soportaObs && !quieto) {
      obs = new IntersectionObserver(function (items) {
        items.forEach(function (it) {
          if (it.isIntersecting) { entrar(it.target); obs.unobserve(it.target); }
        });
      }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
    }
    observar(document);

    // cabecera compacta al bajar
    var cab = document.querySelector('.header-minimal');
    if (cab) {
      var pend = false;
      var al = function () {
        if (pend) return; pend = true;
        requestAnimationFrame(function () { pend = false; cab.classList.toggle('scrolled', window.scrollY > 12); });
      };
      window.addEventListener('scroll', al, { passive: true });
      al();
    }

    // los números de los resultados cuentan hacia arriba cuando aparecen (solo enteros sencillos)
    var visor = soportaObs && !quieto ? new IntersectionObserver(function (items) {
      items.forEach(function (it) {
        if (!it.isIntersecting) return;
        visor.unobserve(it.target);
        var el = it.target, txt = el.textContent.trim();
        if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(txt)) return;
        var n = Number(txt.replace(/\./g, ''));
        if (fmt(n) !== txt && String(n) !== txt) return;
        el.setAttribute('data-count', String(n));
        var igual = String(n) === txt && fmt(n) !== txt;
        if (igual) { el.textContent = '0'; var m = n; var t0 = null; var paso = function (t) { if (t0 === null) t0 = t; var p = Math.min(1, (t - t0) / 900); el.textContent = String(Math.round(m * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(paso); else el.textContent = txt; }; requestAnimationFrame(paso); }
        else { el.textContent = '0'; contar(el); }
      });
    }, { threshold: 0.6 }) : null;
    function escanear() {
      if (!visor) return;
      document.querySelectorAll('.metric-number:not([data-vis])').forEach(function (m) { m.setAttribute('data-vis', '1'); visor.observe(m); });
    }
    var pend2 = null;
    new MutationObserver(function () { clearTimeout(pend2); pend2 = setTimeout(escanear, 80); })
      .observe(document.body, { childList: true, subtree: true });
    escanear();
  }

  window.Motion = { observar: observar };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
