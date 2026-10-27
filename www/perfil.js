/*
 * Golifiar · Análisis completo del perfil
 * ---------------------------------------
 * Lee los JSON del ZIP de Instagram (likes, comentarios, mensajes, accesos,
 * contenido, cuenta...) y genera los paneles de análisis. Todo ocurre en el
 * navegador: no se envía nada a ningún servidor y NO se guarda el contenido
 * de los mensajes ni de los comentarios, solo contadores y fechas.
 */
(function (global) {
  'use strict';

  /* ============================== utilidades ============================== */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Meta exporta el texto UTF-8 leído como latin-1 ("JosÃ©"): lo arreglamos.
  const fixText = s => {
    if (typeof s !== 'string') return '';
    try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
  };
  const T = t => { t = Number(t) || 0; return t > 1e11 ? Math.floor(t / 1000) : t; }; // a segundos
  // Textos: el español es la clave (ver i18n.js). `tr` evita choques con variables locales llamadas t.
  const tr = (k, p) => global.I18n.t(k, p);
  // `ya(texto)` marca un texto que ya está traducido y compuesto, para que tarjeta/nota/desplegable no lo vuelvan a buscar.
  const ya = x => ({ ya: x });
  const L = x => (x && x.ya !== undefined) ? x.ya : (x ? tr(x) : '');
  const num = x => global.I18n.num(x);
  const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const DIAS_LARGO = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const dia = i => tr(DIAS[i]);
  const diaL = i => tr(DIAS_LARGO[i]);
  const diaIdx = dt => (dt.getDay() + 6) % 7;
  const fmtFecha = ts => ts ? global.I18n.fecha(ts) : '—';
  const diasDesde = ts => Math.floor((Date.now() / 1000 - ts) / 86400);
  const mesKey = ts => { const d = new Date(ts * 1000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const sum = a => a.reduce((x, y) => x + y, 0);
  const maxDe = a => { let m = 0; for (const v of a) if (v > m) m = v; return m; };
  const ig = u => 'https://www.instagram.com/' + encodeURIComponent(u) + '/';

  function lista(json, ...claves) {
    if (Array.isArray(json)) return json;
    if (json && typeof json === 'object') {
      for (const c of claves) if (Array.isArray(json[c])) return json[c];
      const arr = Object.values(json).find(Array.isArray);
      if (arr) return arr;
    }
    return [];
  }

  // Busca recursivamente { label: 'X', value: ... } (formato "label_values" de exportaciones nuevas)
  function buscarLabel(nodo, etiquetas) {
    if (Array.isArray(nodo)) {
      for (const x of nodo) { const r = buscarLabel(x, etiquetas); if (r != null) return r; }
      return null;
    }
    if (nodo && typeof nodo === 'object') {
      if (typeof nodo.label === 'string' && etiquetas.includes(nodo.label.toLowerCase()) && nodo.value != null) return nodo;
      for (const v of Object.values(nodo)) { const r = buscarLabel(v, etiquetas); if (r != null) return r; }
    }
    return null;
  }

  // Devuelve { value, timestamp, href } de un campo, sea cual sea el formato del JSON
  function campo(it, ...nombres) {
    const low = nombres.map(n => n.toLowerCase());
    const m = it && it.string_map_data;
    if (m && typeof m === 'object') {
      for (const k of Object.keys(m)) {
        if (low.includes(k.toLowerCase())) {
          return { value: fixText(String(m[k].value == null ? '' : m[k].value)), timestamp: T(m[k].timestamp), href: m[k].href || '' };
        }
      }
    }
    const n = buscarLabel(it, low);
    if (n) return { value: fixText(String(n.value)), timestamp: T(n.timestamp_value || n.timestamp), href: n.href || '' };
    return null;
  }
  const valor = (it, ...n) => { const c = campo(it, ...n); return c ? c.value : ''; };
  const tiempo = (it) => {
    const c = campo(it, 'time', 'date', 'timestamp');
    return (c && c.timestamp) || T(it && it.timestamp) || T(it && it.string_list_data && it.string_list_data[0] && it.string_list_data[0].timestamp) || 0;
  };

  /* ============================ estado de datos ============================ */
  function nuevo() {
    return {
      archivos: new Set(), htmlOmitidos: 0,
      likes: new Map(), likesN: { p: 0, c: 0, h: 0 }, likesTs: [],
      com: { total: 0, reels: 0, largo: 0, porOwner: new Map(), ts: [] },
      busquedas: new Map(), busqTs: [],
      guardados: new Map(), guardadosTotal: 0, guardTs: [],
      hilos: new Map(), actMsg: new Map(),
      logins: [], logouts: [],
      posts: [], reels: [], stories: [],
      rel: { bloqueados: [], dejados: [], enviadas: [], recibidas: [], cercanos: [], restringidos: [], hashtags: [] },
      cambios: [], perfil: null, anunciantes: []
    };
  }

  /* ============================== lectura ZIP ============================== */
  const REL = {
    'blocked_profiles.json': 'bloqueados',
    'recently_unfollowed_profiles.json': 'dejados',
    'recently_unfollowed_accounts.json': 'dejados',
    'pending_follow_requests.json': 'enviadas',
    "follow_requests_you've_received.json": 'recibidas',
    'follow_requests_youve_received.json': 'recibidas',
    'close_friends.json': 'cercanos',
    'restricted_profiles.json': 'restringidos',
    'following_hashtags.json': 'hashtags'
  };

  // HTML: solo las listas de cuentas se pueden leer igual que en JSON. El resto de análisis exige JSON.
  const HTML_LISTAS = Object.keys(REL).map(k => k.replace(/\.json$/, '.html'));
  const HTML_SOLO_JSON = /(^|\/)(liked_posts|liked_comments|story_likes|post_comments(_\d+)?|reels_comments(_\d+)?|account_searches|saved_posts|login_activity|logout_activity|posts_\d+|reels|stories|personal_information|profile_changes|message_\d+)\.html?$/;
  function tipoHtml(ruta) {
    const p = String(ruta).toLowerCase().replace(/\\/g, '/');
    const base = p.split('/').pop().replace(/\.htm$/, '.html');
    if (HTML_LISTAS.includes(base)) return 'lista';
    return HTML_SOLO_JSON.test(p.replace(/\.htm$/, '.html')) ? 'solojson' : null;
  }
  function procesarHtml(ruta, html, d) {
    const p = String(ruta).toLowerCase().replace(/\\/g, '/');
    const base = p.split('/').pop().replace(/\.html?$/, '.json');
    if (!REL[base] || typeof global.extraerUsuariosHtml !== 'function') return;
    d.archivos.add('cuenta');
    d.rel[REL[base]] = d.rel[REL[base]].concat(global.extraerUsuariosHtml(html));
  }

  function procesarEntrada(ruta, json, d) {
    if (!d || json == null) return;
    const p = String(ruta).toLowerCase().replace(/\\/g, '/');
    const base = p.split('/').pop();
    try {
      if (/(^|\/)messages\//.test(p)) {
        if (/^message_\d+\.json$/.test(base)) mensajes(p, json, d);
        return;
      }
      if (base === 'liked_posts.json') return likes(json, d, 'p', 'likes_media_likes');
      if (base === 'liked_comments.json') return likes(json, d, 'c', 'likes_comment_likes');
      if (base === 'story_likes.json') return likes(json, d, 'h', 'story_activities_story_likes');
      if (/^post_comments(_\d+)?\.json$/.test(base)) return comentarios(json, d, false, 'comments_media_comments');
      if (/^reels_comments(_\d+)?\.json$/.test(base)) return comentarios(json, d, true, 'comments_reels_comments');
      if (base === 'account_searches.json') return busquedas(json, d);
      if (base === 'saved_posts.json') return guardados(json, d);
      if (base === 'login_activity.json') return accesos(json, d.logins, d, 'account_history_login_history');
      if (base === 'logout_activity.json') return accesos(json, d.logouts, d, 'account_history_logout_history');
      if (/^posts_\d+\.json$/.test(base)) return contenido(json, d.posts, d, 'posts');
      if (base === 'reels.json') return contenido(json, d.reels, d, 'ig_reels_media');
      if (base === 'stories.json') return contenido(json, d.stories, d, 'ig_stories');
      if (base === 'personal_information.json') return datosPerfil(json, d);
      if (base === 'profile_changes.json') return cambiosPerfil(json, d);
      if (base === 'advertisers_using_your_activity_or_information.json') return anunciantes(json, d);
      if (REL[base]) return relacion(json, d, REL[base]);
    } catch (e) {
      console.error('Perfil: error en', ruta, e);
    }
  }

  function mensajes(p, j, d) {
    if (!j || !Array.isArray(j.messages)) return;
    d.archivos.add('mensajes');
    const dir = p.slice(0, p.lastIndexOf('/'));
    let h = d.hilos.get(dir);
    if (!h) {
      const m = p.match(/messages\/([^/]+)\//);
      h = {
        id: dir, bandeja: m ? m[1] : '', titulo: fixText(j.title || ''),
        participantes: (j.participants || []).map(x => fixText(x && x.name)),
        total: 0, emisores: new Map(), nombres: [], idx: new Map(), seqT: [], seqS: [], primero: Infinity, ultimo: 0, primerEmisor: '', ultimoEmisor: '', porMes: new Map()
      };
      d.hilos.set(dir, h);
    }
    for (const msg of j.messages) {
      const t = T(msg.timestamp_ms || msg.timestamp);
      if (!t) continue;
      const s = fixText(msg.sender_name || '');
      h.total++;
      h.emisores.set(s, (h.emisores.get(s) || 0) + 1);
      let k = h.idx.get(s);
      if (k === undefined) { k = h.nombres.length; h.nombres.push(s); h.idx.set(s, k); }
      h.seqT.push(t); h.seqS.push(k);
      if (t < h.primero) { h.primero = t; h.primerEmisor = s; }
      if (t > h.ultimo) { h.ultimo = t; h.ultimoEmisor = s; }
      const dt = new Date(t * 1000);
      const mk = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
      h.porMes.set(mk, (h.porMes.get(mk) || 0) + 1);
      let a = d.actMsg.get(s);
      if (!a) { a = { horas: new Array(24).fill(0), heat: new Array(168).fill(0) }; d.actMsg.set(s, a); }
      a.horas[dt.getHours()]++;
      a.heat[diaIdx(dt) * 24 + dt.getHours()]++;
    }
  }

  function likes(json, d, tipo, clave) {
    d.archivos.add('likes');
    lista(json, clave).forEach(it => {
      const sld = (it.string_list_data || [])[0] || {};
      const user = (fixText(it.title || '') || valor(it, 'username', 'owner') || '').toLowerCase().trim() || '(desconocido)';
      const ts = T(sld.timestamp) || tiempo(it);
      if (ts) d.likesTs.push(ts);
      d.likesN[tipo]++;
      let r = d.likes.get(user);
      if (!r) { r = { p: 0, c: 0, h: 0, ultimo: 0 }; d.likes.set(user, r); }
      r[tipo]++;
      if (ts > r.ultimo) r.ultimo = ts;
    });
  }

  function comentarios(json, d, esReel, clave) {
    d.archivos.add('comentarios');
    lista(json, clave).forEach(it => {
      const texto = valor(it, 'comment');
      const dueno = valor(it, 'media owner', 'owner').toLowerCase().trim();
      const ts = tiempo(it);
      d.com.total++;
      if (esReel) d.com.reels++;
      d.com.largo += texto.length;
      if (ts) d.com.ts.push(ts);
      if (dueno) {
        const r = d.com.porOwner.get(dueno) || { n: 0 };
        r.n++;
        d.com.porOwner.set(dueno, r);
      }
    });
  }

  function busquedas(json, d) {
    d.archivos.add('busquedas');
    lista(json, 'searches_user').forEach(it => {
      const q = valor(it, 'search').toLowerCase().trim();
      if (!q) return;
      d.busquedas.set(q, (d.busquedas.get(q) || 0) + 1);
      const ts = tiempo(it);
      if (ts) d.busqTs.push(ts);
    });
  }

  function guardados(json, d) {
    d.archivos.add('guardados');
    lista(json, 'saved_saved_media').forEach(it => {
      const u = fixText(it.title || '').toLowerCase().trim() || valor(it, 'owner').toLowerCase().trim();
      d.guardadosTotal++;
      if (u) d.guardados.set(u, (d.guardados.get(u) || 0) + 1);
      const ts = tiempo(it) || T(campo(it, 'saved on') && campo(it, 'saved on').timestamp);
      if (ts) d.guardTs.push(ts);
    });
  }

  function accesos(json, destino, d, clave) {
    d.archivos.add('accesos');
    lista(json, clave).forEach(it => {
      const ts = tiempo(it);
      if (!ts) return;
      destino.push({ ts, ua: valor(it, 'user agent'), ip: valor(it, 'ip address'), idioma: valor(it, 'language code') });
    });
  }

  function contenido(json, destino, d, clave) {
    d.archivos.add('contenido');
    lista(json, clave).forEach(it => {
      const medias = Array.isArray(it.media) ? it.media : [];
      const ts = T(it.creation_timestamp) || T(it.timestamp) || T(medias[0] && medias[0].creation_timestamp) ||
        (campo(it, 'creation timestamp', 'taken at') || {}).timestamp || 0;
      if (ts) destino.push({ ts, n: Math.max(1, medias.length) });
    });
  }

  function datosPerfil(json, d) {
    const it = lista(json, 'profile_user')[0];
    if (!it) return;
    d.archivos.add('cuenta');
    d.perfil = {
      usuario: valor(it, 'username'), nombre: valor(it, 'name'),
      privada: /^(true|1|yes|s[ií])$/i.test(valor(it, 'private account')),
      bio: valor(it, 'bio', 'biography')
    };
  }

  function cambiosPerfil(json, d) {
    d.archivos.add('cuenta');
    lista(json, 'profile_profile_change').forEach(it => {
      const c = campo(it, 'change date');
      d.cambios.push({
        que: valor(it, 'changed'), antes: valor(it, 'previous value'), despues: valor(it, 'new value'),
        ts: (c && c.timestamp) || tiempo(it)
      });
    });
  }

  function anunciantes(json, d) {
    d.archivos.add('anuncios');
    lista(json, 'ig_custom_audiences_all_types').forEach(it => {
      const n = fixText(it.advertiser_name || '') || valor(it, 'advertiser name');
      if (n) d.anunciantes.push(n);
    });
  }

  function relacion(json, d, clave) {
    d.archivos.add('cuenta');
    const fn = global.extraerUsuarios;
    if (typeof fn !== 'function') return;
    d.rel[clave] = d.rel[clave].concat(fn(json));
  }

  const NOMBRES_SECCION = {
    likes: 'me gusta', comentarios: 'comentarios', mensajes: 'mensajes', accesos: 'accesos',
    contenido: 'publicaciones', cuenta: 'datos de cuenta', busquedas: 'búsquedas', guardados: 'guardados', anuncios: 'anunciantes'
  };
  const secciones = d => d ? [...d.archivos].map(k => NOMBRES_SECCION[k] || k) : []; // nombres canónicos en español (clave); se traducen al pintarlos

  /* ============================ componentes HTML ============================ */
  const tarjeta = (titulo, sub, cuerpo) =>
    `<section class="pf-card"><h3>${esc(L(titulo))}</h3>${sub ? `<p class="pf-sub">${L(sub)}</p>` : ''}${cuerpo}</section>`;

  const metricas = arr => `<div class="metrics-grid">${arr.map(([l, v, cls]) =>
    `<div class="metric-card"><div class="metric-label">${esc(tr(l))}</div><div class="metric-number ${cls || ''}">${esc(v)}</div></div>`).join('')}</div>`;

  const nota = x => `<p class="pf-note">${L(x)}</p>`;

  let HTML_EN_ZIP = false;
  const faltan = (titulo, pista) => tarjeta(titulo, '',
    `<div class="empty-state pf-faltan">${tr(HTML_EN_ZIP ? 'Tu descarga está en formato HTML y este análisis necesita JSON.' : 'Tu ZIP no incluye estos datos.')}<br><small>${tr('Vuelve a pedir la descarga en Instagram marcando «{pista}» y eligiendo formato <strong>JSON</strong>.', { pista: esc(tr(pista)) })}</small><br><button class="pf-link" type="button" onclick="mostrarAyudaDescarga()">${tr('Ver cómo descargarla')}</button></div>`);

  const tabla = (cab, filas) => `<details class="pf-tabla"><summary>${tr('Ver como tabla')}</summary><table><thead><tr>${
    cab.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${
    filas.map(f => `<tr>${f.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></details>`;

  const badge = (t, cls) => `<span class="${cls || 'pf-badge'}">${esc(t)}</span>`;

  // Barras horizontales: filas = [{label, valor, detalle, badge:[texto, clase], href}]
  function barrasH(filas, unidad, tope) {
    if (!filas.length) return '<div class="empty-state">' + tr('Sin datos para mostrar.') + '</div>';
    const max = tope || Math.max(1, ...filas.map(f => f.valor));
    return '<div class="pf-hbars">' + filas.map(f => {
      const w = Math.max(1, Math.round(f.valor / max * 100));
      const lab = f.href ? `<a href="${esc(f.href)}" target="_blank" rel="noopener noreferrer">${esc(f.label)}</a>` : esc(f.label);
      return `<div class="pf-hrow" title="${esc(f.label)}: ${f.texto != null ? esc(f.texto) : num(f.valor) + ' ' + esc(tr(unidad || ''))}">
        <span class="pf-hlabel">${lab}</span>
        <span class="pf-htrack"><span class="pf-hbar" style="width:${w}%"></span></span>
        <span class="pf-hval">${f.texto != null ? esc(f.texto) : num(f.valor)}${f.texto == null && unidad === '%' ? ' %' : ''}</span>
        ${(f.detalle || f.badge) ? `<span class="pf-hdet">${f.badge ? badge(f.badge[0], f.badge[1]) + ' ' : ''}${esc(f.detalle || '')}</span>` : ''}
      </div>`;
    }).join('') + '</div>';
  }

  // Columnas verticales. valores/etiquetas/detalles tienen la misma longitud.
  function columnas(valores, etiquetas, detalles, unidad, titulo) {
    const max = maxDe(valores);
    if (!max) return '<div class="empty-state">' + tr('Sin datos para mostrar.') + '</div>';
    const paso = Math.max(1, Math.ceil(valores.length / 8));
    const iMax = valores.indexOf(max);
    const cols = valores.map((v, i) => {
      const h = v ? Math.max(2, Math.round(v / max * 100)) : 0;
      return `<div class="pf-col" title="${esc(detalles[i])}: ${num(v)} ${esc(tr(unidad))}">
        ${i === iMax ? `<span class="pf-colval" style="bottom:calc(${h}% + 2px)">${num(v)}</span>` : ''}
        <span class="pf-colbar" style="height:${h}%"></span></div>`;
    }).join('');
    const labs = etiquetas.map((e, i) => `<span class="pf-lab">${i % paso === 0 ? esc(e) : ''}</span>`).join('');
    const filas = valores.map((v, i) => [detalles[i], num(v)]).filter(f => f[1] !== '0');
    return `<div role="img" aria-label="${esc(tr(titulo))}"><div class="pf-cols">${cols}</div><div class="pf-labs">${labs}</div></div>` +
      tabla([tr('Periodo'), tr(unidad)], filas);
  }

  function colHoras(horas, unidad, titulo) {
    return columnas(horas, horas.map((_, i) => String(i)), horas.map((_, i) => `${i}:00–${i}:59`), unidad, titulo);
  }
  function colDias(dias, unidad, titulo) {
    return columnas(dias, DIAS.map(x => tr(x)), DIAS_LARGO.map(x => { const z = tr(x); return z[0].toUpperCase() + z.slice(1); }), unidad, titulo);
  }

  function serieDesdeMapa(mapa) {
    const claves = [...mapa.keys()].sort();
    if (!claves.length) return null;
    const [y0, m0] = claves[0].split('-').map(Number);
    const [y1, m1] = claves[claves.length - 1].split('-').map(Number);
    const meses = (y1 - y0) * 12 + (m1 - m0) + 1;
    const et = [], det = [], val = [];
    if (meses <= 36) {
      for (let i = 0; i < meses; i++) {
        const y = y0 + Math.floor((m0 - 1 + i) / 12), m = (m0 - 1 + i) % 12 + 1;
        const k = y + '-' + String(m).padStart(2, '0');
        const f = new Date(y, m - 1, 1);
        et.push(f.toLocaleDateString(global.I18n.locale, { month: 'short', year: '2-digit' }).replace('.', ''));
        det.push(f.toLocaleDateString(global.I18n.locale, { month: 'long', year: 'numeric' }));
        val.push(mapa.get(k) || 0);
      }
    } else {
      for (let y = y0; y <= y1; y++) {
        et.push(String(y)); det.push(String(y));
        let s = 0; mapa.forEach((v, k) => { if (k.startsWith(y + '-')) s += v; });
        val.push(s);
      }
    }
    return { et, det, val, unidadTiempo: meses <= 36 ? 'mes' : 'año' };
  }
  function serieTs(ts) {
    const m = new Map();
    for (const t of ts) { const k = mesKey(t); m.set(k, (m.get(k) || 0) + 1); }
    return serieDesdeMapa(m);
  }
  const colSerie = (s, unidad, titulo) => s ? columnas(s.val, s.et, s.det, unidad, titulo) : '<div class="empty-state">' + tr('Sin datos para mostrar.') + '</div>';

  function histHoras(ts) { const h = new Array(24).fill(0); for (const t of ts) h[new Date(t * 1000).getHours()]++; return h; }
  function histDias(ts) { const h = new Array(7).fill(0); for (const t of ts) h[diaIdx(new Date(t * 1000))]++; return h; }
  function heatDe(ts, heat) { for (const t of ts) { const dt = new Date(t * 1000); heat[diaIdx(dt) * 24 + dt.getHours()]++; } }

  const calor = pct => `color-mix(in srgb, var(--accent-blue) ${Math.round(pct)}%, transparent)`;
  function mapaCalor(heat) {
    const max = maxDe(heat);
    let h = `<div class="pf-heatwrap"><div class="pf-heat" role="img" aria-label="${esc(tr('Mapa de actividad por día de la semana y hora'))}"><span></span>`;
    for (let i = 0; i < 24; i++) h += `<span class="pf-heath">${i % 3 === 0 ? i : ''}</span>`;
    for (let d = 0; d < 7; d++) {
      h += `<span class="pf-heatd">${dia(d)}</span>`;
      for (let i = 0; i < 24; i++) {
        const v = heat[d * 24 + i];
        const st = v ? `style="background:${calor(12 + 88 * v / max)}"` : '';
        h += `<span class="pf-hc" ${st} title="${dia(d)} ${i}:00 · ${num(v)}"></span>`;
      }
    }
    return h + '</div></div><div class="pf-heatkey"><span>' + tr('menos') + '</span>' +
      [12, 45, 75, 100].map(p => `<i style="background:${calor(p)}"></i>`).join('') + '<span>' + tr('más') + '</span></div>';
  }

  function filaUsuario(u, texto, cls) {
    return `<div class="user-card"><a href="${esc(ig(u))}" target="_blank" rel="noopener noreferrer" class="user-link">@${esc(u)}</a>` +
      `<div class="user-actions">${texto ? `<span class="${cls || 'pf-badge'}">${esc(texto)}</span>` : ''}</div></div>`;
  }
  function desplegable(titulo, filas, vacio) {
    return `<details class="pf-det"><summary>${esc(L(titulo))}</summary>${
      filas.length ? `<div class="results-list">${filas.join('')}</div>` : `<div class="empty-state">${esc(tr(vacio || 'Sin registros.'))}</div>`}</details>`;
  }
  const leyenda2 = (a, b) => `<div class="pf-legend"><span><i class="pf-key a"></i>${esc(tr(a))}</span><span><i class="pf-key b"></i>${esc(tr(b))}</span></div>`;

  /* ================================ contexto ================================ */
  function resolverYo(d) {
    const hilos = [...d.hilos.values()];
    if (!hilos.length) return '';
    const cont = new Map();
    hilos.forEach(h => new Set(h.emisores.keys()).forEach(s => cont.set(s, (cont.get(s) || 0) + 1)));
    if (d.perfil && d.perfil.nombre && cont.has(d.perfil.nombre)) return d.perfil.nombre;
    let best = '', n = 0, empate = false;
    cont.forEach((v, k) => { if (v > n) { best = k; n = v; empate = false; } else if (v === n) empate = true; });
    return (hilos.length >= 2 && !empate) ? best : '';
  }

  function contexto(d, seg, sig) {
    const seguidores = new Set((seg || []).map(o => o.username));
    const seguidos = new Set((sig || []).map(o => o.username));
    return {
      seguidores, seguidos, seguidoresObjs: seg || [], seguidosObjs: sig || [],
      hayRel: seguidores.size > 0 || seguidos.size > 0,
      yo: resolverYo(d),
      yoUser: (d.perfil && d.perfil.usuario || '').toLowerCase(),
      res: {}
    };
  }
  const relacionDe = (c, u) => {
    if (!c.hayRel) return null;
    const sigo = c.seguidos.has(u), meSigue = c.seguidores.has(u);
    if (sigo && meSigue) return [tr('Mutuo'), 'badge-mutual'];
    if (sigo) return [tr('No te sigue'), 'badge-status'];
    if (meSigue) return [tr('Te sigue'), 'badge-fan'];
    return [tr('No lo sigues'), 'pf-badge'];
  };

  /* ================================ paneles ================================ */
  function panelInteracciones(d, c) {
    const nLikes = d.likesN.p + d.likesN.c + d.likesN.h;
    if (!(nLikes + d.com.total + d.busquedas.size + d.guardadosTotal)) {
      return faltan('Interacciones', 'Actividad → Me gusta, Comentarios y Guardados');
    }
    const P = new Map();
    const get = u => { let r = P.get(u); if (!r) { r = { u, likes: 0, com: 0, guard: 0, busq: 0 }; P.set(u, r); } return r; };
    d.likes.forEach((r, u) => { if (u !== '(desconocido)' && u !== c.yoUser) get(u).likes += r.p + r.c + r.h; });
    d.com.porOwner.forEach((r, u) => { if (u !== c.yoUser) get(u).com += r.n; });
    d.guardados.forEach((n, u) => { if (u !== c.yoUser) get(u).guard += n; });
    d.busquedas.forEach((n, u) => { if (u !== c.yoUser) get(u).busq += n; });
    c.interactuados = new Set(P.keys()); c.hayInteracciones = true;
    const score = r => r.likes + 2 * r.com + r.guard;
    const ranking = [...P.values()].filter(r => score(r) > 0).sort((a, b) => score(b) - score(a));
    const detalle = r => [r.likes && tr('{n} me gusta', { n: num(r.likes) }), r.com && tr('{n} comentarios', { n: num(r.com) }), r.guard && tr('{n} guardados', { n: num(r.guard) })].filter(Boolean).join(' · ');
    const fila = r => ({ label: '@' + r.u, valor: score(r), detalle: detalle(r), badge: relacionDe(c, r.u), href: ig(r.u) });

    c.res.interacciones = {
      likes: nLikes, comentarios: d.com.total, perfilesDistintos: P.size, guardados: d.guardadosTotal,
      top: ranking.slice(0, 15).map(r => ({ usuario: r.u, puntuacion: score(r) }))
    };

    let html = metricas([
      ['Me gusta dados', num(nLikes)], ['Comentarios', num(d.com.total)],
      ['Perfiles con interacción', num(ranking.length)], ['Guardados', num(d.guardadosTotal)]
    ]);

    html += tarjeta('Con quién interactúas más',
      'Puntuación = me gusta + 2 × comentarios + guardados. La etiqueta indica si esa cuenta te sigue o la sigues.',
      barrasH(ranking.slice(0, 15).map(fila), 'puntos'));

    if (c.hayRel && c.seguidores.size) {
      const sinRetorno = ranking.filter(r => !c.seguidores.has(r.u));
      html += tarjeta(ya(tr('Interactúas con {n} cuentas que no te siguen', { n: num(sinRetorno.length) })),
        'Las que más atención recibes de ti sin seguirte de vuelta.',
        barrasH(sinRetorno.slice(0, 8).map(fila), 'puntos'));
      c.res.interacciones.interactuasSinRetorno = sinRetorno.length;
    }

    if (c.seguidosObjs.length && (nLikes + d.com.total + d.guardadosTotal) > 0) {
      const frios = c.seguidosObjs.filter(o => !P.has(o.username)).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      c.res.interacciones.seguidosSinInteraccion = frios.length;
      html += tarjeta(ya(tr('Sigues a {n} cuentas sin ninguna interacción', { n: num(frios.length) })),
        'Cuentas que sigues y a las que no has dado me gusta, comentado, guardado ni buscado según tu ZIP. Candidatas a revisar.',
        desplegable('Ver lista (las que sigues desde hace más tiempo primero)',
          frios.slice(0, 200).map(o => filaUsuario(o.username, o.timestamp ? tr('desde {f}', { f: fmtFecha(o.timestamp) }) : '', 'pf-badge'))) +
        nota('Si pediste solo un rango de fechas al descargar, puede faltar actividad antigua y la lista salir más larga de lo real.'));
    }

    const ts = d.likesTs.concat(d.com.ts);
    if (ts.length) {
      html += `<div class="pf-two">${
        tarjeta('Interacciones por periodo', 'Me gusta y comentarios en el tiempo.', colSerie(serieTs(ts), 'interacciones', 'Interacciones por periodo'))}${
        tarjeta('A qué hora interactúas', 'Hora local de tu dispositivo.', colHoras(histHoras(ts), 'interacciones', 'Interacciones por hora'))}</div>`;
    }

    if (d.busquedas.size) {
      const top = [...d.busquedas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([u, n]) => ({ label: u, valor: n, badge: relacionDe(c, u) }));
      html += tarjeta('Búsquedas más repetidas', 'Lo que más buscas en Instagram.', barrasH(top, 'búsquedas'));
    }
    if (d.com.total) {
      html += nota(ya(tr('Longitud media de tus comentarios: {n} caracteres · {r} en reels.', { n: Math.round(d.com.largo / d.com.total), r: num(d.com.reels) })));
    }
    return html;
  }

  function panelActividad(d, c) {
    const heat = new Array(168).fill(0);
    [d.likesTs, d.com.ts, d.busqTs, d.guardTs, d.logins.map(x => x.ts),
      d.posts.map(x => x.ts), d.reels.map(x => x.ts), d.stories.map(x => x.ts)].forEach(t => heatDe(t, heat));
    if (c.yo && d.actMsg.has(c.yo)) d.actMsg.get(c.yo).heat.forEach((v, i) => { heat[i] += v; });
    const tieneSeg = c.seguidoresObjs.some(o => o.timestamp) || c.seguidosObjs.some(o => o.timestamp);
    if (!sum(heat) && !tieneSeg) return faltan('Actividad y hábitos', 'Actividad, Información de inicio de sesión');

    let html = '';
    const lg = d.logins;
    if (lg.length) {
      const dispositivos = new Map();
      lg.forEach(x => { const k = dispositivo(x.ua); dispositivos.set(k, (dispositivos.get(k) || 0) + 1); });
      const ips = new Set(lg.map(x => x.ip).filter(Boolean));
      const primero = Math.min(...lg.map(x => x.ts));
      c.res.actividad = { inicios: lg.length, dispositivos: dispositivos.size, ips: ips.size, primerRegistro: fmtFecha(primero) };
      html += metricas([
        ['Inicios de sesión', num(lg.length)], ['Dispositivos distintos', num(dispositivos.size)],
        ['Direcciones IP distintas', num(ips.size)], ['Registro desde', fmtFecha(primero)]
      ]);
    }

    if (sum(heat)) {
      let pico = 0; heat.forEach((v, i) => { if (v > heat[pico]) pico = i; });
      const porHora = new Array(24).fill(0); heat.forEach((v, i) => { porHora[i % 24] += v; });
      const porDia = new Array(7).fill(0); heat.forEach((v, i) => { porDia[Math.floor(i / 24)] += v; });
      const hPico = porHora.indexOf(maxDe(porHora)), dPico = porDia.indexOf(maxDe(porDia));
      c.res.actividad = Object.assign(c.res.actividad || {}, { horaMasActiva: hPico, diaMasActivo: DIAS_LARGO[dPico] });
      html += tarjeta('Cuándo estás más activo',
        ya(tr('Combina me gusta, comentarios, búsquedas, guardados, accesos, publicaciones y mensajes enviados. Tu franja más fuerte: <strong>{franja}</strong>. Tu hora habitual: <strong>{h}:00</strong> y tu día más activo: <strong>{d}</strong>.',
          { franja: tr('{d} a las {h}:00', { d: diaL(Math.floor(pico / 24)), h: pico % 24 }), h: hPico, d: diaL(dPico) })),
        mapaCalor(heat));
      html += `<div class="pf-two">${tarjeta('Actividad por hora', '', colHoras(porHora, 'acciones', 'Actividad por hora'))}${
        tarjeta('Actividad por día de la semana', '', colDias(porDia, 'acciones', 'Actividad por día'))}</div>`;
    }

    if (lg.length) {
      const dev = new Map();
      lg.forEach(x => { const k = dispositivo(x.ua); dev.set(k, (dev.get(k) || 0) + 1); });
      const top = [...dev.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => ({ label: k, valor: n }));
      html += `<div class="pf-two">${tarjeta('Dispositivos con los que accedes', 'Según el agente de usuario de cada inicio de sesión.', barrasH(top, 'accesos'))}${
        tarjeta('Accesos en el tiempo', '', colSerie(serieTs(lg.map(x => x.ts)), 'accesos', 'Accesos por periodo'))}</div>`;
    }

    if (tieneSeg) {
      const tsSeg = c.seguidoresObjs.map(o => o.timestamp).filter(Boolean);
      const tsSig = c.seguidosObjs.map(o => o.timestamp).filter(Boolean);
      const sS = serieTs(tsSeg), sG = serieTs(tsSig);
      let pista = '';
      if (sS) { const i = sS.val.indexOf(maxDe(sS.val)); pista = ya(tr(sS.unidadTiempo === 'mes' ? 'Tu mejor mes fue <strong>{p}</strong> con {n} seguidores nuevos.' : 'Tu mejor año fue <strong>{p}</strong> con {n} seguidores nuevos.', { p: esc(sS.det[i]), n: num(sS.val[i]) })); c.res.mejorPeriodoSeguidores = { periodo: sS.det[i], nuevos: sS.val[i] }; }
      html += `<div class="pf-two">${
        tarjeta('Seguidores nuevos', pista, colSerie(sS, 'seguidores nuevos', 'Seguidores nuevos por periodo'))}${
        tarjeta('Cuentas que has empezado a seguir', 'Fecha en la que seguiste a cada cuenta.', colSerie(sG, 'cuentas seguidas', 'Cuentas seguidas por periodo'))}</div>`;
    }
    return html;
  }

  function dispositivo(ua) {
    ua = ua || '';
    let so = tr('Otro');
    if (/iPhone/i.test(ua)) so = 'iPhone'; else if (/iPad/i.test(ua)) so = 'iPad';
    else if (/Android/i.test(ua)) so = 'Android'; else if (/Windows/i.test(ua)) so = 'Windows';
    else if (/Macintosh|Mac OS/i.test(ua)) so = 'Mac'; else if (/Linux/i.test(ua)) so = 'Linux';
    else if (!ua) so = tr('Desconocido');
    const app = /Instagram\s[\d.]+/i.test(ua) ? tr('app') : (ua ? tr('navegador') : '');
    return app ? `${so} · ${app}` : so;
  }

  function panelMensajes(d, c) {
    if (!d.hilos.size) return faltan('Mensajes', 'Mensajes');
    let hilos = [...d.hilos.values()].filter(h => h.bandeja === 'inbox' || h.bandeja === 'archived_threads');
    if (!hilos.length) hilos = [...d.hilos.values()];
    const yo = c.yo;
    hilos.forEach(h => { h.grupo = new Set([...h.participantes, ...h.emisores.keys()]).size > 2; });
    const nombre = h => h.titulo || [...h.emisores.keys()].filter(x => x !== yo).join(', ') || tr('(sin nombre)');
    const normN = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const porNorm = new Map();
    new Set([...c.seguidores, ...c.seguidos]).forEach(u => {
      const k = normN(u); if (!k) return;
      porNorm.set(k, porNorm.has(k) ? null : u);
    });
    let resueltos = 0;
    const usuarioHilo = h => {
      if (h.grupo || h._u !== undefined) return h._u || '';
      const carpeta = (h.id.split('/').pop() || '').replace(/_\d+$/, '');
      const cand = [...new Set([normN(nombre(h)), normN(carpeta)].filter(Boolean))].map(k => porNorm.get(k)).filter(Boolean);
      h._u = cand.length && cand.every(x => x === cand[0]) ? cand[0] : '';
      if (h._u) resueltos++;
      return h._u;
    };
    const etiqueta = h => { const u = usuarioHilo(h); return u ? `<a href="${esc(ig(u))}" target="_blank" rel="noopener noreferrer" class="user-link">${esc(nombre(h))}</a>` : esc(nombre(h)); };
    const total = sum(hilos.map(h => h.total));
    const enviados = yo ? sum(hilos.map(h => h.emisores.get(yo) || 0)) : 0;
    const grupos = hilos.filter(h => h.grupo).length;

    c.res.mensajes = { uno: hilos.length - grupos, conversaciones: hilos.length, grupos, mensajes: total, enviados: yo ? enviados : null, recibidos: yo ? total - enviados : null };
    let html = metricas(yo
      ? [['Conversaciones', num(hilos.length)], ['Mensajes totales', num(total)], ['Enviados por ti', num(enviados)], ['Recibidos', num(total - enviados)]]
      : [['Conversaciones', num(hilos.length)], ['Mensajes totales', num(total)], ['Grupos', num(grupos)], ['1 a 1', num(hilos.length - grupos)]]);
    if (!yo) html += nota('No se pudo identificar tu nombre en los chats (hace falta personal_information.json o al menos dos conversaciones), por eso no se separan enviados y recibidos.');

    const top = hilos.slice().sort((a, b) => b.total - a.total).slice(0, 10);
    if (yo) {
      html += tarjeta('Conversaciones con más mensajes', 'Reparto entre lo que escribes tú y lo que escriben los demás.',
        leyenda2('Tú', 'Los demás') + '<div class="pf-hbars">' + top.map(h => {
          const a = h.emisores.get(yo) || 0, b = h.total - a;
          return `<div class="pf-hrow pf-hrow2" title="${esc(tr('{n}: {a} tuyos, {b} de los demás', { n: nombre(h), a: num(a), b: num(b) }))}">
            <span class="pf-hlabel">${etiqueta(h)}${h.grupo ? ' ' + badge(tr('grupo')) : ''}</span>
            <span class="pf-stack"><span class="pf-seg a" style="flex:${a || 0.0001}"></span><span class="pf-seg b" style="flex:${b || 0.0001}"></span></span>
            <span class="pf-hval">${num(h.total)}</span></div>`;
        }).join('') + '</div>');
    } else {
      html += tarjeta('Conversaciones con más mensajes', '', barrasH(top.map(h => ({ label: nombre(h), valor: h.total, href: usuarioHilo(h) ? ig(usuarioHilo(h)) : '' })), 'mensajes'));
    }

    if (yo) {
      const uno = hilos.filter(h => !h.grupo && h.total >= 2);
      const inicie = uno.filter(h => h.primerEmisor === yo).length;
      if (uno.length) {
        c.res.mensajes.iniciasteConversaciones = `${inicie}/${uno.length}`;
        html += tarjeta('Quién da el primer paso',
          ya(tr('En {n} chats 1 a 1, tú escribiste primero en <strong>{i}</strong> ({p} %) y la otra persona en {o}.', { n: num(uno.length), i: num(inicie), p: Math.round(inicie / uno.length * 100), o: num(uno.length - inicie) })),
          nota('Se calcula con el primer mensaje que aparece en tu ZIP; si pediste un rango de fechas, puede no ser el primer mensaje real.'));
      }
      const pendientes = hilos.filter(h => !h.grupo && h.total >= 3 && h.ultimoEmisor && h.ultimoEmisor !== yo)
        .sort((a, b) => b.ultimo - a.ultimo);
      c.res.mensajes.esperandoRespuesta = pendientes.length;
      html += tarjeta(ya(tr('Esperan tu respuesta ({n})', { n: num(pendientes.length) })),
        'Chats 1 a 1 en los que el último mensaje es de la otra persona.',
        desplegable('Ver los 15 más recientes', pendientes.slice(0, 15).map(h =>
          `<div class="user-card">${usuarioHilo(h) ? etiqueta(h) : `<span class="user-link">${esc(nombre(h))}</span>`}<div class="user-actions"><span class="pf-badge">${tr('{f} · hace {n} d', { f: fmtFecha(h.ultimo), n: num(diasDesde(h.ultimo)) })}</span></div></div>`)));
      const frios = hilos.filter(h => !h.grupo && h.total >= 50 && diasDesde(h.ultimo) > 365).sort((a, b) => b.total - a.total);
      c.res.mensajes.chatsFrios = frios.length;
      html += tarjeta(ya(tr('Chats que se enfriaron ({n})', { n: num(frios.length) })),
        'Conversaciones con 50 o más mensajes y sin actividad desde hace más de un año.',
        desplegable('Ver los 15 con más historia', frios.slice(0, 15).map(h =>
          `<div class="user-card">${usuarioHilo(h) ? etiqueta(h) : `<span class="user-link">${esc(nombre(h))}</span>`}<div class="user-actions"><span class="pf-badge">${tr('{n} msgs · último {f}', { n: num(h.total), f: fmtFecha(h.ultimo) })}</span></div></div>`)));
    }

    if (yo) html += bloqueRespuesta(hilos, yo, nombre, c);

    const porMes = new Map();
    hilos.forEach(h => h.porMes.forEach((v, k) => porMes.set(k, (porMes.get(k) || 0) + v)));
    html += `<div class="pf-two">${tarjeta('Mensajes por periodo', 'Todos los chats.', colSerie(serieDesdeMapa(porMes), 'mensajes', 'Mensajes por periodo'))}${
      yo && d.actMsg.has(yo) ? tarjeta('A qué hora escribes', 'Mensajes enviados por ti, hora local.', colHoras(d.actMsg.get(yo).horas, 'mensajes', 'Mensajes enviados por hora')) : ''}</div>`;
    html += nota('Solo se cuentan mensajes y fechas. El contenido de tus chats no se guarda ni se muestra.');
    hilos.forEach(h => usuarioHilo(h));
    html += nota(c.hayRel
      ? ya(tr('Los nombres son enlazables cuando coinciden con una sola cuenta de tus seguidores o seguidos ({r} de {n} chats 1 a 1). Instagram no incluye el @usuario en los mensajes, así que el resto se queda sin enlace en lugar de arriesgarse a abrir un perfil equivocado.', { r: num(resueltos), n: num(hilos.filter(h => !h.grupo).length) }))
      : 'Para poder abrir el perfil desde los nombres, carga también seguidores y seguidos: Instagram no incluye el @usuario dentro de los mensajes.');
    return html;
  }

  /* ---------------------------- tiempo de respuesta ---------------------------- */
  const mediana = a => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  function fmtDur(sec) {
    const dec = x => x.toLocaleString(global.I18n.locale, { maximumFractionDigits: 1 });
    if (sec < 60) return tr('menos de 1 min');
    if (sec < 3600) return Math.round(sec / 60) + ' min';
    if (sec < 86400) return dec(Math.round(sec / 360) / 10) + ' h';
    return dec(Math.round(sec / 8640) / 10) + ' d';
  }
  // Tiempo entre el último mensaje de uno y la primera respuesta del otro. Se ignoran pausas de más de 3 días.
  function tiemposRespuesta(h, yo) {
    const n = h.seqT.length;
    if (n < 2) return { mios: [], suyos: [] };
    const ord = Array.from({ length: n }, (_, i) => i).sort((a, b) => h.seqT[a] - h.seqT[b]);
    const mios = [], suyos = [];
    let p = ord[0];
    for (let k = 1; k < n; k++) {
      const q = ord[k];
      if (h.seqS[q] !== h.seqS[p]) {
        const gap = h.seqT[q] - h.seqT[p];
        if (gap >= 0 && gap <= 259200) (h.nombres[h.seqS[q]] === yo ? mios : suyos).push(gap);
      }
      p = q;
    }
    return { mios, suyos };
  }
  function bloqueRespuesta(hilos, yo, nombre, c) {
    const filas = hilos.filter(h => !h.grupo).map(h => Object.assign({ h }, tiemposRespuesta(h, yo)));
    const todosMios = [].concat(...filas.map(f => f.mios)), todosSuyos = [].concat(...filas.map(f => f.suyos));
    if (todosMios.length < 5 || todosSuyos.length < 5) return '';
    const rapidas = todosMios.filter(x => x <= 3600).length;
    c.res.mensajes.respuesta = { tuMediana: Math.round(mediana(todosMios)), losDemasMediana: Math.round(mediana(todosSuyos)), tusRespuestasEnMenosDeUnaHora: Math.round(rapidas / todosMios.length * 100) };
    const top = (clave, min) => filas.filter(f => f[clave].length >= min).map(f => ({ label: nombre(f.h), valor: mediana(f[clave]), n: f[clave].length }))
      .sort((a, b) => b.valor - a.valor).slice(0, 8).map(x => ({ label: x.label, valor: x.valor, texto: fmtDur(x.valor), detalle: tr('{n} respuestas medidas', { n: num(x.n) }) }));
    let html = metricas([
      ['Tú respondes en', fmtDur(mediana(todosMios))], ['Los demás responden en', fmtDur(mediana(todosSuyos))],
      ['Tus respuestas en menos de 1 h', Math.round(rapidas / todosMios.length * 100) + ' %'], ['Respuestas medidas', num(todosMios.length + todosSuyos.length)]
    ]);
    html += `<div class="pf-two">${
      tarjeta('Con quién tardas más en responder', 'Mediana de tu tiempo de respuesta, con al menos 5 respuestas.', barrasH(top('mios', 5), ''))}${
      tarjeta('Quién tarda más en responderte', 'Mediana de su tiempo de respuesta, con al menos 5 respuestas.', barrasH(top('suyos', 5), ''))}</div>`;
    html += nota('Se mide desde el último mensaje de una persona hasta la primera respuesta de la otra. Se ignoran pausas de más de 3 días y los grupos. Solo se usan fechas, nunca el texto.');
    return html;
  }

  function panelContenido(d, c) {
    const hayContenido = d.posts.length + d.reels.length + d.stories.length;
    const hayCuenta = d.perfil || d.cambios.length || d.anunciantes.length || Object.values(d.rel).some(a => a.length);
    if (!hayContenido && !hayCuenta) return faltan('Contenido y cuenta', 'Contenido (publicaciones, reels, historias), Información personal y Seguidores y seguidos');
    let html = '';

    if (hayContenido) {
      const pub = d.posts.concat(d.reels).map(x => x.ts).sort((a, b) => a - b);
      const todo = pub.concat(d.stories.map(x => x.ts));
      let gapMedio = 0, gapMax = 0, gapIni = 0;
      for (let i = 1; i < pub.length; i++) {
        const g = (pub[i] - pub[i - 1]) / 86400;
        gapMedio += g; if (g > gapMax) { gapMax = g; gapIni = pub[i - 1]; }
      }
      if (pub.length > 1) gapMedio /= (pub.length - 1);
      c.res.contenido = { publicaciones: d.posts.length, reels: d.reels.length, historias: d.stories.length, diasMediosEntrePublicaciones: pub.length > 1 ? Math.round(gapMedio) : null };
      html += metricas([
        ['Publicaciones', num(d.posts.length)], ['Reels', num(d.reels.length)], ['Historias', num(d.stories.length)],
        ['Días entre publicaciones', pub.length > 1 ? num(Math.round(gapMedio)) : '—', 'highlight']
      ]);
      const extra = [];
      if (pub.length) extra.push(tr('Primera publicación: <strong>{a}</strong> · última: <strong>{b}</strong>.', { a: fmtFecha(pub[0]), b: fmtFecha(pub[pub.length - 1]) }));
      if (gapMax > 1) extra.push(tr('Tu pausa más larga fue de <strong>{n} días</strong>, desde el {f}.', { n: num(Math.round(gapMax)), f: fmtFecha(gapIni) }));
      const conCarrusel = d.posts.filter(x => x.n > 1).length;
      if (d.posts.length) extra.push(tr('{n} de tus publicaciones son carruseles.', { n: num(conCarrusel) }));
      html += tarjeta('Ritmo de publicación', ya(extra.join(' ')), colSerie(serieTs(todo), 'publicaciones', 'Contenido publicado por periodo'));
      html += `<div class="pf-two">${tarjeta('Día de la semana', 'Cuándo publicas.', colDias(histDias(todo), 'publicaciones', 'Publicaciones por día'))}${
        tarjeta('Hora del día', 'Hora local de tu dispositivo.', colHoras(histHoras(todo), 'publicaciones', 'Publicaciones por hora'))}</div>`;
    }

    if (hayCuenta) {
      let cuenta = '';
      if (d.perfil) {
        const p = d.perfil;
        cuenta += metricas([
          ['Usuario', p.usuario ? '@' + p.usuario : '—'], ['Nombre', p.nombre || '—'],
          ['Cuenta', tr(p.privada ? 'Privada' : 'Pública')], ['Cambios de perfil', num(d.cambios.length)]
        ]);
      }
      if (d.cambios.length) {
        const cs = d.cambios.slice().sort((a, b) => b.ts - a.ts).slice(0, 15);
        cuenta += tarjeta('Historial de cambios del perfil', 'Qué cambiaste y cuándo.',
          desplegable(ya(tr('Ver cambios ({n})', { n: d.cambios.length })), cs.map(x =>
            `<div class="user-card"><span class="user-link">${esc(x.que || tr('Cambio'))}${x.antes || x.despues ? ': ' + esc(x.antes || '—') + ' → ' + esc(x.despues || '—') : ''}</span><div class="user-actions"><span class="pf-badge">${fmtFecha(x.ts)}</span></div></div>`)));
      }
      const r = d.rel;
      const resumenRel = [
        ['Bloqueados', r.bloqueados.length], ['Amigos cercanos', r.cercanos.length], ['Restringidos', r.restringidos.length],
        ['Solicitudes enviadas pendientes', r.enviadas.length], ['Solicitudes recibidas', r.recibidas.length], ['Hashtags seguidos', r.hashtags.length]
      ];
      c.res.cuenta = Object.fromEntries(resumenRel.map(([k, v]) => [k, v]));
      if (resumenRel.some(x => x[1])) {
        cuenta += metricas(resumenRel.slice(0, 4).map(([k, v]) => [k, num(v)]));
      }
      const det = [];
      if (r.dejados.length) {
        const ord = r.dejados.slice().sort((a, b) => b.timestamp - a.timestamp);
        det.push(desplegable(ya(tr('Dejaste de seguir recientemente ({n})', { n: r.dejados.length })), ord.map(o => {
          const te = c.seguidores.has(o.username);
          return filaUsuario(o.username, (o.timestamp ? fmtFecha(o.timestamp) : '') + (c.hayRel ? ' · ' + tr(te ? 'aún te sigue' : 'no te sigue') : ''), te ? 'badge-fan' : 'pf-badge');
        })));
      }
      if (r.enviadas.length) {
        const ord = r.enviadas.slice().sort((a, b) => a.timestamp - b.timestamp);
        det.push(desplegable(ya(tr('Solicitudes enviadas sin respuesta ({n})', { n: r.enviadas.length })), ord.map(o =>
          filaUsuario(o.username, o.timestamp ? tr('hace {n} d', { n: num(diasDesde(o.timestamp)) }) : '', 'pf-badge'))));
      }
      if (r.recibidas.length) det.push(desplegable(ya(tr('Solicitudes recibidas ({n})', { n: r.recibidas.length })), r.recibidas.map(o => filaUsuario(o.username, o.timestamp ? fmtFecha(o.timestamp) : ''))));
      if (r.bloqueados.length) det.push(desplegable(ya(tr('Perfiles bloqueados ({n})', { n: r.bloqueados.length })), r.bloqueados.map(o => filaUsuario(o.username, o.timestamp ? fmtFecha(o.timestamp) : ''))));
      if (r.restringidos.length) det.push(desplegable(ya(tr('Perfiles restringidos ({n})', { n: r.restringidos.length })), r.restringidos.map(o => filaUsuario(o.username, o.timestamp ? fmtFecha(o.timestamp) : ''))));
      if (r.cercanos.length) det.push(desplegable(ya(tr('Amigos cercanos ({n})', { n: r.cercanos.length })), r.cercanos.map(o => filaUsuario(o.username, c.hayRel ? tr(c.seguidores.has(o.username) ? 'te sigue' : 'no te sigue') : ''))));
      if (r.hashtags.length) det.push(desplegable(ya(tr('Hashtags que sigues ({n})', { n: r.hashtags.length })), r.hashtags.map(o => `<div class="user-card"><span class="user-link">#${esc(o.username)}</span></div>`)));
      if (det.length) cuenta += tarjeta('Relaciones y listas', 'Despliega cada lista para verla.', det.join(''));

      if (d.anunciantes.length) {
        c.res.cuenta = Object.assign(c.res.cuenta || {}, { anunciantesConTusDatos: d.anunciantes.length });
        cuenta += tarjeta(ya(tr('{n} anunciantes usan tu actividad o información', { n: num(d.anunciantes.length) })),
          'Empresas que han subido tus datos a Meta para anunciarse. Puedes revisarlo en el Centro de cuentas → Preferencias de anuncios.',
          desplegable('Ver anunciantes', d.anunciantes.slice(0, 300).map(n => `<div class="user-card"><span class="user-link">${esc(n)}</span></div>`)));
      }
      html += cuenta;
    }
    return html;
  }

  /* ================================ resumen ================================ */
  function anillo(p) {
    const C = 2 * Math.PI * 52, on = C * p / 100;
    return `<svg class="pf-ring" viewBox="0 0 120 120" role="img" aria-label="${esc(tr('Puntuación {p} de 100', { p }))}">
      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-3)" stroke-width="10"/>
      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--accent-blue)" stroke-width="10" stroke-linecap="round"
        stroke-dasharray="${on.toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 60 60)"/>
      <text x="60" y="60" text-anchor="middle" dominant-baseline="central" class="pf-ring-num">${p}</text></svg>`;
  }
  const irA = (tab, txt) => `<button class="pf-link" type="button" onclick="Perfil.cambiarPanel('${tab}')">${esc(txt)}</button>`;

  function panelResumen(d, c) {
    const comp = [];
    const nSeg = c.seguidos.size;
    let mutuos = 0, sinRet = 0, fans = 0;
    c.seguidos.forEach(u => { if (c.seguidores.has(u)) mutuos++; else sinRet++; });
    c.seguidores.forEach(u => { if (!c.seguidos.has(u)) fans++; });
    if (nSeg) comp.push({ clave: 'Reciprocidad', label: tr('Reciprocidad'), valor: Math.round(mutuos / nSeg * 100), detalle: tr('{m} de las {n} cuentas que sigues te siguen.', { m: num(mutuos), n: num(nSeg) }) });
    const ri = c.res.interacciones;
    if (ri && nSeg && ri.seguidosSinInteraccion != null) comp.push({ clave: 'Interacción real', label: tr('Interacción real'), valor: Math.round((1 - ri.seguidosSinInteraccion / nSeg) * 100), detalle: tr('Interactúas con {m} de las {n} cuentas que sigues.', { m: num(nSeg - ri.seguidosSinInteraccion), n: num(nSeg) }) });
    const rm = c.res.mensajes;
    if (rm && rm.uno > 0 && rm.esperandoRespuesta != null) comp.push({ clave: 'Mensajes al día', label: tr('Mensajes al día'), valor: Math.round((1 - rm.esperandoRespuesta / rm.uno) * 100), detalle: tr('{m} de {n} chats 1 a 1 esperan tu respuesta.', { m: num(rm.esperandoRespuesta), n: num(rm.uno) }) });

    let html = '';
    if (d.htmlOmitidos > 0) {
      html += tarjeta('Tu descarga está en HTML', 'Se han leído seguidores, seguidos y listas de cuentas. Las interacciones, la actividad, los mensajes y el contenido solo se pueden analizar con la descarga en formato JSON.',
        `<button class="btn-sub" type="button" onclick="mostrarAyudaDescarga()">${tr('Ver cómo pedirla en JSON')}</button>`);
    }
    if (comp.length) {
      const score = Math.round(sum(comp.map(x => x.valor)) / comp.length);
      c.res.resumen = { puntuacion: score, componentes: comp.map(x => ({ nombre: x.clave, valor: x.valor })) };
      html += `<section class="pf-hero"><div class="pf-hero-ring">${anillo(score)}</div><div class="pf-hero-body">
        <h3>${tr('Salud de tu perfil')}</h3>
        <p>${comp.length === 1 ? tr('Se calcula con un indicador a partir de tu ZIP. Es una referencia propia de Golifiar, no una métrica de Instagram.') : tr('Media de {n} indicadores calculados a partir de tu ZIP. Es una referencia propia de Golifiar, no una métrica de Instagram.', { n: comp.length })}</p>
        ${barrasH(comp.map(x => ({ label: x.label, valor: x.valor, detalle: x.detalle })), '%', 100)}</div></section>`;
    }

    const h = [];
    if (nSeg && sinRet) h.push([tr('Sigues a {n} cuentas que no te siguen.', { n: num(sinRet) }), 'seguidores', 'Ver lista']);
    if (fans) h.push([tr('{n} cuentas te siguen y tú no las sigues.', { n: num(fans) }), 'seguidores', 'Ver fans']);
    if (c.res.limpieza && c.res.limpieza.candidatas) h.push([tr('Hay {n} cuentas candidatas para revisar en la limpieza guiada.', { n: num(c.res.limpieza.candidatas) }), 'limpieza', 'Empezar']);
    if (ri && ri.seguidosSinInteraccion) h.push([tr('Sigues a {n} cuentas sin ninguna interacción registrada.', { n: num(ri.seguidosSinInteraccion) }), 'interacciones', 'Revisar']);
    if (ri && ri.interactuasSinRetorno) h.push([tr('Interactúas con {n} cuentas que no te siguen.', { n: num(ri.interactuasSinRetorno) }), 'interacciones', 'Ver cuáles']);
    if (rm && rm.esperandoRespuesta) h.push([tr('{n} chats esperan tu respuesta.', { n: num(rm.esperandoRespuesta) }), 'mensajes', 'Ver chats']);
    if (rm && rm.chatsFrios) h.push([tr('{n} chats con historia llevan más de un año parados.', { n: num(rm.chatsFrios) }), 'mensajes', 'Ver chats']);
    if (rm && rm.respuesta) h.push([tr('Respondes en una mediana de {a}; los demás tardan {b}.', { a: fmtDur(rm.respuesta.tuMediana), b: fmtDur(rm.respuesta.losDemasMediana) }), 'mensajes', 'Ver tiempos']);
    const ra = c.res.actividad;
    if (ra && ra.horaMasActiva != null) h.push([tr('Tu hora más activa es a las {h}:00 y tu día más activo, el {d}.', { h: ra.horaMasActiva, d: tr(ra.diaMasActivo) }), 'actividad', 'Ver actividad']);
    const rc = c.res.contenido;
    if (rc && rc.diasMediosEntrePublicaciones) h.push([tr('Publicas, de media, cada {n} días.', { n: num(rc.diasMediosEntrePublicaciones) }), 'contenido', 'Ver ritmo']);
    const rcu = c.res.cuenta;
    if (rcu && rcu.anunciantesConTusDatos) h.push([tr('{n} anunciantes usan tu actividad o información.', { n: num(rcu.anunciantesConTusDatos) }), 'contenido', 'Ver anunciantes']);

    if (h.length) {
      html += tarjeta('Lo que destaca', '', `<ul class="pf-finds">${h.map(([t, tab, b]) => `<li><span>${esc(t)}</span>${irA(tab, tr(b))}</li>`).join('')}</ul>`);
    }

    const tiene = secciones(d);
    const todas = ['me gusta', 'comentarios', 'mensajes', 'accesos', 'publicaciones', 'datos de cuenta'];
    const faltan_ = todas.filter(x => !tiene.includes(x));
    html += tarjeta(comp.length || h.length ? 'Datos que se han leído' : 'Aún hay poco que analizar',
      comp.length || h.length ? '' : 'Para que aparezcan la puntuación y las conclusiones hacen falta, como mínimo, los seguidores y los seguidos.',
      `<div class="pf-chips">${tiene.map(x => `<span class="pf-chip on">${esc(tr(x))}</span>`).join('') || ''}${faltan_.map(x => `<span class="pf-chip">${esc(tr(x))}</span>`).join('')}</div>` +
      (faltan_.length ? nota('Las etiquetas atenuadas no venían en tu ZIP. Para añadirlas, vuelve a pedir la descarga a Instagram marcando esa información en formato JSON.') : ''));
    return html;
  }

  /* ============================== comparar descargas ============================== */
  const CLAVE_SNAP = 'golifiar-snapshots';
  const leerSnaps = () => { try { return JSON.parse(localStorage.getItem(CLAVE_SNAP) || '[]'); } catch (e) { return []; } };
  const escribirSnaps = a => { try { localStorage.setItem(CLAVE_SNAP, JSON.stringify(a)); return true; } catch (e) { return false; } };
  const aviso = k => { if (typeof global.mostrarToast === 'function') global.mostrarToast(tr(k)); };

  function comparar(prev, etiqueta) {
    const cs = new Set(ESTADO.seg.map(o => o.username)), cg = new Set(ESTADO.sig.map(o => o.username));
    const ps = new Set(prev.seg), pg = new Set(prev.sig);
    const dif = (a, b) => [...a].filter(x => !b.has(x)).sort();
    const r = { perdidos: dif(ps, cs), nuevos: dif(cs, ps), dejaste: dif(pg, cg), empezaste: dif(cg, pg) };
    ESTADO.cmp = { etiqueta, r };
    ESTADO.cmpHtml = renderResultadoCmp();
    renderComparar();
    aviso('Comparación lista.');
  }

  function renderResultadoCmp() {
    if (!ESTADO.cmp) return '';
    const { etiqueta, r } = ESTADO.cmp;
    const lst = (k, arr, txt) => desplegable(ya(`${tr(k)} (${num(arr.length)})`), arr.slice(0, 500).map(u => filaUsuario(u, txt ? tr(txt) : txt)), 'Ninguno.');
    return tarjeta(ya(tr('Cambios desde «{e}»', { e: etiqueta })), 'Comparado con el análisis que tienes abierto.',
      metricas([['Dejaron de seguirte', num(r.perdidos.length), r.perdidos.length ? 'highlight' : ''], ['Nuevos seguidores', num(r.nuevos.length), 'green'],
        ['Dejaste de seguir', num(r.dejaste.length)], ['Empezaste a seguir', num(r.empezaste.length)]]) +
      lst('Dejaron de seguirte', r.perdidos, 'ya no te sigue') + lst('Nuevos seguidores', r.nuevos, 'te sigue') +
      lst('Dejaste de seguir', r.dejaste) + lst('Empezaste a seguir', r.empezaste) +
      nota('Quien «deja de seguirte» puede haber borrado o desactivado su cuenta, no solo haberte dejado de seguir.'));
  }

  function renderComparar() {
    const el = document.getElementById('panel-comparar');
    if (!el) return;
    const snaps = leerSnaps();
    const lista = snaps.length ? `<div class="results-list pf-snaps">${snaps.map(x =>
      `<div class="user-card"><span class="user-link">${esc(new Date(x.date).toLocaleDateString(global.I18n.locale))}</span><div class="user-actions"><span class="pf-badge">${tr('{a} seguidores · {b} seguidos', { a: num(x.seg.length), b: num(x.sig.length) })}</span>
        <button class="user-mark" type="button" onclick="Perfil.compararSnap(${x.id})">${tr('Comparar')}</button><button class="user-mark" type="button" onclick="Perfil.borrarSnap(${x.id})">${tr('Borrar')}</button></div></div>`).join('')}</div>`
      : '<div class="empty-state">' + tr('Todavía no has guardado ninguna descarga.') + '</div>';
    el.innerHTML =
      tarjeta('Comparar con una descarga anterior', 'Sube un ZIP antiguo de Instagram y verás quién dejó de seguirte, quién te sigue desde entonces y a quién has dejado de seguir. El ZIP se lee en tu dispositivo y no se guarda.',
        `<label class="btn-sub pf-upload"><input type="file" accept=".zip" onchange="Perfil.compararZip(this)"> ${tr('Elegir ZIP anterior')}</label>`) +
      tarjeta('Descargas guardadas', 'Guarda esta descarga para compararla en el futuro sin conservar el ZIP. Solo se guardan los nombres de usuario de tus seguidores y seguidos, en este dispositivo.',
        `<div class="panel-actions"><button class="btn-sub" type="button" onclick="Perfil.guardarSnap()">${tr('Guardar esta descarga')}</button></div>${lista}`) +
      (ESTADO.cmpHtml || '');
  }

  function guardarSnap() {
    if (!ESTADO.seg.length && !ESTADO.sig.length) { aviso('No hay seguidores ni seguidos que guardar.'); return; }
    const snaps = leerSnaps();
    snaps.unshift({ id: Date.now(), date: new Date().toISOString(), seg: ESTADO.seg.map(o => o.username), sig: ESTADO.sig.map(o => o.username) });
    if (!escribirSnaps(snaps.slice(0, 6))) { aviso('No se pudo guardar: el almacenamiento de este dispositivo está lleno o bloqueado.'); return; }
    renderComparar();
    aviso('Descarga guardada solo en este dispositivo.');
  }
  function borrarSnap(id) { escribirSnaps(leerSnaps().filter(x => x.id !== id)); renderComparar(); }
  function compararSnap(id) {
    const x = leerSnaps().find(y => y.id === id);
    if (x) comparar(x, new Date(x.date).toLocaleDateString(global.I18n.locale));
  }

  async function compararZip(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      if (typeof global.abrirZip !== 'function' || typeof global.extraerUsuarios !== 'function' || typeof global.extraerUsuariosHtml !== 'function') throw new Error('Falta el lector de ZIP');
      const zip = await global.abrirZip(file);
      let seg = [], sig = [];
      for (const ent of zip.entradas) {
        const base = ent.ruta.toLowerCase().split('/').pop();
        if (/^followers(_\d+)?\.json$/.test(base)) seg = seg.concat(global.extraerUsuarios(JSON.parse(await ent.texto())));
        else if (base === 'following.json') sig = global.extraerUsuarios(JSON.parse(await ent.texto()));
        else if (/^followers(_\d+)?\.html?$/.test(base)) seg = seg.concat(global.extraerUsuariosHtml(await ent.texto()));
        else if (/^following\.html?$/.test(base)) sig = global.extraerUsuariosHtml(await ent.texto());
      }
      await zip.cerrar();
      if (!seg.length && !sig.length) { aviso('Ese ZIP no contiene seguidores ni seguidos (JSON o HTML).'); return; }
      comparar({ seg: seg.map(o => o.username), sig: sig.map(o => o.username) }, file.name.replace(/\.zip$/i, ''));
    } catch (e) {
      console.error('Perfil: comparar ZIP', e);
      aviso('No se pudo leer ese ZIP. Comprueba que sea una descarga completa de Instagram.');
    } finally { input.value = ''; }
  }

  /* ============================== limpieza guiada ============================== */
  const CLAVE_LIMP = 'golifiar-limpieza';
  const leerLimp = () => { try { const j = JSON.parse(localStorage.getItem(CLAVE_LIMP) || '{}'); return { m: j.m || [], d: j.d || [] }; } catch (e) { return { m: [], d: [] }; } };
  const guardarLimp = x => { try { localStorage.setItem(CLAVE_LIMP, JSON.stringify(x)); } catch (e) { aviso('No se pudo guardar tu decisión en este dispositivo.'); } };
  const invalido = u => typeof global.nombreInvalido === 'function' && global.nombreInvalido(u);
  const noDisp = u => typeof global.esNoDisponible === 'function' && global.esNoDisponible(u);

  const FILTROS_LIMP = [['todas', 'Todas'], ['nosigue', 'No me siguen'], ['sinint', 'Sin interacción'], ['rotas', 'No disponibles']];

  function candidatasLimpieza(c) {
    const out = [];
    c.seguidosObjs.forEach(o => {
      const u = o.username, r = [];
      let score = 0;
      if (noDisp(u)) { r.push(['rotas', 'Cuenta no disponible']); score += 4; }
      if (c.seguidores.size && !c.seguidores.has(u)) { r.push(['nosigue', 'No te sigue']); score += 3; }
      if (c.hayInteracciones && !c.interactuados.has(u)) { r.push(['sinint', 'Sin interacción tuya']); score += 2; }
      if (!r.length) return;
      if (o.timestamp && diasDesde(o.timestamp) > 730) { r.push(['antigua', 'La sigues desde {y}', { y: new Date(o.timestamp * 1000).getFullYear() }]); score += 1; }
      out.push({ u, razones: r, score, ts: o.timestamp || 0 });
    });
    return out.sort((a, b) => b.score - a.score || (a.ts || Infinity) - (b.ts || Infinity));
  }

  function panelLimpieza(d, c) {
    if (!c.seguidosObjs.length) return faltan('Limpieza guiada', 'Seguidores y seguidos');
    const todas = candidatasLimpieza(c);
    c.res.limpieza = { candidatas: todas.length };
    ESTADO.limp = { todas, filtro: ESTADO.limp ? ESTADO.limp.filtro : 'todas', saltadas: [], hist: [] };
    return '<div id="pf-limp"></div>';
  }

  function renderLimpieza() {
    const el = document.getElementById('pf-limp');
    const L = ESTADO.limp;
    if (!el || !L) return;
    const dec = leerLimp();
    const hechas = new Set(dec.m.concat(dec.d));
    const pendientes = L.todas.filter(x => !hechas.has(x.u));
    const cola = pendientes.filter(x => L.filtro === 'todas' || x.razones.some(r => r[0] === L.filtro));
    const orden = cola.filter(x => !L.saltadas.includes(x.u)).concat(cola.filter(x => L.saltadas.includes(x.u)));
    const total = L.todas.length, revisadas = total - pendientes.length;
    const pct = total ? Math.round(revisadas / total * 100) : 100;

    let h = `<section class="pf-card"><h3>${tr('Revisa tus cuentas una a una')}</h3>
      <p class="pf-sub">${tr('Golifiar te propone cuentas que sigues y que quizá ya no te aportan nada. Tú decides. Para dejar de seguir se abre su perfil y lo haces tú en Instagram: ninguna app puede hacerlo por ti sin poner en riesgo tu cuenta.')}</p>
      <div class="pf-chips" role="group" aria-label="${esc(tr('Qué cuentas revisar'))}">${FILTROS_LIMP.map(([k, t]) =>
        `<button type="button" class="pf-chip pf-chipbtn${L.filtro === k ? ' on' : ''}" aria-pressed="${L.filtro === k}" onclick="Perfil.limpiezaFiltro('${k}')">${esc(tr(t))}</button>`).join('')}</div>
      <div class="pf-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
      <p class="pf-note">${tr('Revisadas {r} de {t} candidatas · mantenidas {m} · para dejar {d}', { r: num(revisadas), t: num(total), m: num(dec.m.length), d: num(dec.d.length) })}</p></section>`;

    const x = orden[0];
    if (x) {
      const roto = invalido(x.u);
      const chips = x.razones.map(r => `<span class="pf-reason ${r[0]}">${esc(tr(r[1], r[2]))}</span>`).join('');
      h += `<section class="pf-card pf-limpcard" aria-live="polite">
        <div class="pf-limpuser">${roto ? `<span class="pf-limpname">@${esc(x.u)}</span>` : `<a class="pf-limpname" href="${esc(ig(x.u))}" target="_blank" rel="noopener noreferrer">@${esc(x.u)}</a>`}</div>
        <div class="pf-reasons">${chips}</div>
        <p class="pf-note">${tr('{n} por revisar con este filtro.', { n: num(orden.length) })}${x.ts ? ' ' + tr('La sigues desde el {f}.', { f: fmtFecha(x.ts) }) : ''}</p>
        <div class="pf-limpbtns">
          <button class="btn-sub" type="button" onclick="Perfil.limpiezaAccion('mantener')">${tr('Mantener')}</button>
          <button class="btn-minimal pf-dejar" type="button" onclick="Perfil.limpiezaAccion('dejar')">${tr(roto ? 'Quitar de la lista' : 'Dejar de seguir')}</button>
          <button class="btn-sub" type="button" onclick="Perfil.limpiezaAccion('saltar')">${tr('Saltar')}</button>
        </div>
        <p class="pf-note">${tr(roto ? 'Este nombre no puede ser una cuenta real, así que solo se quita de tu lista de revisión.' : 'Al pulsar «Dejar de seguir» se abre su perfil. Allí pulsa «Siguiendo» y luego «Dejar de seguir».')}</p>
        ${L.hist.length ? '<button class="pf-link" type="button" onclick="Perfil.limpiezaAccion(\'deshacer\')">' + tr('Deshacer la última decisión') + '</button>' : ''}
      </section>`;
    } else {
      h += `<section class="pf-card"><div class="empty-state">${tr(total ? (L.filtro === 'todas' ? 'No quedan cuentas por revisar. Buen trabajo.' : 'No quedan cuentas con este filtro.') : 'No hay cuentas candidatas: las que sigues te siguen o interactúas con ellas.')}</div>
        ${dec.m.length || dec.d.length ? '<button class="pf-link" type="button" onclick="Perfil.limpiezaReiniciar()">' + tr('Reiniciar mis decisiones') + '</button>' : ''}</section>`;
    }

    if (dec.d.length) {
      h += `<section class="pf-card"><h3>${tr('Marcadas para dejar de seguir ({n})', { n: num(dec.d.length) })}</h3><p class="pf-sub">${tr('Comprueba que las has dejado de seguir en Instagram.')}</p>${
        desplegable('Ver lista', dec.d.map(u => invalido(u) ? filaUsuario(u, tr('quitada')) : filaUsuario(u, '')), 'Ninguna.')}</section>`;
    }
    el.innerHTML = h;
  }

  function limpiezaFiltro(f) { if (ESTADO.limp) { ESTADO.limp.filtro = f; renderLimpieza(); } }
  function limpiezaReiniciar() { guardarLimp({ m: [], d: [] }); if (ESTADO.limp) ESTADO.limp.hist = []; renderLimpieza(); }
  function limpiezaAccion(acc) {
    const L = ESTADO.limp;
    if (!L) return;
    if (typeof global.trigHaptic === 'function') global.trigHaptic(20);
    const dec = leerLimp();
    if (acc === 'deshacer') {
      const ult = L.hist.pop();
      if (ult) { dec.m = dec.m.filter(u => u !== ult.u); dec.d = dec.d.filter(u => u !== ult.u); guardarLimp(dec); }
      renderLimpieza();
      return;
    }
    const hechas = new Set(dec.m.concat(dec.d));
    const cola = L.todas.filter(x => !hechas.has(x.u) && (L.filtro === 'todas' || x.razones.some(r => r[0] === L.filtro)));
    const x = cola.filter(y => !L.saltadas.includes(y.u)).concat(cola.filter(y => L.saltadas.includes(y.u)))[0];
    if (!x) return;
    if (acc === 'saltar') { L.saltadas = L.saltadas.filter(u => u !== x.u).concat(x.u); renderLimpieza(); return; }
    if (acc === 'mantener') { dec.m.push(x.u); L.hist.push({ u: x.u }); }
    if (acc === 'dejar') {
      dec.d.push(x.u); L.hist.push({ u: x.u });
      if (!invalido(x.u)) global.open(ig(x.u), '_blank', 'noopener');
    }
    guardarLimp(dec);
    renderLimpieza();
  }

  /* ================================ interfaz ================================ */
  const PANELES = ['resumen', 'seguidores', 'interacciones', 'limpieza', 'actividad', 'mensajes', 'contenido', 'comparar'];
  const ESTADO = { resumen: null, seg: [], sig: [], cmp: null, cmpHtml: '', limp: null };
  let ULTIMO = null; // últimos datos pintados, para repintar al cambiar de idioma

  function cambiarPanel(nombre) {
    if (typeof global.trigHaptic === 'function') global.trigHaptic(20);
    PANELES.forEach(p => {
      const panel = document.getElementById('panel-' + p);
      const tab = document.getElementById('ptab-' + p);
      if (panel) panel.classList.toggle('hidden', p !== nombre);
      if (tab) { tab.classList.toggle('active', p === nombre); tab.setAttribute('aria-selected', p === nombre ? 'true' : 'false'); tab.tabIndex = p === nombre ? 0 : -1; }
    });
    const act = document.getElementById('ptab-' + nombre);
    if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function seguro(fn, d, c, titulo) {
    try { return fn(d, c); } catch (e) {
      console.error('Perfil:', titulo, e);
      return tarjeta(titulo, '', '<div class="empty-state pf-faltan">' + tr('No se pudo analizar esta sección con los datos del ZIP.') + '</div>');
    }
  }

  function render(d, seg, sig) {
    const tabs = document.getElementById('profileTabs');
    if (!tabs) return;
    ULTIMO = d ? { d, seg, sig } : null;
    if (!d) {
      tabs.classList.add('hidden');
      ESTADO.resumen = null; ESTADO.seg = []; ESTADO.sig = []; ESTADO.cmp = null; ESTADO.cmpHtml = ''; ESTADO.limp = null;
      PANELES.forEach(p => { if (p !== 'seguidores') { const el = document.getElementById('panel-' + p); if (el) el.innerHTML = ''; } });
      cambiarPanelSilencioso('resumen');
      return;
    }
    tabs.classList.remove('hidden');
    HTML_EN_ZIP = d.htmlOmitidos > 0;
    ESTADO.seg = seg || []; ESTADO.sig = sig || []; ESTADO.cmp = null; ESTADO.cmpHtml = ''; ESTADO.limp = null;
    const c = contexto(d, seg, sig);
    const mapa = {
      interacciones: [panelInteracciones, 'Interacciones'], limpieza: [panelLimpieza, 'Limpieza guiada'], actividad: [panelActividad, 'Actividad y hábitos'],
      mensajes: [panelMensajes, 'Mensajes'], contenido: [panelContenido, 'Contenido y cuenta']
    };
    Object.keys(mapa).forEach(k => {
      const el = document.getElementById('panel-' + k);
      const html = seguro(mapa[k][0], d, c, mapa[k][1]);
      if (el) el.innerHTML = html;
      const tab = document.getElementById('ptab-' + k);
      if (tab) tab.classList.toggle('sin-datos', html.includes('pf-faltan'));
    });
    renderLimpieza();
    const res = document.getElementById('panel-resumen');
    if (res) res.innerHTML = seguro(panelResumen, d, c, 'Resumen');
    renderComparar();
    ESTADO.resumen = Object.assign({ generado: new Date().toISOString(), secciones: secciones(d) }, c.res);
    cambiarPanelSilencioso('resumen');
  }
  // Teclado en las pestañas: flechas, Inicio y Fin
  document.addEventListener('keydown', e => {
    const tab = e.target && e.target.closest && e.target.closest('#profileTabs [role="tab"]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const lista = [...document.querySelectorAll('#profileTabs [role="tab"]')].filter(t => t.offsetParent !== null);
    let i = lista.indexOf(tab);
    if (e.key === 'ArrowRight') i = (i + 1) % lista.length;
    else if (e.key === 'ArrowLeft') i = (i - 1 + lista.length) % lista.length;
    else if (e.key === 'Home') i = 0; else i = lista.length - 1;
    e.preventDefault();
    lista[i].focus();
    lista[i].click();
  });

  function cambiarPanelSilencioso(n) {
    const h = global.trigHaptic; global.trigHaptic = null; cambiarPanel(n); global.trigHaptic = h;
  }

  // Al cambiar de idioma se repinta todo con los mismos datos, conservando pestaña, filtro y comparación.
  function repintar() {
    if (!ULTIMO) return;
    const activo = PANELES.find(p => { const el = document.getElementById('panel-' + p); return el && !el.classList.contains('hidden'); }) || 'resumen';
    const filtro = ESTADO.limp && ESTADO.limp.filtro, cmp = ESTADO.cmp;
    render(ULTIMO.d, ULTIMO.seg, ULTIMO.sig);
    if (filtro && ESTADO.limp) { ESTADO.limp.filtro = filtro; renderLimpieza(); }
    if (cmp) { ESTADO.cmp = cmp; ESTADO.cmpHtml = renderResultadoCmp(); renderComparar(); }
    cambiarPanelSilencioso(activo);
  }
  if (global.I18n) global.I18n.alAplicar(repintar);

  function exportarResumen() {
    if (!ESTADO.resumen) return;
    const txt = JSON.stringify(ESTADO.resumen, null, 2);
    if (typeof global.descargarArchivo === 'function') global.descargarArchivo('golifiar-resumen-perfil.json', txt, 'application/json');
  }

  global.Perfil = { nuevo, procesarEntrada, procesarHtml, tipoHtml, limpiezaAccion, limpiezaFiltro, limpiezaReiniciar, secciones, render, cambiarPanel, exportarResumen, guardarSnap, borrarSnap, compararSnap, compararZip,
    // expuesto para pruebas
    _int: { panelInteracciones, panelActividad, panelMensajes, panelContenido, contexto, fixText, dispositivo, serieDesdeMapa } };
})(typeof window !== 'undefined' ? window : globalThis);
