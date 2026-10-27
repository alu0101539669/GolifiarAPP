/* Golifiar · idiomas (español e inglés).
   El texto original está en español y sirve de clave: t('Hola {n}', { n: 3 }).
   En inglés se busca la traducción en los diccionarios de lang-en-*.js; si falta, se muestra el español.
   Para HTML estático, el traductor recorre el DOM y cambia los textos y atributos (placeholder, title, aria-label, alt).
   Los bloques con etiquetas dentro (<strong>, <a>…) llevan data-i18n-html y se traducen enteros. */
(function (global) {
  'use strict';

  var IDIOMAS = [{ id: 'es', nombre: 'Español', corto: 'ES', local: 'es-ES' }, { id: 'en', nombre: 'English', corto: 'EN', local: 'en-GB' }];
  var CLAVE = 'golifiar-idioma';
  var dic = { en: {} };
  var faltan = new Set();
  var actual = 'es';
  var oyentes = [];

  function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }
  function buscar(id) { for (var i = 0; i < IDIOMAS.length; i++) if (IDIOMAS[i].id === id) return IDIOMAS[i]; return IDIOMAS[0]; }

  function t(clave, params) {
    var s = clave;
    if (actual !== 'es') {
      var d = dic[actual] || {};
      if (Object.prototype.hasOwnProperty.call(d, clave)) s = d[clave];
      else if (clave && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(clave)) faltan.add(clave);
    }
    if (params) s = s.replace(/\{(\w+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(params, k) ? params[k] : m; });
    return s;
  }

  function registrar(id, obj) {
    dic[id] = dic[id] || {};
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) dic[id][k] = obj[k];
  }

  /* ---------- recorrido del DOM ---------- */
  var ATRIBUTOS = ['placeholder', 'aria-label', 'title', 'alt'];
  var OMITIR = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, CODE: 1 };

  function omitido(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (OMITIR[e.nodeName]) return true;
      if (e.getAttribute && (e.getAttribute('translate') === 'no' || e.hasAttribute('data-i18n-no'))) return true;
    }
    return false;
  }

  function texto(nodo) {
    if (nodo.__es === undefined) nodo.__es = nodo.nodeValue;
    var orig = nodo.__es, k = norm(orig);
    if (!k) return;
    if (actual === 'es') { if (nodo.nodeValue !== orig) nodo.nodeValue = orig; return; }
    var d = dic[actual] || {};
    if (Object.prototype.hasOwnProperty.call(d, k)) {
      var ini = /^\s*/.exec(orig)[0], fin = /\s*$/.exec(orig)[0];
      nodo.nodeValue = ini + d[k] + fin;
    } else if (/[A-Za-zÁÉÍÓÚÑáéíóúñ]{2,}/.test(k)) faltan.add(k);
  }

  function atributos(el) {
    for (var i = 0; i < ATRIBUTOS.length; i++) {
      var a = ATRIBUTOS[i];
      if (!el.hasAttribute(a)) continue;
      el.__esA = el.__esA || {};
      if (el.__esA[a] === undefined) el.__esA[a] = el.getAttribute(a);
      var orig = el.__esA[a];
      if (actual === 'es') { el.setAttribute(a, orig); continue; }
      var d = dic[actual] || {}, k = norm(orig);
      if (Object.prototype.hasOwnProperty.call(d, k)) el.setAttribute(a, d[k]);
      else if (k) faltan.add(k);
    }
  }

  function bloqueHtml(el) {
    if (el.__esH === undefined) el.__esH = el.innerHTML;
    if (actual === 'es') { if (el.innerHTML !== el.__esH) el.innerHTML = el.__esH; return; }
    var d = dic[actual] || {}, k = norm(el.__esH);
    if (Object.prototype.hasOwnProperty.call(d, k)) el.innerHTML = d[k]; else faltan.add(k);
  }

  function aplicar(raiz) {
    raiz = raiz || document.body;
    if (!raiz) return;
    // 1) bloques con etiquetas dentro
    var bloques = raiz.querySelectorAll ? raiz.querySelectorAll('[data-i18n-html]') : [];
    for (var i = 0; i < bloques.length; i++) bloqueHtml(bloques[i]);
    // 2) texto y atributos
    var rec = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (n) {
        if (n.nodeType === 1) {
          if (omitido(n)) return NodeFilter.FILTER_REJECT;
          if (n.hasAttribute('data-i18n-html')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_SKIP;
        }
        return omitido(n.parentNode) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    var n, vistos = [];
    while ((n = rec.nextNode())) vistos.push(n);
    for (var j = 0; j < vistos.length; j++) texto(vistos[j]);
    var els = raiz.querySelectorAll ? raiz.querySelectorAll('[placeholder],[aria-label],[title],[alt]') : [];
    for (var m = 0; m < els.length; m++) if (!omitido(els[m])) atributos(els[m]);
    if (raiz.nodeType === 1 && !omitido(raiz)) atributos(raiz);
  }

  /* ---------- idioma activo ---------- */
  function detectar() {
    var guardado = null;
    try { guardado = localStorage.getItem(CLAVE); } catch (e) { /* sin almacenamiento */ }
    if (guardado === 'es' || guardado === 'en') return guardado;
    var langs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || 'es'];
    for (var i = 0; i < langs.length; i++) {
      var c = String(langs[i]).toLowerCase().slice(0, 2);
      if (c === 'es') return 'es';
      if (c === 'en') return 'en';
    }
    return 'en';
  }

  function pintarSelector() {
    var cont = document.getElementById('langSwitch');
    if (!cont) return;
    cont.querySelectorAll('button[data-lang]').forEach(function (b) {
      var on = b.getAttribute('data-lang') === actual;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('on', on);
    });
  }

  function fijar(id, guardar) {
    actual = buscar(id).id;
    document.documentElement.setAttribute('lang', actual);
    if (guardar) { try { localStorage.setItem(CLAVE, actual); } catch (e) { /* sin almacenamiento */ } }
    document.title = t('Golifiar | Análisis de tu perfil de Instagram');
    var meta = document.querySelector('meta[name="description"]');
    if (meta) {
      if (meta.__es === undefined) meta.__es = meta.getAttribute('content');
      meta.setAttribute('content', actual === 'es' ? meta.__es : t(meta.__es));
    }
    aplicar(document.body);
    pintarSelector();
    oyentes.forEach(function (f) { try { f(actual); } catch (e) { console.error(e); } });
  }

  function alAplicar(f) { oyentes.push(f); }

  function iniciar() {
    var id = detectar();
    actual = id;
    document.documentElement.setAttribute('lang', id);
    if (id !== 'es') fijar(id, false); else pintarSelector();
  }

  function localAct() { return buscar(actual).local; }
  function num(n) { return Number(n || 0).toLocaleString(localAct()); }
  function fecha(ts, opciones) { return new Date(ts * 1000).toLocaleDateString(localAct(), opciones); }

  global.I18n = {
    t: t, registrar: registrar, aplicar: aplicar, idiomas: IDIOMAS,
    fijar: function (id) { fijar(id, true); }, alAplicar: alAplicar, iniciar: iniciar,
    get lang() { return actual; }, get locale() { return localAct(); },
    num: num, fecha: fecha, faltan: faltan
  };
  global.t = t;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(window);
