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
  const num = x => Number(x || 0).toLocaleString('es-ES');
  const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const DIAS_LARGO = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const diaIdx = dt => (dt.getDay() + 6) % 7;
  const fmtFecha = ts => ts ? new Date(ts * 1000).toLocaleDateString('es-ES') : '—';
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
        total: 0, emisores: new Map(), primero: Infinity, ultimo: 0, primerEmisor: '', ultimoEmisor: '', porMes: new Map()
      };
      d.hilos.set(dir, h);
    }
    for (const msg of j.messages) {
      const t = T(msg.timestamp_ms || msg.timestamp);
      if (!t) continue;
      const s = fixText(msg.sender_name || '');
      h.total++;
      h.emisores.set(s, (h.emisores.get(s) || 0) + 1);
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
  const secciones = d => d ? [...d.archivos].map(k => NOMBRES_SECCION[k] || k) : [];

  /* ============================ componentes HTML ============================ */
  const tarjeta = (titulo, sub, cuerpo) =>
    `<section class="pf-card"><h3>${esc(titulo)}</h3>${sub ? `<p class="pf-sub">${sub}</p>` : ''}${cuerpo}</section>`;

  const metricas = arr => `<div class="metrics-grid">${arr.map(([l, v, cls]) =>
    `<div class="metric-card"><div class="metric-label">${esc(l)}</div><div class="metric-number ${cls || ''}">${esc(v)}</div></div>`).join('')}</div>`;

  const nota = t => `<p class="pf-note">${t}</p>`;

  let HTML_EN_ZIP = false;
  const faltan = (titulo, pista) => tarjeta(titulo, '',
    `<div class="empty-state pf-faltan">${HTML_EN_ZIP ? 'Tu descarga está en formato HTML y este análisis necesita JSON.' : 'Tu ZIP no incluye estos datos.'}<br><small>Vuelve a pedir la descarga en Instagram marcando «${esc(pista)}» y eligiendo formato <strong>JSON</strong>.</small><br><button class="pf-link" type="button" onclick="mostrarAyudaDescarga()">Ver cómo descargarla</button></div>`);

  const tabla = (cab, filas) => `<details class="pf-tabla"><summary>Ver como tabla</summary><table><thead><tr>${
    cab.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${
    filas.map(f => `<tr>${f.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></details>`;

  const badge = (t, cls) => `<span class="${cls || 'pf-badge'}">${esc(t)}</span>`;

  // Barras horizontales: filas = [{label, valor, detalle, badge:[texto, clase], href}]
  function barrasH(filas, unidad, tope) {
    if (!filas.length) return '<div class="empty-state">Sin datos para mostrar.</div>';
    const max = tope || Math.max(1, ...filas.map(f => f.valor));
    return '<div class="pf-hbars">' + filas.map(f => {
      const w = Math.max(1, Math.round(f.valor / max * 100));
      const lab = f.href ? `<a href="${esc(f.href)}" target="_blank" rel="noopener noreferrer">${esc(f.label)}</a>` : esc(f.label);
      return `<div class="pf-hrow" title="${esc(f.label)}: ${num(f.valor)} ${esc(unidad || '')}">
        <span class="pf-hlabel">${lab}</span>
        <span class="pf-htrack"><span class="pf-hbar" style="width:${w}%"></span></span>
        <span class="pf-hval">${num(f.valor)}${unidad === '%' ? ' %' : ''}</span>
        ${(f.detalle || f.badge) ? `<span class="pf-hdet">${f.badge ? badge(f.badge[0], f.badge[1]) + ' ' : ''}${esc(f.detalle || '')}</span>` : ''}
      </div>`;
    }).join('') + '</div>';
  }

  // Columnas verticales. valores/etiquetas/detalles tienen la misma longitud.
  function columnas(valores, etiquetas, detalles, unidad, titulo) {
    const max = maxDe(valores);
    if (!max) return '<div class="empty-state">Sin datos para mostrar.</div>';
    const paso = Math.max(1, Math.ceil(valores.length / 8));
    const iMax = valores.indexOf(max);
    const cols = valores.map((v, i) => {
      const h = v ? Math.max(2, Math.round(v / max * 100)) : 0;
      return `<div class="pf-col" title="${esc(detalles[i])}: ${num(v)} ${esc(unidad)}">
        ${i === iMax ? `<span class="pf-colval" style="bottom:calc(${h}% + 2px)">${num(v)}</span>` : ''}
        <span class="pf-colbar" style="height:${h}%"></span></div>`;
    }).join('');
    const labs = etiquetas.map((e, i) => `<span class="pf-lab">${i % paso === 0 ? esc(e) : ''}</span>`).join('');
    const filas = valores.map((v, i) => [detalles[i], num(v)]).filter(f => f[1] !== '0');
    return `<div role="img" aria-label="${esc(titulo)}"><div class="pf-cols">${cols}</div><div class="pf-labs">${labs}</div></div>` +
      tabla(['Periodo', unidad], filas);
  }

  function colHoras(horas, unidad, titulo) {
    return columnas(horas, horas.map((_, i) => String(i)), horas.map((_, i) => `${i}:00–${i}:59`), unidad, titulo);
  }
  function colDias(dias, unidad, titulo) {
    return columnas(dias, DIAS, DIAS_LARGO.map(x => x[0].toUpperCase() + x.slice(1)), unidad, titulo);
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
        et.push(f.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }).replace('.', ''));
        det.push(f.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }));
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
  const colSerie = (s, unidad, titulo) => s ? columnas(s.val, s.et, s.det, unidad, titulo) : '<div class="empty-state">Sin datos para mostrar.</div>';

  function histHoras(ts) { const h = new Array(24).fill(0); for (const t of ts) h[new Date(t * 1000).getHours()]++; return h; }
  function histDias(ts) { const h = new Array(7).fill(0); for (const t of ts) h[diaIdx(new Date(t * 1000))]++; return h; }
  function heatDe(ts, heat) { for (const t of ts) { const dt = new Date(t * 1000); heat[diaIdx(dt) * 24 + dt.getHours()]++; } }

  const calor = pct => `color-mix(in srgb, var(--accent-blue) ${Math.round(pct)}%, transparent)`;
  function mapaCalor(heat) {
    const max = maxDe(heat);
    let h = '<div class="pf-heatwrap"><div class="pf-heat" role="img" aria-label="Mapa de actividad por día de la semana y hora"><span></span>';
    for (let i = 0; i < 24; i++) h += `<span class="pf-heath">${i % 3 === 0 ? i : ''}</span>`;
    for (let d = 0; d < 7; d++) {
      h += `<span class="pf-heatd">${DIAS[d]}</span>`;
      for (let i = 0; i < 24; i++) {
        const v = heat[d * 24 + i];
        const st = v ? `style="background:${calor(12 + 88 * v / max)}"` : '';
        h += `<span class="pf-hc" ${st} title="${DIAS[d]} ${i}:00 · ${num(v)}"></span>`;
      }
    }
    return h + '</div></div><div class="pf-heatkey"><span>menos</span>' +
      [12, 45, 75, 100].map(p => `<i style="background:${calor(p)}"></i>`).join('') + '<span>más</span></div>';
  }

  function filaUsuario(u, texto, cls) {
    return `<div class="user-card"><a href="${esc(ig(u))}" target="_blank" rel="noopener noreferrer" class="user-link">@${esc(u)}</a>` +
      `<div class="user-actions">${texto ? `<span class="${cls || 'pf-badge'}">${esc(texto)}</span>` : ''}</div></div>`;
  }
  function desplegable(titulo, filas, vacio) {
    return `<details class="pf-det"><summary>${esc(titulo)}</summary>${
      filas.length ? `<div class="results-list">${filas.join('')}</div>` : `<div class="empty-state">${esc(vacio || 'Sin registros.')}</div>`}</details>`;
  }
  const leyenda2 = (a, b) => `<div class="pf-legend"><span><i class="pf-key a"></i>${esc(a)}</span><span><i class="pf-key b"></i>${esc(b)}</span></div>`;

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
    if (sigo && meSigue) return ['Mutuo', 'badge-mutual'];
    if (sigo) return ['No te sigue', 'badge-status'];
    if (meSigue) return ['Te sigue', 'badge-fan'];
    return ['No lo sigues', 'pf-badge'];
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
    const score = r => r.likes + 2 * r.com + r.guard;
    const ranking = [...P.values()].filter(r => score(r) > 0).sort((a, b) => score(b) - score(a));
    const detalle = r => [r.likes && `${num(r.likes)} me gusta`, r.com && `${num(r.com)} comentarios`, r.guard && `${num(r.guard)} guardados`].filter(Boolean).join(' · ');
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
      html += tarjeta(`Interactúas con ${num(sinRetorno.length)} cuentas que no te siguen`,
        'Las que más atención recibes de ti sin seguirte de vuelta.',
        barrasH(sinRetorno.slice(0, 8).map(fila), 'puntos'));
      c.res.interacciones.interactuasSinRetorno = sinRetorno.length;
    }

    if (c.seguidosObjs.length && (nLikes + d.com.total + d.guardadosTotal) > 0) {
      const frios = c.seguidosObjs.filter(o => !P.has(o.username)).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      c.res.interacciones.seguidosSinInteraccion = frios.length;
      html += tarjeta(`Sigues a ${num(frios.length)} cuentas sin ninguna interacción`,
        'Cuentas que sigues y a las que no has dado me gusta, comentado, guardado ni buscado según tu ZIP. Candidatas a revisar.',
        desplegable('Ver lista (las que sigues desde hace más tiempo primero)',
          frios.slice(0, 200).map(o => filaUsuario(o.username, o.timestamp ? 'desde ' + fmtFecha(o.timestamp) : '', 'pf-badge'))) +
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
      html += nota(`Longitud media de tus comentarios: ${Math.round(d.com.largo / d.com.total)} caracteres · ${num(d.com.reels)} en reels.`);
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
        `Combina me gusta, comentarios, búsquedas, guardados, accesos, publicaciones y mensajes enviados. Tu franja más fuerte: <strong>${DIAS_LARGO[Math.floor(pico / 24)]} a las ${pico % 24}:00</strong>. Tu hora habitual: <strong>${hPico}:00</strong> y tu día más activo: <strong>${DIAS_LARGO[dPico]}</strong>.`,
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
      if (sS) { const i = sS.val.indexOf(maxDe(sS.val)); pista = `Tu mejor ${sS.unidadTiempo} fue <strong>${esc(sS.det[i])}</strong> con ${num(sS.val[i])} seguidores nuevos.`; c.res.mejorPeriodoSeguidores = { periodo: sS.det[i], nuevos: sS.val[i] }; }
      html += `<div class="pf-two">${
        tarjeta('Seguidores nuevos', pista, colSerie(sS, 'seguidores nuevos', 'Seguidores nuevos por periodo'))}${
        tarjeta('Cuentas que has empezado a seguir', 'Fecha en la que seguiste a cada cuenta.', colSerie(sG, 'cuentas seguidas', 'Cuentas seguidas por periodo'))}</div>`;
    }
    return html;
  }

  function dispositivo(ua) {
    ua = ua || '';
    let so = 'Otro';
    if (/iPhone/i.test(ua)) so = 'iPhone'; else if (/iPad/i.test(ua)) so = 'iPad';
    else if (/Android/i.test(ua)) so = 'Android'; else if (/Windows/i.test(ua)) so = 'Windows';
    else if (/Macintosh|Mac OS/i.test(ua)) so = 'Mac'; else if (/Linux/i.test(ua)) so = 'Linux';
    else if (!ua) so = 'Desconocido';
    const app = /Instagram\s[\d.]+/i.test(ua) ? 'app' : (ua ? 'navegador' : '');
    return app ? `${so} · ${app}` : so;
  }

  function panelMensajes(d, c) {
    if (!d.hilos.size) return faltan('Mensajes', 'Mensajes');
    let hilos = [...d.hilos.values()].filter(h => h.bandeja === 'inbox' || h.bandeja === 'archived_threads');
    if (!hilos.length) hilos = [...d.hilos.values()];
    const yo = c.yo;
    hilos.forEach(h => { h.grupo = new Set([...h.participantes, ...h.emisores.keys()]).size > 2; });
    const nombre = h => h.titulo || [...h.emisores.keys()].filter(x => x !== yo).join(', ') || '(sin nombre)';
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
          return `<div class="pf-hrow pf-hrow2" title="${esc(nombre(h))}: ${num(a)} tuyos, ${num(b)} de los demás">
            <span class="pf-hlabel">${esc(nombre(h))}${h.grupo ? ' ' + badge('grupo') : ''}</span>
            <span class="pf-stack"><span class="pf-seg a" style="flex:${a || 0.0001}"></span><span class="pf-seg b" style="flex:${b || 0.0001}"></span></span>
            <span class="pf-hval">${num(h.total)}</span></div>`;
        }).join('') + '</div>');
    } else {
      html += tarjeta('Conversaciones con más mensajes', '', barrasH(top.map(h => ({ label: nombre(h), valor: h.total })), 'mensajes'));
    }

    if (yo) {
      const uno = hilos.filter(h => !h.grupo && h.total >= 2);
      const inicie = uno.filter(h => h.primerEmisor === yo).length;
      if (uno.length) {
        c.res.mensajes.iniciasteConversaciones = `${inicie}/${uno.length}`;
        html += tarjeta('Quién da el primer paso',
          `En ${num(uno.length)} chats 1 a 1, tú escribiste primero en <strong>${num(inicie)}</strong> (${Math.round(inicie / uno.length * 100)} %) y la otra persona en ${num(uno.length - inicie)}.`,
          nota('Se calcula con el primer mensaje que aparece en tu ZIP; si pediste un rango de fechas, puede no ser el primer mensaje real.'));
      }
      const pendientes = hilos.filter(h => !h.grupo && h.total >= 3 && h.ultimoEmisor && h.ultimoEmisor !== yo)
        .sort((a, b) => b.ultimo - a.ultimo);
      c.res.mensajes.esperandoRespuesta = pendientes.length;
      html += tarjeta(`Esperan tu respuesta (${num(pendientes.length)})`,
        'Chats 1 a 1 en los que el último mensaje es de la otra persona.',
        desplegable('Ver los 15 más recientes', pendientes.slice(0, 15).map(h =>
          `<div class="user-card"><span class="user-link">${esc(nombre(h))}</span><div class="user-actions"><span class="pf-badge">${fmtFecha(h.ultimo)} · hace ${num(diasDesde(h.ultimo))} d</span></div></div>`)));
      const frios = hilos.filter(h => !h.grupo && h.total >= 50 && diasDesde(h.ultimo) > 365).sort((a, b) => b.total - a.total);
      c.res.mensajes.chatsFrios = frios.length;
      html += tarjeta(`Chats que se enfriaron (${num(frios.length)})`,
        'Conversaciones con 50 o más mensajes y sin actividad desde hace más de un año.',
        desplegable('Ver los 15 con más historia', frios.slice(0, 15).map(h =>
          `<div class="user-card"><span class="user-link">${esc(nombre(h))}</span><div class="user-actions"><span class="pf-badge">${num(h.total)} msgs · último ${fmtFecha(h.ultimo)}</span></div></div>`)));
    }

    const porMes = new Map();
    hilos.forEach(h => h.porMes.forEach((v, k) => porMes.set(k, (porMes.get(k) || 0) + v)));
    html += `<div class="pf-two">${tarjeta('Mensajes por periodo', 'Todos los chats.', colSerie(serieDesdeMapa(porMes), 'mensajes', 'Mensajes por periodo'))}${
      yo && d.actMsg.has(yo) ? tarjeta('A qué hora escribes', 'Mensajes enviados por ti, hora local.', colHoras(d.actMsg.get(yo).horas, 'mensajes', 'Mensajes enviados por hora')) : ''}</div>`;
    html += nota('Solo se cuentan mensajes y fechas. El contenido de tus chats no se guarda ni se muestra.');
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
      if (pub.length) extra.push(`Primera publicación: <strong>${fmtFecha(pub[0])}</strong> · última: <strong>${fmtFecha(pub[pub.length - 1])}</strong>.`);
      if (gapMax > 1) extra.push(`Tu pausa más larga fue de <strong>${num(Math.round(gapMax))} días</strong>, desde el ${fmtFecha(gapIni)}.`);
      const conCarrusel = d.posts.filter(x => x.n > 1).length;
      if (d.posts.length) extra.push(`${num(conCarrusel)} de tus publicaciones son carruseles.`);
      html += tarjeta('Ritmo de publicación', extra.join(' '), colSerie(serieTs(todo), 'publicaciones', 'Contenido publicado por periodo'));
      html += `<div class="pf-two">${tarjeta('Día de la semana', 'Cuándo publicas.', colDias(histDias(todo), 'publicaciones', 'Publicaciones por día'))}${
        tarjeta('Hora del día', 'Hora local de tu dispositivo.', colHoras(histHoras(todo), 'publicaciones', 'Publicaciones por hora'))}</div>`;
    }

    if (hayCuenta) {
      let cuenta = '';
      if (d.perfil) {
        const p = d.perfil;
        cuenta += metricas([
          ['Usuario', p.usuario ? '@' + p.usuario : '—'], ['Nombre', p.nombre || '—'],
          ['Cuenta', p.privada ? 'Privada' : 'Pública'], ['Cambios de perfil', num(d.cambios.length)]
        ]);
      }
      if (d.cambios.length) {
        const cs = d.cambios.slice().sort((a, b) => b.ts - a.ts).slice(0, 15);
        cuenta += tarjeta('Historial de cambios del perfil', 'Qué cambiaste y cuándo.',
          desplegable(`Ver cambios (${d.cambios.length})`, cs.map(x =>
            `<div class="user-card"><span class="user-link">${esc(x.que || 'Cambio')}${x.antes || x.despues ? ': ' + esc(x.antes || '—') + ' → ' + esc(x.despues || '—') : ''}</span><div class="user-actions"><span class="pf-badge">${fmtFecha(x.ts)}</span></div></div>`)));
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
        det.push(desplegable(`Dejaste de seguir recientemente (${r.dejados.length})`, ord.map(o => {
          const te = c.seguidores.has(o.username);
          return filaUsuario(o.username, (o.timestamp ? fmtFecha(o.timestamp) : '') + (c.hayRel ? (te ? ' · aún te sigue' : ' · no te sigue') : ''), te ? 'badge-fan' : 'pf-badge');
        })));
      }
      if (r.enviadas.length) {
        const ord = r.enviadas.slice().sort((a, b) => a.timestamp - b.timestamp);
        det.push(desplegable(`Solicitudes enviadas sin respuesta (${r.enviadas.length})`, ord.map(o =>
          filaUsuario(o.username, o.timestamp ? `hace ${num(diasDesde(o.timestamp))} d` : '', 'pf-badge'))));
      }
      if (r.recibidas.length) det.push(desplegable(`Solicitudes recibidas (${r.recibidas.length})`, r.recibidas.map(o => filaUsuario(o.username, o.timestamp ? fmtFecha(o.timestamp) : ''))));
      if (r.bloqueados.length) det.push(desplegable(`Perfiles bloqueados (${r.bloqueados.length})`, r.bloqueados.map(o => filaUsuario(o.username, o.timestamp ? fmtFecha(o.timestamp) : ''))));
      if (r.restringidos.length) det.push(desplegable(`Perfiles restringidos (${r.restringidos.length})`, r.restringidos.map(o => filaUsuario(o.username, o.timestamp ? fmtFecha(o.timestamp) : ''))));
      if (r.cercanos.length) det.push(desplegable(`Amigos cercanos (${r.cercanos.length})`, r.cercanos.map(o => filaUsuario(o.username, c.hayRel ? (c.seguidores.has(o.username) ? 'te sigue' : 'no te sigue') : ''))));
      if (r.hashtags.length) det.push(desplegable(`Hashtags que sigues (${r.hashtags.length})`, r.hashtags.map(o => `<div class="user-card"><span class="user-link">#${esc(o.username)}</span></div>`)));
      if (det.length) cuenta += tarjeta('Relaciones y listas', 'Despliega cada lista para verla.', det.join(''));

      if (d.anunciantes.length) {
        c.res.cuenta = Object.assign(c.res.cuenta || {}, { anunciantesConTusDatos: d.anunciantes.length });
        cuenta += tarjeta(`${num(d.anunciantes.length)} anunciantes usan tu actividad o información`,
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
    return `<svg class="pf-ring" viewBox="0 0 120 120" role="img" aria-label="Puntuación ${p} de 100">
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
    if (nSeg) comp.push({ label: 'Reciprocidad', valor: Math.round(mutuos / nSeg * 100), detalle: `${num(mutuos)} de las ${num(nSeg)} cuentas que sigues te siguen.` });
    const ri = c.res.interacciones;
    if (ri && nSeg && ri.seguidosSinInteraccion != null) comp.push({ label: 'Interacción real', valor: Math.round((1 - ri.seguidosSinInteraccion / nSeg) * 100), detalle: `Interactúas con ${num(nSeg - ri.seguidosSinInteraccion)} de las ${num(nSeg)} cuentas que sigues.` });
    const rm = c.res.mensajes;
    if (rm && rm.uno > 0 && rm.esperandoRespuesta != null) comp.push({ label: 'Mensajes al día', valor: Math.round((1 - rm.esperandoRespuesta / rm.uno) * 100), detalle: `${num(rm.esperandoRespuesta)} de ${num(rm.uno)} chats 1 a 1 esperan tu respuesta.` });

    let html = '';
    if (d.htmlOmitidos > 0) {
      html += tarjeta('Tu descarga está en HTML', 'Se han leído seguidores, seguidos y listas de cuentas. Las interacciones, la actividad, los mensajes y el contenido solo se pueden analizar con la descarga en formato JSON.',
        `<button class="btn-sub" type="button" onclick="mostrarAyudaDescarga()">Ver cómo pedirla en JSON</button>`);
    }
    if (comp.length) {
      const score = Math.round(sum(comp.map(x => x.valor)) / comp.length);
      c.res.resumen = { puntuacion: score, componentes: comp.map(x => ({ nombre: x.label, valor: x.valor })) };
      html += `<section class="pf-hero"><div class="pf-hero-ring">${anillo(score)}</div><div class="pf-hero-body">
        <h3>Salud de tu perfil</h3>
        <p>${comp.length === 1 ? 'Se calcula con un indicador' : 'Media de ' + comp.length + ' indicadores calculados'} a partir de tu ZIP. Es una referencia propia de Golifiar, no una métrica de Instagram.</p>
        ${barrasH(comp.map(x => ({ label: x.label, valor: x.valor, detalle: x.detalle })), '%', 100)}</div></section>`;
    }

    const h = [];
    if (nSeg && sinRet) h.push([`Sigues a ${num(sinRet)} cuentas que no te siguen.`, 'seguidores', 'Ver lista']);
    if (fans) h.push([`${num(fans)} cuentas te siguen y tú no las sigues.`, 'seguidores', 'Ver fans']);
    if (ri && ri.seguidosSinInteraccion) h.push([`Sigues a ${num(ri.seguidosSinInteraccion)} cuentas sin ninguna interacción registrada.`, 'interacciones', 'Revisar']);
    if (ri && ri.interactuasSinRetorno) h.push([`Interactúas con ${num(ri.interactuasSinRetorno)} cuentas que no te siguen.`, 'interacciones', 'Ver cuáles']);
    if (rm && rm.esperandoRespuesta) h.push([`${num(rm.esperandoRespuesta)} chats esperan tu respuesta.`, 'mensajes', 'Ver chats']);
    if (rm && rm.chatsFrios) h.push([`${num(rm.chatsFrios)} chats con historia llevan más de un año parados.`, 'mensajes', 'Ver chats']);
    const ra = c.res.actividad;
    if (ra && ra.horaMasActiva != null) h.push([`Tu hora más activa es a las ${ra.horaMasActiva}:00 y tu día más activo, el ${ra.diaMasActivo}.`, 'actividad', 'Ver actividad']);
    const rc = c.res.contenido;
    if (rc && rc.diasMediosEntrePublicaciones) h.push([`Publicas, de media, cada ${num(rc.diasMediosEntrePublicaciones)} días.`, 'contenido', 'Ver ritmo']);
    const rcu = c.res.cuenta;
    if (rcu && rcu.anunciantesConTusDatos) h.push([`${num(rcu.anunciantesConTusDatos)} anunciantes usan tu actividad o información.`, 'contenido', 'Ver anunciantes']);

    if (h.length) {
      html += tarjeta('Lo que destaca', '', `<ul class="pf-finds">${h.map(([t, tab, b]) => `<li><span>${esc(t)}</span>${irA(tab, b)}</li>`).join('')}</ul>`);
    }

    const tiene = secciones(d);
    const todas = ['me gusta', 'comentarios', 'mensajes', 'accesos', 'publicaciones', 'datos de cuenta'];
    const faltan_ = todas.filter(x => !tiene.includes(x));
    html += tarjeta(comp.length || h.length ? 'Datos que se han leído' : 'Aún hay poco que analizar',
      comp.length || h.length ? '' : 'Para que aparezcan la puntuación y las conclusiones hacen falta, como mínimo, los seguidores y los seguidos.',
      `<div class="pf-chips">${tiene.map(x => `<span class="pf-chip on">${esc(x)}</span>`).join('') || ''}${faltan_.map(x => `<span class="pf-chip">${esc(x)}</span>`).join('')}</div>` +
      (faltan_.length ? nota('Las etiquetas atenuadas no venían en tu ZIP. Para añadirlas, vuelve a pedir la descarga a Instagram marcando esa información en formato JSON.') : ''));
    return html;
  }

  /* ============================== comparar descargas ============================== */
  const CLAVE_SNAP = 'golifiar-snapshots';
  const leerSnaps = () => { try { return JSON.parse(localStorage.getItem(CLAVE_SNAP) || '[]'); } catch (e) { return []; } };
  const escribirSnaps = a => { try { localStorage.setItem(CLAVE_SNAP, JSON.stringify(a)); return true; } catch (e) { return false; } };
  const aviso = t => { if (typeof global.mostrarToast === 'function') global.mostrarToast(t); };

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
    const lst = (t, arr, txt) => desplegable(`${t} (${num(arr.length)})`, arr.slice(0, 500).map(u => filaUsuario(u, txt)), 'Ninguno.');
    return tarjeta(`Cambios desde «${etiqueta}»`, 'Comparado con el análisis que tienes abierto.',
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
      `<div class="user-card"><span class="user-link">${esc(new Date(x.date).toLocaleDateString('es-ES'))}</span><div class="user-actions"><span class="pf-badge">${num(x.seg.length)} seguidores · ${num(x.sig.length)} seguidos</span>
        <button class="user-mark" type="button" onclick="Perfil.compararSnap(${x.id})">Comparar</button><button class="user-mark" type="button" onclick="Perfil.borrarSnap(${x.id})">Borrar</button></div></div>`).join('')}</div>`
      : '<div class="empty-state">Todavía no has guardado ninguna descarga.</div>';
    el.innerHTML =
      tarjeta('Comparar con una descarga anterior', 'Sube un ZIP antiguo de Instagram y verás quién dejó de seguirte, quién te sigue desde entonces y a quién has dejado de seguir. El ZIP se lee en tu dispositivo y no se guarda.',
        `<label class="btn-sub pf-upload"><input type="file" accept=".zip" onchange="Perfil.compararZip(this)"> Elegir ZIP anterior</label>`) +
      tarjeta('Descargas guardadas', 'Guarda esta descarga para compararla en el futuro sin conservar el ZIP. Solo se guardan los nombres de usuario de tus seguidores y seguidos, en este dispositivo.',
        `<div class="panel-actions"><button class="btn-sub" type="button" onclick="Perfil.guardarSnap()">Guardar esta descarga</button></div>${lista}`) +
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
    if (x) comparar(x, new Date(x.date).toLocaleDateString('es-ES'));
  }

  async function compararZip(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      if (typeof global.JSZip === 'undefined' || typeof global.extraerUsuarios !== 'function' || typeof global.extraerUsuariosHtml !== 'function') throw new Error('Falta JSZip');
      const zip = await global.JSZip.loadAsync(file);
      let seg = [], sig = [];
      const nombres = [];
      zip.forEach((ruta, ent) => { if (!ent.dir) nombres.push([ruta, ent]); });
      for (const [ruta, ent] of nombres) {
        const base = ruta.toLowerCase().split('/').pop();
        if (/^followers(_\d+)?\.json$/.test(base)) seg = seg.concat(global.extraerUsuarios(JSON.parse(await ent.async('string'))));
        else if (base === 'following.json') sig = global.extraerUsuarios(JSON.parse(await ent.async('string')));
        else if (/^followers(_\d+)?\.html?$/.test(base)) seg = seg.concat(global.extraerUsuariosHtml(await ent.async('string')));
        else if (/^following\.html?$/.test(base)) sig = global.extraerUsuariosHtml(await ent.async('string'));
      }
      if (!seg.length && !sig.length) { aviso('Ese ZIP no contiene seguidores ni seguidos (JSON o HTML).'); return; }
      comparar({ seg: seg.map(o => o.username), sig: sig.map(o => o.username) }, file.name.replace(/\.zip$/i, ''));
    } catch (e) {
      console.error('Perfil: comparar ZIP', e);
      aviso('No se pudo leer ese ZIP. Comprueba que sea una descarga completa de Instagram.');
    } finally { input.value = ''; }
  }

  /* ================================ interfaz ================================ */
  const PANELES = ['resumen', 'seguidores', 'interacciones', 'actividad', 'mensajes', 'contenido', 'comparar'];
  const ESTADO = { resumen: null, seg: [], sig: [], cmp: null, cmpHtml: '' };

  function cambiarPanel(nombre) {
    if (typeof global.trigHaptic === 'function') global.trigHaptic(20);
    PANELES.forEach(p => {
      const panel = document.getElementById('panel-' + p);
      const tab = document.getElementById('ptab-' + p);
      if (panel) panel.classList.toggle('hidden', p !== nombre);
      if (tab) { tab.classList.toggle('active', p === nombre); tab.setAttribute('aria-selected', p === nombre ? 'true' : 'false'); }
    });
    const act = document.getElementById('ptab-' + nombre);
    if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function seguro(fn, d, c, titulo) {
    try { return fn(d, c); } catch (e) {
      console.error('Perfil:', titulo, e);
      return tarjeta(titulo, '', '<div class="empty-state pf-faltan">No se pudo analizar esta sección con los datos del ZIP.</div>');
    }
  }

  function render(d, seg, sig) {
    const tabs = document.getElementById('profileTabs');
    if (!tabs) return;
    if (!d) {
      tabs.classList.add('hidden');
      ESTADO.resumen = null; ESTADO.seg = []; ESTADO.sig = []; ESTADO.cmp = null; ESTADO.cmpHtml = '';
      PANELES.forEach(p => { if (p !== 'seguidores') { const el = document.getElementById('panel-' + p); if (el) el.innerHTML = ''; } });
      cambiarPanelSilencioso('resumen');
      return;
    }
    tabs.classList.remove('hidden');
    HTML_EN_ZIP = d.htmlOmitidos > 0;
    ESTADO.seg = seg || []; ESTADO.sig = sig || []; ESTADO.cmp = null; ESTADO.cmpHtml = '';
    const c = contexto(d, seg, sig);
    const mapa = {
      interacciones: [panelInteracciones, 'Interacciones'], actividad: [panelActividad, 'Actividad y hábitos'],
      mensajes: [panelMensajes, 'Mensajes'], contenido: [panelContenido, 'Contenido y cuenta']
    };
    Object.keys(mapa).forEach(k => {
      const el = document.getElementById('panel-' + k);
      const html = seguro(mapa[k][0], d, c, mapa[k][1]);
      if (el) el.innerHTML = html;
      const tab = document.getElementById('ptab-' + k);
      if (tab) tab.classList.toggle('sin-datos', html.includes('pf-faltan'));
    });
    const res = document.getElementById('panel-resumen');
    if (res) res.innerHTML = seguro(panelResumen, d, c, 'Resumen');
    renderComparar();
    ESTADO.resumen = Object.assign({ generado: new Date().toISOString(), secciones: secciones(d) }, c.res);
    cambiarPanelSilencioso('resumen');
  }
  function cambiarPanelSilencioso(n) {
    const h = global.trigHaptic; global.trigHaptic = null; cambiarPanel(n); global.trigHaptic = h;
  }

  function exportarResumen() {
    if (!ESTADO.resumen) return;
    const txt = JSON.stringify(ESTADO.resumen, null, 2);
    if (typeof global.descargarArchivo === 'function') global.descargarArchivo('golifiar-resumen-perfil.json', txt, 'application/json');
  }

  global.Perfil = { nuevo, procesarEntrada, procesarHtml, tipoHtml, secciones, render, cambiarPanel, exportarResumen, guardarSnap, borrarSnap, compararSnap, compararZip,
    // expuesto para pruebas
    _int: { panelInteracciones, panelActividad, panelMensajes, panelContenido, contexto, fixText, dispositivo, serieDesdeMapa } };
})(typeof window !== 'undefined' ? window : globalThis);
