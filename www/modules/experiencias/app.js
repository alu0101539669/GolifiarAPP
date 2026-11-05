/* Interfaz de experiencias: todos los datos importados permanecen solo en memoria. */
(function (root) {
  'use strict';
  const E = () => root.GolifiarExperienciasEngine;
  const state = { tab: 'resumen', chats: [], selected: 0, compareA: '', compareB: '', chemistryA: '', chemistryB: '', quizIndex: 0, quizScore: 0, quiz: [], topicsEnabled: false, cardTheme: 'ocean', cardShowWords: true, cardShowStreak: true, range: 'all', from: '', to: '', anon: false, cardLook: 'glass', avatars: [null, null], slide: 0, mount: 'experienciasResults', hd: false, noMark: false, edit: { on: false, bg1: '#0f0f14', bg2: '#2a2210', accent: '#FFD21F', text: '#ffffff', font: 'sans', numY: 1000 }, compare: null };
  const tr = (s, p) => typeof root.t === 'function' ? root.t(s, p) : s;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = n => new Intl.NumberFormat(root.I18n ? I18n.locale : undefined, { useGrouping: 'always', maximumFractionDigits: 1 }).format(n);
  const fmtDate = ts => new Date(ts).toLocaleDateString(root.I18n ? I18n.locale : undefined);
  // Rol de desarrollo: con #dev o ?dev se activa el Premium de demostración en este dispositivo (solo cliente, sin valor de seguridad).
  try { if (/(^|[#&?])dev($|[=&])/.test(root.location.hash + root.location.search)) localStorage.setItem('golifiar-dev', '1'); } catch (e) { /* sin almacenamiento */ }
  function node(id) { return document.getElementById(id); }
  function selectedChat() { return state.chats[state.selected] || null; }
  function rangeMessages(chat) {
    const all = chat.messages; if (state.range === 'all') return all;
    const last = all.length ? all[all.length - 1].timestamp : Date.now(); let a = -Infinity, b = Infinity;
    if (state.range === 'year') a = last - 365 * 86400000;
    else if (state.range === 'summer') { const y = new Date(last).getMonth() >= 5 ? new Date(last).getFullYear() : new Date(last).getFullYear() - 1; a = new Date(y, 5, 21).getTime(); b = new Date(y, 8, 22).getTime(); }
    else if (state.range === 'custom') { if (state.from) a = new Date(state.from + 'T00:00:00').getTime(); if (state.to) b = new Date(state.to + 'T23:59:59').getTime(); }
    const out = all.filter(m => m.timestamp >= a && m.timestamp <= b);
    Object.defineProperty(out, 'system', { value: (all.system || []).filter(e => e.timestamp >= a && e.timestamp <= b), enumerable: false });
    return out;
  }
  function msgText(message) { return message && typeof message.text === 'string' ? message.text : ''; }

  async function readChunks(file, onProgress) {
    const dec = new TextDecoder('utf-8'), parts = []; const SIZE = 4 * 1024 * 1024;
    for (let off = 0; off < file.size; off += SIZE) {
      parts.push(dec.decode(await file.slice(off, off + SIZE).arrayBuffer(), { stream: true }));
      onProgress(Math.min(1, (off + SIZE) / file.size));
      await new Promise(r => setTimeout(r, 0));
    }
    parts.push(dec.decode()); return parts.join('');
  }
  function setProgress(v) {
    document.querySelectorAll('.dropzone .dz-progress').forEach(el => { if (!el.closest('.dropzone').contains(node('exWhatsAppFiles'))) return; el.hidden = v === null; const i = el.firstElementChild; if (i) i.style.width = `${Math.round((v || 0) * 100)}%`; });
  }
  // Chats grandes (más de ~5 MB, unos 100.000 mensajes) se analizan en un Worker; si no se puede crear, se usa el hilo principal.
  function parseAsync(text, name, size) {
    const sync = () => E().parseWhatsApp(text, name);
    if (!root.Worker || (size || text.length) < 5 * 1024 * 1024) return Promise.resolve(sync());
    return new Promise(resolve => {
      let w; try { w = new Worker('./modules/experiencias/worker.js'); } catch (e) { resolve(sync()); return; }
      const fin = v => { try { w.terminate(); } catch (e) { /* ya cerrado */ } resolve(v); };
      w.onmessage = ev => {
        if (!ev.data.ok) return fin(sync());
        const arr = ev.data.messages;
        Object.defineProperty(arr, 'system', { value: ev.data.system, enumerable: false });
        Object.defineProperty(arr, 'dateOrder', { value: ev.data.dateOrder, enumerable: false });
        fin(arr);
      };
      w.onerror = () => fin(sync());
      w.postMessage({ text, name });
    });
  }
  async function importWhatsApp(input) {
    const files = [...(input.files || [])]; if (!files.length) return;
    const file = files[0];
    if (files.length > 1) showStatus(tr('Solo se analiza un chat por sesión; se ha usado el primero.'), false);
    if (!/\.txt$/i.test(file.name) && file.type !== 'text/plain') { showModal(tr('Este archivo no es un .txt de WhatsApp. Exporta el chat desde WhatsApp → Más → Exportar chat → Sin multimedia.')); input.value = ''; return; }
    try {
      setProgress(0);
      const messages = await parseAsync(await readChunks(file, setProgress), file.name.replace(/\.txt$/i, ''), file.size);
      if (!messages.length) throw new Error(tr('No se encontraron mensajes con un formato compatible.'));
      state.chats = state.chats.filter(c => c.platform !== 'WhatsApp');
      state.chats.unshift({ name: file.name.replace(/\.txt$/i, ''), platform: 'WhatsApp', messages });
      state.selected = 0; state.range = 'all'; state.mount = 'experienciasResults';
      showStatus(tr('Importación completada: {n} conversaciones.', { n: 1 }), false); setTag('exTagWhatsApp', 1); sound('ok'); render();
    } catch (err) { showModal(`${file.name}: ${err.message || tr('No se pudo importar el archivo.')}`); }
    setProgress(null); input.value = '';
  }
  function showModal(text, img) {
    let m = node('exModal');
    if (!m) { m = document.createElement('div'); m.id = 'exModal'; m.className = 'ex-modal'; m.setAttribute('role', 'alertdialog'); m.setAttribute('aria-modal', 'true'); document.body.appendChild(m); }
    m.innerHTML = `<div class="ex-modal-box">${img ? `<img class="ex-modal-img" src="${img}" alt="${esc(tr('Tarjeta generada'))}">` : ''}<p>${esc(text)}</p><button type="button" class="btn-minimal" id="exModalClose">${esc(tr('Entendido'))}</button></div>`;
    m.hidden = false; const b = node('exModalClose'); if (b) b.focus();
  }
  // Sonidos sintetizados en el dispositivo; desactivados salvo que el usuario los active.
  function sound(kind) {
    try {
      if (localStorage.getItem('golifiar-sonido') !== '1') return;
      const C = root.AudioContext || root.webkitAudioContext; if (!C) return;
      const ctx = new C(), o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(ctx.destination);
      o.frequency.value = kind === 'ok' ? 660 : 880; g.gain.setValueAtTime(0.08, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      o.start(); o.stop(ctx.currentTime + 0.26);
      if (navigator.vibrate) navigator.vibrate(30);
    } catch (e) { /* sin sonido */ }
  }
  function setTag(id, n) {
    const el = node(id); if (!el) return;
    el.dataset.n = String(n);
    el.textContent = n ? tr('{n} conversaciones importadas', { n: num(n) }) : '';
    el.classList.toggle('active', n > 0);
  }
  async function importInstagram(input) {
    const files = [...(input.files || [])]; if (!files.length) return;
    const startCount = state.chats.length;
    for (const file of files) {
      showStatus(tr('Leyendo ZIP de Instagram en este dispositivo…'), false);
      try {
        const messages = await E().parseInstagramZip(file);
        if (!messages.length) throw new Error(tr('No se encontraron conversaciones compatibles dentro del ZIP.'));
        const threads = new Map();
        for (const message of messages) { const key = message.chat || file.name.replace(/\.zip$/i,''); if (!threads.has(key)) threads.set(key, []); threads.get(key).push(message); }
        for (const [name, threadMessages] of threads) state.chats.push({ name, platform: 'Instagram', messages: threadMessages });
      } catch (err) { showStatus(`${file.name}: ${err.message || tr('No se pudo importar el ZIP.')}`, true); }
    }
    input.value = ''; state.mount = 'experienciasResults'; state.selected = Math.max(0, state.chats.length - 1); if (state.chats.length > startCount) { showStatus(tr('Importación completada: {n} conversaciones.', { n: num(state.chats.length - startCount) }), false); setTag('exTagInstagram', state.chats.filter(c => c.platform === 'Instagram').length); } render();
  }
  function clearAll() {
    state.chats = []; state.selected = 0; state.tab = 'resumen'; state.quiz = [];
    setTag('exTagWhatsApp', 0); setTag('exTagInstagram', 0); showStatus(tr('Se han borrado los chats importados de la memoria.'), false); render();
  }
  function showStatus(text, error) {
    const el = node('experienciasStatus'); if (!el) return;
    el.innerHTML = `<p class="ex-status ${error ? 'error' : ''}" role="${error ? 'alert' : 'status'}">${esc(text)}</p>`;
  }

  function metric(title, value, note) {
    return `<article class="ex-metric"><span>${esc(tr(title))}</span><strong>${esc(value)}</strong>${note ? `<small>${esc(note)}</small>` : ''}</article>`;
  }
  const monthLabel = m => { const [y, mo] = String(m).split('-').map(Number); return new Date(y, (mo || 1) - 1, 1).toLocaleDateString(root.I18n ? I18n.locale : undefined, { month: 'short', year: '2-digit' }).replace('.', ''); };
  const meter = v => `<div class="ex-meter" role="img" aria-label="${num(v)}/100"><i style="width:${Math.max(0, Math.min(100, Number(v) || 0))}%"></i></div>`;
  const dias = n => tr(Number(n) === 1 ? '{n} día' : '{n} días', { n: num(n) });
  function kpi(title, value, note) {
    return `<article class="ex-kpi"><strong>${esc(value)}</strong><span>${esc(tr(title))}</span>${note ? `<small>${esc(note)}</small>` : ''}</article>`;
  }
  function colChart(values, labels, title, step) {
    const max = Math.max(1, ...values);
    const cols = values.map((v, i) => `<div class="ex-col" title="${esc(labels[i])}: ${num(v)}"><i style="height:${v ? Math.max(4, Math.round(v / max * 100)) : 0}%"></i></div>`).join('');
    const labs = labels.map((l, i) => `<span>${i % step === 0 ? esc(l) : ''}</span>`).join('');
    return `<div role="img" aria-label="${esc(title)}"><div class="ex-cols">${cols}</div><div class="ex-col-labels">${labs}</div></div>`;
  }
  const TABS = [['resumen', 'Resumen'], ['actividad', 'Actividad'], ['juegos', 'Juegos'], ['records', 'Récords y torneo'], ['curiosidad', 'Full Curiosidad'], ['wrapped', 'Wrapped']];
  function renderEmpty() {
    const t0 = node(state.mount); if (!t0) return; t0.innerHTML = '<section class="ex-card ex-empty"><h3>Empieza importando una conversación</h3><p>Elige un TXT exportado desde WhatsApp o un ZIP de datos de Instagram. Los archivos se procesan localmente y no se guardan en el dispositivo.</p></section>';
  }
  function render() {
    const results = node(state.mount) || node('experienciasResults'); if (!results) return;
    ['experienciasResults', 'waFull', 'panel-curiosidad'].forEach(id => { const o = node(id); if (o && o !== results && o.querySelector('.ex-toolbar')) { o.innerHTML = `<p class="ex-note">${esc(tr('Se ha abierto otro chat en otra sección. Vuelve a abrir esta pestaña para verlo aquí.'))}</p>`; o.dataset.stale = '1'; } });
    results.removeAttribute('data-stale');
    if (!state.chats.length) { renderEmpty(); return; }
    if (!rangeMessages(selectedChat()).length) { state.range = 'all'; showStatus(tr('No hay mensajes en ese periodo.'), true); }
    const chat = selectedChat(), messages = rangeMessages(chat), s = E().stats(messages), st = E().streaks(messages), cal = E().calendar(messages), rec = E().records(messages), achievements = E().achievements(messages), wrap = E().wrapped(state.topicsEnabled ? messages : messages.map(m => ({ ...m, text: '' })), chat.name), fun = E().funTests(messages), balance = E().balance(messages);
    const options = state.chats.map((c,i) => `<option value="${i}" ${i === state.selected ? 'selected' : ''}>${esc(c.name)} · ${esc(c.platform)}</option>`).join('');
    const months = Object.keys(s.months).sort();
    const periodA = months.includes(state.compareA) ? state.compareA : (months[0] || '');
    const periodB = months.includes(state.compareB) ? state.compareB : (months[months.length-1] || '');
    state.compareA = periodA; state.compareB = periodB;
    const monthOptions = months.map(m => `<option value="${m}">${esc(monthLabel(m))}</option>`).join('');
    const comparison = months.length > 1 ? E().comparePeriods(messages, periodA, periodB) : null;
    const peopleOptions = s.participants.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');
    const chemistryA = s.participants.some(p => p.name === state.chemistryA) ? state.chemistryA : (s.participants[0]?.name || '');
    const chemistryB = s.participants.some(p => p.name === state.chemistryB) ? state.chemistryB : (s.participants[1]?.name || '');
    state.chemistryA = chemistryA; state.chemistryB = chemistryB;
    const chemistryResult = s.participants.length > 1 ? E().chemistryFull(messages, chemistryA, chemistryB, state.topicsEnabled) : { available: false };
    const funHtml = fun.map(test => `<article class="ex-record"><div><strong>${esc(tr(test.title))}</strong><span>${test.name ? esc(test.name) : esc(tr('Datos insuficientes'))} · ${test.value == null ? '—' : esc(test.value)}</span><small>${esc(test.explanation)}</small></div></article>`).join('');
    const compareHtml = comparison ? `<section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Evolución'))}</p><h3>${esc(tr('Compara dos periodos del mismo chat'))}</h3></div></div><div class="ex-compare-controls"><label>${esc(tr('Periodo A'))}<select id="exPeriodA">${monthOptions}</select></label><label>${esc(tr('Periodo B'))}<select id="exPeriodB">${monthOptions}</select></label><button type="button" class="btn-minimal" id="exCompareBtn">${esc(tr('Comparar'))}</button></div><div class="ex-metrics">${metric('Mensajes · periodo A', num(comparison.metrics.totalMessages.a))}${metric('Mensajes · periodo B', num(comparison.metrics.totalMessages.b), comparison.metrics.totalMessages.percent === null ? tr('Sin base para porcentaje') : `${comparison.metrics.totalMessages.percent >= 0 ? '+' : ''}${comparison.metrics.totalMessages.percent.toFixed(1)}%`)}${metric('Días activos · A', num(comparison.metrics.activeDays.a))}${metric('Días activos · B', num(comparison.metrics.activeDays.b))}</div></section>` : `<section class="ex-card"><h3>${esc(tr('Comparador de periodos'))}</h3><p>${esc(tr('Necesitas al menos dos meses con actividad para comparar periodos.'))}</p></section>`;
    const calendarHtml = cal.length ? `<div class="ex-calendar" role="list" aria-label="${esc(tr('Calendario de actividad'))}">${cal.map(d => `<div role="listitem" class="ex-day level-${d.level}" title="${esc(d.date)} · ${num(d.count)}" aria-label="${esc(d.date)}: ${num(d.count)} ${esc(tr('mensajes'))}"><span>${Number(d.date.slice(-2))}</span></div>`).join('')}</div><p class="ex-note">${esc(tr('Cada cuadro representa un día; la intensidad indica cuántos mensajes hubo.'))}</p>` : `<p>${esc(tr('No hay datos de actividad.'))}</p>`;
    const topics = state.topicsEnabled ? E().topics(messages, 12) : [];
    const topicHtml = topics.length ? `<div class="ex-word-cloud">${topics.map((x,i) => `<span style="--weight:${Math.min(4,1+Math.log2(x.count+1))}" class="ex-word ex-word-${i%5}">${esc(x.word)} <small>${num(x.count)}</small></span>`).join('')}</div>` : `<p>${esc(tr('No se han detectado palabras frecuentes. Importa una conversación con mensajes de texto para calcularlas.'))}</p>`;
    const recordsHtml = rec.map(r => `<article class="ex-record"><span>🏆</span><div><small>${esc(tr(r.title))}</small><strong>${esc(r.value)}</strong></div></article>`).join('');
    const achievementsHtml = achievements.length ? `<div class="ex-achievements">${achievements.map(a => `<article class="ex-achievement"><span aria-hidden="true">${a.icon}</span><div><strong>${esc(tr(a.title))}</strong><small>${esc(tr(a.description))}</small></div></article>`).join('')}</div>` : `<p>${esc(tr('Sigue usando el análisis para desbloquear tus primeros trofeos.'))}</p>`;
    const daysHtml = cal.slice(-14).map(d => `<div class="ex-mini-day"><span>${esc(d.date.slice(5))}</span><i class="level-${d.level}" title="${num(d.count)}"></i></div>`).join('');
    const topCount = Math.max(1, ...s.participants.map(p => p.count));
    const hourLabels = s.hours.map((_, i) => String(i));
    const chartsHtml = `<section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Ritmo'))}</p><h3>${esc(tr('Cuándo se escribe en este chat'))}</h3></div></div><h4 class="ex-chart-title">${esc(tr('Mensajes por hora del día'))}</h4>${colChart(s.hours, hourLabels, tr('Mensajes por hora del día'), 3)}${months.length > 1 ? `<h4 class="ex-chart-title">${esc(tr('Mensajes por mes'))}</h4>${colChart(months.map(m => s.months[m]), months.map(monthLabel), tr('Mensajes por mes'), Math.max(1, Math.ceil(months.length / 6)))}` : ''}</section>`;
    const dp = E().deep(messages), who = E().whoIsMore(messages), ghost = E().ghostOfWeek(messages), danger = E().dangerStreak(messages);
    const wd = i => new Date(2024, 0, 1 + i).toLocaleDateString(root.I18n ? I18n.locale : undefined, { weekday: 'long' });
    const badge = m => m.state === 'ex' ? `<span class="ex-badge ex">${esc(tr('Ex-miembro'))}</span> <span class="ex-badge ex">${esc(tr('Salió del grupo'))}</span>` : m.state === 'ghost' ? `<span class="ex-badge ghost">${esc(tr('Fantasma'))}</span>` : '';
    const avatar = (m, i) => `<span class="ex-avatar c${i % 6}" aria-hidden="true">${esc(initials(m.name))}</span>`;
    const podiumHtml = dp.members.length ? `${dp.isGroup ? `<ol class="ex-podium">${dp.podium.map((m, i) => `<li class="p${i + 1}">${avatar(m, i)}<strong>${['🥇', '🥈', '🥉'][i]} ${esc(m.name)}</strong>${badge(m)}<span>${num(m.messages)} · ${Math.round(m.share)}%</span></li>`).join('')}</ol>` : ''}${(dp.isGroup ? dp.rest : dp.members).length ? `<details class="ex-more"><summary>${esc(tr(dp.isGroup ? 'Ver al resto del grupo ({n})' : 'Participantes ({n})', { n: num((dp.isGroup ? dp.rest : dp.members).length) }))}</summary><ul class="ex-bars">${(dp.isGroup ? dp.rest : dp.members).map(m => `<li><span class="ex-bar-name">${esc(m.name)} ${badge(m)}</span><span class="ex-bar"><i style="width:${Math.max(2, Math.round(m.share))}%"></i></span><strong>${m.share.toFixed(1)}%</strong></li>`).join('')}</ul></details>` : ''}` : '';
    const mediaTotal = Object.values(dp.media).reduce((a, b) => a + b, 0);
    const deepHtml = `<section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Tu chat en detalle'))}</p><h3>${esc(tr('Palabras, medios y momentos'))}</h3></div></div><div class="ex-kpis">${kpi('Palabras', num(dp.words))}${kpi('Caracteres', num(dp.chars))}${kpi('Medios', num(mediaTotal))}${kpi('Franja más activa', dp.topSlot ? tr(dp.topSlot) : '—')}</div><div class="ex-metrics">${metric('Audios', num(dp.media.audio))}${metric('Fotos', num(dp.media.image))}${metric('Vídeos', num(dp.media.video))}${metric('Stickers', num(dp.media.sticker))}${metric('Día más activo de la semana', dp.topWeekday === null ? '—' : wd(dp.topWeekday))}${metric('Ex-miembros', num(dp.exMembers.length))}</div><h4 class="ex-chart-title">${esc(tr('Participantes'))}</h4>${podiumHtml}</section>`;
    const dangerHtml = danger.danger ? `<section class="ex-card ex-danger" role="status"><strong>⚠️ ${esc(tr('Tu racha de {n} días vence hoy a las 23:59', { n: num(danger.days) }))}</strong><span>${esc(tr('Escribe hoy para no perderla.'))}</span></section>` : '';
    const whoHtml = who.length ? `<div class="ex-records">${who.map(t => `<article class="ex-record"><div><strong>${esc(tr(t.title))}</strong><span>${esc(t.name)} · ${esc(t.value)}</span><small>${esc(tr(t.explanation))}</small></div></article>`).join('')}</div>` : `<p>${esc(tr('Datos insuficientes'))}</p>`;
    const ghostHtml = ghost ? `<article class="ex-record"><span>👻</span><div><small>${esc(tr('Fantasma de la semana'))}</small><strong>${esc(ghost.name)} · ${esc(dias(ghost.daysSilent))}</strong></div></article>` : '';
    const heat = E().hourHeat(messages), heatMax = Math.max(1, ...heat.flat());
    const heatHtml = `<div class="ex-heat" role="img" aria-label="${esc(tr('Mapa de calor: día de la semana por hora'))}">${heat.map((row, d) => `<div class="ex-heat-row"><span>${esc(wd(d).slice(0, 2))}</span>${row.map((v, h) => `<i style="--a:${(v / heatMax).toFixed(2)}" title="${esc(wd(d))} ${h}:00 · ${num(v)}"></i>`).join('')}</div>`).join('')}</div>`;
    const rangeHtml = `<div class="ex-range"><label>${esc(tr('Periodo a analizar'))}<select id="exRange"><option value="all">${esc(tr('Todo el chat'))}</option><option value="year">${esc(tr('Último año'))}</option><option value="summer">${esc(tr('Último verano'))}</option><option value="custom">${esc(tr('Personalizado'))}</option></select></label>${state.range === 'custom' ? `<label>${esc(tr('Desde'))}<input type="date" id="exFrom" value="${esc(state.from)}"></label><label>${esc(tr('Hasta'))}<input type="date" id="exTo" value="${esc(state.to)}"></label>` : ''}</div>`;
    const shareHtml = `<section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Para compartir'))}</p><h3>${esc(tr('Tarjeta de racha para Story (9:16)'))}</h3><p>${esc(tr('Se genera en tu dispositivo. Nada se sube a ningún sitio.'))}</p></div></div><div class="ex-card-options"><label>${esc(tr('Estilo'))}<select id="exLook"><option value="glass">Golifiar</option><option value="canario">${esc(tr('Amarillo Canario'))}</option><option value="neon">${esc(tr('Neón'))} · Premium</option><option value="cyber">Cyberpunk · Premium</option><option value="mini">${esc(tr('Minimalista'))} · Premium</option></select></label><label><input type="checkbox" id="exAnon" ${state.anon ? 'checked' : ''}> ${esc(tr('Anonimizar nombres en la tarjeta'))}</label></div><div class="ex-share-actions"><button type="button" class="btn-minimal" id="exStreakDl">${esc(tr('Descargar para Story (9:16)'))}</button><button type="button" class="btn-sub" id="exStreakCopy">${esc(tr('Copiar imagen al portapapeles'))}</button><button type="button" class="btn-sub" id="exCopyText">${esc(tr('Copiar resumen para WhatsApp'))}</button></div></section>`;
    const ta = state.topicsEnabled, dna = E().emojiDna(messages, ta), moments = ta ? E().firstMoments(messages) : [], bur = E().burst(messages), run = E().longestRun(messages), likely = E().mostLikely(messages, ta), soul = E().soulmates(messages), compat = ta && chemistryResult !== undefined ? E().topicCompat(messages, chemistryA, chemistryB) : { available: false };
    const fdt = ts => new Date(ts).toLocaleString(root.I18n ? I18n.locale : undefined, { dateStyle: 'medium', timeStyle: 'short' });
    const optin = `<label class="ex-topic-toggle"><input type="checkbox" id="exEnableTopics2" ${ta ? 'checked' : ''}> ${esc(tr('Activar análisis local de palabras'))}</label>`;
    const diplomaBtns = who.map(w => `<button type="button" class="btn-sub" data-card="diploma:${w.key}">🎓 ${esc(tr(w.title))}</button>`).join('');
    const curioHtml = `<section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">Golifiar Labs</p><h3>${esc(tr('Full Curiosidad'))}</h3><p>${esc(tr('Algunas curiosidades leen el texto en memoria, solo si activas el análisis de palabras. Nunca se muestra ni se guarda.'))}</p>${optin}</div></div>
      <div class="ex-records">
      ${bur ? `<article class="ex-record"><span>💥</span><div><small>${esc(tr('Momento de más drama (1 hora)'))}</small><strong>${num(bur.count)} ${esc(tr('mensajes'))} · ${esc(fdt(bur.start))}</strong></div></article>` : ''}
      ${run ? `<article class="ex-record"><span>⚡</span><div><small>${esc(tr('Conversación más larga sin pausas'))}</small><strong>${num(run.count)} ${esc(tr('mensajes'))} · ${esc(E().formatDuration(run.end - run.start))}</strong></div></article>` : ''}
      ${soul.map(x => `<article class="ex-record"><span>💞</span><div><small>${esc(tr('Mejor encaje'))}</small><strong>${esc(x.a)} + ${esc(x.b)} · ${x.percent}%</strong></div></article>`).join('')}
      </div></section>
      <section class="ex-card"><h3>${esc(tr('¿Con quién es más probable que…?'))}</h3>${likely.length ? `<div class="ex-records">${likely.map(x => `<article class="ex-record"><div><strong>${esc(tr(x.title))}</strong><span>${esc(x.name)} · ${esc(x.value)}</span></div></article>`).join('')}</div>` : `<p>${esc(tr('Datos insuficientes'))}</p>`}</section>
      <section class="ex-card"><h3>${esc(tr('ADN de la conversación'))}</h3>${ta ? `<p class="ex-discovery">${dna.emojis.map(e => `${e.emoji} ×${num(e.count)}`).join('  ') || '—'}</p><p>${esc(tr('Palabra mágica'))}: <strong>${esc(dna.magicWord || '—')}</strong></p>` : `<p>${esc(tr('Activa el análisis de palabras para verlo.'))}</p>`}
        <h4>${esc(tr('Primeras veces'))}</h4>${ta ? `<div class="ex-records">${moments.map(m => `<article class="ex-record"><div><strong>«${esc(m.term)}»</strong><span>${m.timestamp ? `${esc(m.sender)} · ${esc(fdt(m.timestamp))}` : '—'}</span></div></article>`).join('')}</div>` : ''}
        <h4>${esc(tr('Compatibilidad de temas'))}</h4>${compat.available ? `<p class="ex-discovery"><strong class="ex-score">${num(compat.percent)}%</strong> · ${esc(compat.shared.join(' · '))}</p>${meter(compat.percent)}` : `<p>${esc(tr('Necesita el análisis de palabras y dos personas con mensajes.'))}</p>`}</section>
      <section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Tarjetas virales'))}</p><h3>${esc(tr('Comparte en tus Stories'))}</h3></div></div><div class="ex-share-actions"><button type="button" class="btn-sub" data-card="adn">🧬 ${esc(tr('ADN de la conversación'))}</button><button type="button" class="btn-sub" data-card="vs">⚔️ Vs</button><button type="button" class="btn-sub" data-card="turno">👉 ${esc(tr('Tu turno'))}</button><button type="button" class="btn-sub" data-card="adivina">🎯 ${esc(tr('Adivina tu resultado'))}</button><button type="button" class="btn-sub" data-card="peligro">⚠️ ${esc(tr('Peligro de racha'))}</button></div><h4>${esc(tr('Diplomas'))}</h4><div class="ex-share-actions">${diplomaBtns || `<span>${esc(tr('Datos insuficientes'))}</span>`}</div></section>`;
    const slides = [
      ['📅', `${num(dp.totalMessages)} ${tr('mensajes')}`, tr('en {n} días activos', { n: num(s.activeDays) })],
      ['🔥', dias(st.longest), tr('Racha más larga')],
      ['⏰', s.peakHour === null ? '—' : `${String(s.peakHour).padStart(2, '0')}:00`, tr('Hora con más actividad')],
      ['🏆', dp.members[0] ? dp.members[0].name : '—', tr('Más mensajes')],
      ['🎭', who[0] ? who[0].name : '—', who[0] ? tr(who[0].title) : ''],
      ['💬', `${num(dp.words)} ${tr('palabras')}`, tr('Gracias por hablar tanto')]
    ];
    state.slide = Math.min(state.slide, slides.length - 1);
    const storyHtml = `<section class="ex-card ex-story" aria-roledescription="carousel" aria-label="${esc(tr('Golifiar Wrapped'))}">${slides.map((x, i) => `<div class="ex-slide" ${i === state.slide ? '' : 'hidden'}><span class="ex-slide-ico" aria-hidden="true">${x[0]}</span><strong>${esc(x[1])}</strong><span>${esc(x[2])}</span></div>`).join('')}<div class="ex-share-actions"><button type="button" class="btn-sub" id="exPrev">${esc(tr('Anterior'))}</button><span aria-live="polite">${state.slide + 1}/${slides.length}</span><button type="button" class="btn-minimal" id="exNext">${esc(tr('Siguiente'))}</button></div></section>`;
    const jokes = state.topicsEnabled ? E().insideJokes(messages, 10) : [], cloud = state.topicsEnabled ? E().emojiCloud(messages, 18) : [], cmax = Math.max(1, ...cloud.map(x => x.count));
    const jokesHtml = state.topicsEnabled ? `<section class="ex-card"><h3>${esc(tr('Diccionario del chat'))}</h3>${jokes.length ? `<div class="ex-word-cloud">${jokes.map(j => `<span class="ex-word ex-word-${j.count % 5}">${esc(j.word)} <small>${num(j.count)}</small></span>`).join('')}</div>` : `<p>${esc(tr('Aún no hay palabras que se repitan lo bastante entre varias personas.'))}</p>`}<h3>${esc(tr('Nube de emojis'))}</h3>${cloud.length ? `<div class="ex-emoji-cloud" role="img" aria-label="${esc(tr('Nube de emojis'))}">${cloud.map(x => `<span style="font-size:${(1 + 2.4 * x.count / cmax).toFixed(2)}rem" title="${num(x.count)}">${x.emoji}</span>`).join('')}</div>` : `<p>—</p>`}</section>` : '';
    const premiumOn = isPremium(), unlocked = premiumOn || (() => { try { return localStorage.getItem('golifiar-compare-ok') === '1'; } catch (e) { return false; } })();
    let compareChatsHtml;
    if (!unlocked) compareChatsHtml = `<section class="ex-card"><h3>🔒 ${esc(tr('Comparar 2 chats'))}</h3><p>${esc(tr('Se desbloquea al compartir una tarjeta de racha en tus Stories mencionando a Golifiar. Este desbloqueo es de confianza: se activa al crear o compartir la tarjeta en este dispositivo.'))}</p><button type="button" class="btn-minimal" id="exStreakDl2">${esc(tr('Crear y compartir tarjeta de racha'))}</button></section>`;
    else {
      let tbl = '';
      if (state.compare) {
        const A = { name: chat.name, m: messages }, B = { name: state.compare.name, m: state.compare.messages };
        const cols = X => { const sx = E().stats(X.m), stk = E().streaks(X.m), dd = E().deep(X.m); return { name: X.name, v: [sx.totalMessages, dd.words, sx.activeDays, stk.longest, stk.current, sx.participantCount, sx.messagesPerActiveDay] }; };
        const ca = cols(A), cb = cols(B), labels = ['Mensajes', 'Palabras', 'Días activos', 'Racha más larga', 'Racha actual', 'Participantes', 'Mensajes por día activo'];
        const winner = ca.v[6] >= cb.v[6] ? ca.name : cb.name;
        tbl = `<div class="ex-table-wrap"><table class="ex-table"><thead><tr><th></th><th>${esc(ca.name)}</th><th>${esc(cb.name)}</th></tr></thead><tbody>${labels.map((l, i) => `<tr><td>${esc(tr(l))}</td><td>${num(Math.round(ca.v[i] * 10) / 10)}</td><td>${num(Math.round(cb.v[i] * 10) / 10)}</td></tr>`).join('')}</tbody></table></div><p class="ex-discovery">🏆 ${esc(tr('Conversación más activa'))}: <strong>${esc(winner)}</strong></p>`;
      }
      compareChatsHtml = `<section class="ex-card"><h3>${esc(tr('Comparar 2 chats'))}</h3><p>${esc(tr('Sube un segundo .txt solo para compararlo. No se guarda ni se mezcla con el primero.'))}</p><label class="btn-sub ex-file-btn">${esc(tr('Elegir segundo chat'))}<input type="file" id="exCompareFile" accept=".txt,text/plain" class="visually-hidden"></label>${tbl}</section>`;
    }
    const edit = state.edit;
    const lockTxt = premiumOn ? '' : ' 🔒';
    const editorHtml = `<section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Personaliza'))}</p><h3>${esc(tr('Editor de tarjeta en vivo'))}</h3></div></div><div class="ex-editor"><div class="ex-editor-controls"><label><input type="checkbox" id="edOn" ${edit.on ? 'checked' : ''}> ${esc(tr('Usar colores y tipografía propios'))}</label><label>${esc(tr('Fondo'))} 1<input type="color" id="edBg1" value="${edit.bg1}"></label><label>${esc(tr('Fondo'))} 2<input type="color" id="edBg2" value="${edit.bg2}"></label><label>${esc(tr('Acento'))}<input type="color" id="edAccent" value="${edit.accent}"></label><label>${esc(tr('Texto'))}<input type="color" id="edText" value="${edit.text}"></label><label>${esc(tr('Tipografía'))}<select id="edFont"><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select></label><label>${esc(tr('Posición del contador'))}<input type="range" id="edNumY" min="760" max="1300" value="${edit.numY}"></label><label>${esc(tr('Foto 1 (solo en tu dispositivo)'))}<input type="file" id="edAv0" accept="image/*"></label><label>${esc(tr('Foto 2 (solo en tu dispositivo)'))}<input type="file" id="edAv1" accept="image/*"></label><label><input type="checkbox" id="exHd" ${state.hd && premiumOn ? 'checked' : ''} ${premiumOn ? '' : 'disabled'}> ${esc(tr('Exportación HD (2160×3840)'))}${lockTxt}</label><label><input type="checkbox" id="exNoMark" ${state.noMark && premiumOn ? 'checked' : ''} ${premiumOn ? '' : 'disabled'}> ${esc(tr('Sin marca de agua'))}${lockTxt}</label></div><canvas id="exPreview" class="ex-preview" width="270" height="480" role="img" aria-label="${esc(tr('Vista previa de la tarjeta'))}"></canvas></div></section>`;
    const all = `
      <!--pane:resumen--><section class="ex-card ex-profile"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Perfil del grupo'))}</p><h3>${esc(chat.name)}</h3><p>${esc(tr('Resumen calculado a partir de las fechas y participantes de la exportación.'))}</p></div><button type="button" class="btn-sub" id="exExportCard">${esc(tr('Crear tarjeta PNG'))}</button></div><div class="ex-kpis">${kpi('Mensajes analizados',num(s.totalMessages))}${kpi('Participantes',num(s.participantCount))}${kpi('Días activos',num(s.activeDays))}${kpi('Hora punta',s.peakHour === null ? '—' : `${String(s.peakHour).padStart(2,'0')}:00`)}</div><details class="ex-more" open><summary>${esc(tr('Más datos del chat'))}</summary><div class="ex-metrics">${metric('Racha actual',dias(st.current))}${metric('Racha más larga',dias(st.longest))}${metric('Conversaciones estimadas',num(s.sessionCount))}${metric('Quién inicia más',s.topInitiator ? `${s.topInitiator.name} · ${num(s.topInitiator.count)}` : '—')}${metric('Duración media',s.avgConversationDurationMs === null ? '—' : E().formatDuration(s.avgConversationDurationMs))}${metric('Mediana de respuesta',s.medianResponseMinutes === null ? '—' : E().formatDuration(s.medianResponseMinutes*60000))}${metric('Reacciones',num(s.totalReactions))}${metric('Contenido compartido',num(s.sharedContentMessages))}${metric('Respuestas a historias',s.storyReplies ? num(s.storyReplies) : '—',s.storyReplies ? '' : tr('Solo si el ZIP las identifica'))}</div></details><div class="ex-top-participants"><h4>${esc(tr('Participantes más activos'))}</h4><ul class="ex-bars">${s.participants.slice(0,6).map(p => `<li><span class="ex-bar-name">${esc(p.name)}</span><span class="ex-bar"><i style="width:${Math.max(3, Math.round(p.count / topCount * 100))}%"></i></span><strong>${num(p.count)}</strong></li>`).join('')}</ul></div><p class="ex-note">${s.firstMessage ? `${esc(fmtDate(s.firstMessage))} – ${esc(fmtDate(s.lastMessage))}` : ''} · ${esc(tr('El texto original no se muestra ni se guarda.'))}</p></section>
      <!--pane:resumen-->${dangerHtml}${deepHtml}
      <!--pane:actividad--><section class="ex-card"><h3>${esc(tr('Reloj de actividad'))}</h3>${heatHtml}</section>${chartsHtml}${compareHtml}
      <section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Calendario'))}</p><h3>${esc(tr('Actividad día a día'))}</h3></div></div>${calendarHtml}<div class="ex-mini-calendar">${daysHtml}</div></section>
      <!--pane:juegos--><section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Tests de curiosidad'))}</p><h3>${esc(tr('¿Quién es más...?'))}</h3></div></div>${whoHtml}<div class="ex-records">${ghostHtml}${funHtml}</div><p class="ex-note">${esc(tr('Son aproximaciones estadísticas y no describen la personalidad.'))}</p></section>
      <section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Chemistry Score'))}</p><h3>${esc(tr('Compatibilidad de horarios'))}</h3><p>${esc(tr('Resultado lúdico y orientativo, no científico.'))}</p></div></div><div class="ex-compare-controls"><label>${esc(tr('Persona A'))}<select id="exChemA">${peopleOptions}</select></label><label>${esc(tr('Persona B'))}<select id="exChemB">${peopleOptions}</select></label></div><p class="ex-discovery">${chemistryResult.available ? `<strong class="ex-score">${num(chemistryResult.score)}/100</strong> · ${esc(tr(chemistryResult.explanation))}` : esc(tr('Datos insuficientes para calcularlo.'))}</p>${chemistryResult.available ? meter(chemistryResult.score) : ''}${chemistryResult.available ? `<ul class="ex-bars">${chemistryResult.parts.map(x => `<li><span class="ex-bar-name">${esc(tr(x.key))}</span><span class="ex-bar"><i style="width:${x.percent}%"></i></span><strong>${x.percent}%</strong></li>`).join('')}</ul>` : ''}<p class="ex-note">${esc(tr('Resultado orientativo y lúdico.'))}</p></section>
      <section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Índice de equilibrio'))}</p><h3>${esc(tr('Reparto de participación'))}</h3></div></div><p class="ex-discovery">${balance.available ? `<strong class="ex-score">${num(balance.score)}/100</strong>` : esc(tr('Datos insuficientes'))}</p>${balance.available ? meter(balance.score) : ''}<p class="ex-note">${esc(balance.explanation || tr('Se necesitan al menos dos participantes.'))}</p></section>
      <!--pane:actividad--><section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Temas del chat'))}</p><h3>${esc(tr('Palabras más frecuentes'))}</h3><p>${esc(tr('Se calculan localmente en memoria; no se conserva el texto de los mensajes.'))}</p><label class="ex-topic-toggle"><input type="checkbox" id="exEnableTopics" ${state.topicsEnabled ? 'checked' : ''}> ${esc(tr('Activar análisis local de palabras'))}</label></div></div>${topicHtml}</section>
      <!--pane:records--><section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Galería de récords'))}</p><h3>${esc(tr('Trofeos y logros'))}</h3></div></div><div class="ex-achievements">${achievementsHtml}</div><h4>${esc(tr('Récords del chat'))}</h4><div class="ex-records">${recordsHtml}</div></section>
      <!--pane:curiosidad-->${curioHtml}${jokesHtml}${compareChatsHtml}
      <!--pane:wrapped-->${storyHtml}${shareHtml}${editorHtml}<section class="ex-card ex-wrapped"><div><p class="ex-kicker">${esc(tr('Tu resumen compartible'))}</p><h3>${esc(tr('Wrapped del chat'))}</h3><p>${esc(wrap.period)} · ${num(wrap.totalMessages)} ${esc(tr('mensajes'))} · ${num(wrap.participantCount)} ${esc(tr('participantes'))}</p><p>${esc(tr('Palabras destacadas'))}: ${state.topicsEnabled ? (wrap.topWords.map(esc).join(' · ') || '—') : esc(tr('Activa el análisis de palabras para incluirlas'))}</p></div><button type="button" class="btn-minimal" id="exExportCard2">${esc(tr('Descargar tarjeta'))}</button></section>
      <!--pane:juegos--><section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Modo fiesta'))}</p><h3>${esc(tr('Pon a prueba al grupo'))}</h3><p>${esc(tr('Preguntas generadas con estadísticas, sin revelar mensajes privados.'))}</p></div></div><div id="exPartyArea">${renderQuizIntro()}</div></section>
      <!--pane:records--><section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Torneo entre chats'))}</p><h3>${esc(tr('¿Qué chat tiene más actividad relativa?'))}</h3><p>${esc(tr('La puntuación combina mensajes por participante y por día activo para reducir la ventaja de los grupos grandes.'))}</p></div></div>${renderTournament()}</section>
      <!--pane:resumen--><section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Descubrimiento diario'))}</p><h3>${esc(tr('Una curiosidad de hoy'))}</h3></div></div><p class="ex-discovery">${esc(dailyDiscoveryText(messages))}</p></section>`;
    const panes = {}; const parts = all.split(/<!--pane:(\w+)-->/);
    for (let i = 1; i < parts.length; i += 2) panes[parts[i]] = (panes[parts[i]] || '') + parts[i + 1];
    if (!TABS.some(t => t[0] === state.tab)) state.tab = 'resumen';
    const tabsHtml = `<div class="category-tabs ex-tabs" role="tablist" aria-label="${esc(tr('Secciones de Experiencias'))}">${TABS.map(([k, l]) => `<button type="button" role="tab" class="cat-tab${k === state.tab ? ' active' : ''}" id="extab-${k}" data-extab="${k}" aria-controls="expane-${k}" aria-selected="${k === state.tab}" tabindex="${k === state.tab ? 0 : -1}">${esc(tr(l))}</button>`).join('')}</div>`;
    const panesHtml = TABS.map(([k]) => `<div role="tabpanel" class="ex-pane" id="expane-${k}" aria-labelledby="extab-${k}"${k === state.tab ? '' : ' hidden'}>${panes[k] || ''}</div>`).join('');
    results.innerHTML = `<section class="ex-toolbar"><div class="ex-chat-picker"><label for="exChatSelect">${esc(tr('Conversación seleccionada'))}</label><select id="exChatSelect">${options}</select><span class="ex-platform">${esc(chat.platform)}</span></div><button type="button" class="btn-sub" id="exClear">${esc(tr('Borrar chats importados'))}</button></section>${rangeHtml}${tabsHtml}${panesHtml}`;
    const ef = node('edFont'); if (ef) ef.value = state.edit.font;
    updatePreview();
    const rg = node('exRange'); if (rg) rg.value = state.range;
    const lk = node('exLook'); if (lk) lk.value = state.cardLook;
    const pa = node('exPeriodA'); if (pa) pa.value = periodA;
    const pb = node('exPeriodB'); if (pb) pb.value = periodB;
    const theme = node('exCardTheme'); if (theme) theme.value = state.cardTheme;
    const chemistryASelect = node('exChemA'); if (chemistryASelect) chemistryASelect.value = chemistryA;
    const chemistryBSelect = node('exChemB'); if (chemistryBSelect) chemistryBSelect.value = chemistryB;
  }
  function dailyDiscoveryText(messages) {
    const s = E().stats(messages), st = E().streaks(messages), rec = E().records(messages);
    const date = new Date();
    const seedText = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const seed = seedText.split('').reduce((a,c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const choices = [
      () => tr('El chat acumula {n} mensajes en {days} días activos.', { n: num(s.totalMessages), days: num(s.activeDays) }),
      () => s.peakHour === null ? tr('Todavía no hay suficientes datos para descubrir la hora punta.') : tr('La hora con más actividad es alrededor de las {hour}:00.', { hour: String(s.peakHour).padStart(2,'0') }),
      () => tr('La racha más larga registrada es de {n} días.', { n: num(st.longest) }),
      () => s.topSender ? tr('{name} aparece en el primer puesto por cantidad de mensajes.', { name: s.topSender.name }) : tr('Importa una conversación para descubrir una estadística.'),
      () => rec[0].value === 'Sin datos' ? tr('Importa una conversación para descubrir el día más activo.') : tr('El récord de día más activo es {record}.', { record: rec[0].value })
    ];
    return choices[seed % choices.length]();
  }
  function renderQuizIntro() { return `<p>${esc(tr('Juega una ronda de preguntas basadas en las estadísticas del chat.'))}</p><button type="button" class="btn-minimal" id="exStartQuiz">${esc(tr('Empezar ronda'))}</button>`; }
  function renderTournament() {
    if (state.chats.length < 2) return `<p>${esc(tr('Importa al menos dos chats para iniciar un torneo. Puedes cargar varios archivos TXT de WhatsApp o exportaciones ZIP de Instagram.'))}</p>`;
    const table = E().tournament(state.chats).map((c,i) => `<tr><td>${i+1}. ${esc(c.name)}</td><td>${esc(c.platform)}</td><td>${num(c.participants)}</td><td>${num(c.messagesPerDay)}</td><td><strong>${num(c.score)}</strong></td></tr>`).join('');
    const platformRows = ['WhatsApp','Instagram'].map(platform => { const chats = state.chats.filter(c => c.platform === platform); const total = chats.reduce((n,c) => n + E().stats(c.messages).totalMessages,0); const people = chats.reduce((n,c) => n + E().stats(c.messages).participantCount,0); const days = chats.reduce((n,c) => n + E().stats(c.messages).activeDays,0); return chats.length ? `<tr><td>${platform}</td><td>${num(chats.length)}</td><td>${num(total)}</td><td>${num(people ? total/people : 0)}</td><td>${num(days ? total/days : 0)}</td></tr>` : ''; }).join('');
    const cross = state.chats.some(c => c.platform === 'WhatsApp') && state.chats.some(c => c.platform === 'Instagram') ? `<h4>${esc(tr('WhatsApp frente a Instagram'))}</h4><div class="ex-table-wrap"><table class="ex-table"><thead><tr><th>${esc(tr('Plataforma'))}</th><th>${esc(tr('Exportaciones'))}</th><th>${esc(tr('Mensajes'))}</th><th>${esc(tr('Mensajes por participante'))}</th><th>${esc(tr('Mensajes por día activo'))}</th></tr></thead><tbody>${platformRows}</tbody></table></div><p class="ex-note">${esc(tr('La comparación depende de los datos incluidos en cada exportación y no implica que ambas plataformas registren las mismas clases de interacción.'))}</p>` : '';
    return `<div class="ex-table-wrap"><table class="ex-table"><thead><tr><th>${esc(tr('Chat'))}</th><th>${esc(tr('Plataforma'))}</th><th>${esc(tr('Participantes'))}</th><th>${esc(tr('Mensajes/día'))}</th><th>${esc(tr('Puntos'))}</th></tr></thead><tbody>${table}</tbody></table></div>${cross}`;
  }

  function startQuiz() {
    const chat = selectedChat(); state.quiz = E().partyQuiz(chat.messages); state.quizIndex = 0; state.quizScore = 0; renderQuizQuestion();
  }
  function renderQuizQuestion() {
    const area = node('exPartyArea'); if (!area) return;
    if (state.quizIndex >= state.quiz.length) { area.innerHTML = `<h4>${esc(tr('Ronda terminada'))}</h4><p>${esc(tr('Puntuación'))}: ${state.quizScore}/${state.quiz.length}</p><button type="button" class="btn-sub" id="exStartQuiz">${esc(tr('Volver a jugar'))}</button>`; return; }
    const q = state.quiz[state.quizIndex];
    area.innerHTML = `<p>${esc(tr('Pregunta {n} de {total}',{n:state.quizIndex+1,total:state.quiz.length}))}: <strong>${esc(tr(q.question))}</strong></p><div class="ex-quiz-options">${q.options.map(o => `<button type="button" class="btn-sub ex-answer" data-answer="${esc(o)}">${esc(o)}</button>`).join('')}</div><p id="exQuizFeedback" aria-live="polite"></p>`;
  }
  function answerQuiz(answer) {
    const q = state.quiz[state.quizIndex]; if (!q) return;
    const feedback = node('exQuizFeedback');
    if (answer === q.answer) { state.quizScore++; if (feedback) feedback.textContent = tr('¡Correcto!'); }
    else if (feedback) feedback.textContent = `${tr('La respuesta era')}: ${q.answer}`;
    state.quizIndex++;
    window.setTimeout(renderQuizQuestion, 700);
  }


  function initials(n) { return String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => Array.from(w)[0] || '').join('').toUpperCase() || '?'; }
  const FREE_LOOKS = ['glass', 'canario'];
  const LOOKS = {
    glass: { bg: ['#0284c7', '#14b8a6', '#4ade80'], bgStreak: ['#0284c7', '#14b8a6', '#4ade80'], bgSummary: ['#c026d3', '#e11d48', '#dc2626'], accent: '#FFD21F', text: '#ffffff', sub: 'rgba(255,255,255,.75)', dark: '#0f172a', glass: true },
    canario: { bg: ['#0f0f14', '#2a2210'], accent: '#FFD21F', text: '#ffffff', sub: '#c9c3ad', dark: '#ffffff' },
    neon: { bg: ['#05010f', '#1b0a4a'], accent: '#39ff14', text: '#ffffff', sub: '#b8a7ff', dark: '#ffffff' },
    cyber: { bg: ['#12002b', '#3a0057'], accent: '#ff2bd6', text: '#00f0ff', sub: '#e9a8ff', dark: '#00f0ff' },
    mini: { bg: ['#fafafa', '#e9e9ee'], accent: '#111111', text: '#111111', sub: '#555555', dark: '#111111' }
  };
  const AV = ['#FFD21F', '#ff7a59', '#4cc9f0', '#9b5de5', '#43aa8b', '#f15bb5'];
  const isPremium = () => Boolean(root.premiumActivo && root.premiumActivo()) || (() => { try { return localStorage.getItem('golifiar-rol') === 'dev'; } catch (e) { return false; } })();
  const FONTS = { sans: 'system-ui, sans-serif', serif: 'Georgia, serif', mono: 'ui-monospace, Menlo, monospace' };
  function cardStyle(kind) {
    const ed = state.edit; let look = state.cardLook; if (!FREE_LOOKS.includes(look) && !isPremium()) look = 'glass';
    const base = LOOKS[look] || LOOKS.glass;
    const L = ed.on ? { bg: [ed.bg1, ed.bg2], accent: ed.accent, text: ed.text, sub: ed.text, dark: ed.text, glass: true }
      : { ...base, bg: (kind === 'summary' && base.bgSummary) || (kind === 'streak' && base.bgStreak) || base.bg };
    const hd = isPremium() && state.hd;
    return { L, F: FONTS[ed.on ? ed.font : 'sans'] || FONTS.sans, k: hd ? 2 : 1, mark: !(isPremium() && state.noMark), numY: ed.on ? ed.numY : 1000 };
  }
  function baseCanvas(S) {
    const canvas = document.createElement('canvas'); canvas.width = 1080 * S.k; canvas.height = 1920 * S.k; const ctx = canvas.getContext('2d'); ctx.scale(S.k, S.k);
    const g = ctx.createLinearGradient(0, 0, 1080, 1920); const n = S.L.bg.length; S.L.bg.forEach((c, i) => g.addColorStop(n === 1 ? 0 : i / (n - 1), c)); ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1920);
    ctx.textAlign = 'center'; return { canvas, ctx };
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function glow(ctx, x, y, r, color) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
  function glass(ctx, x, y, w, h, r, alpha) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 14;
    rr(ctx, x, y, w, h, r); ctx.fillStyle = `rgba(255,255,255,${alpha == null ? 0.12 : alpha})`; ctx.fill(); ctx.restore();
    rr(ctx, x, y, w, h, r); ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 3; ctx.stroke();
  }
  function frame(ctx, S, kind) {
    glow(ctx, 160, 160, 520, kind === 'summary' ? 'rgba(139,92,246,.55)' : 'rgba(103,232,249,.5)');
    glow(ctx, 920, 1760, 560, kind === 'summary' ? 'rgba(251,146,60,.45)' : 'rgba(190,242,100,.45)');
    glass(ctx, 54, 54, 972, 1812, 96, 0.1);
  }
  function brand(ctx, S, y) {
    ctx.fillStyle = S.L.glass ? S.L.dark : S.L.accent; ctx.font = `bold 84px ${S.F}`; ctx.fillText('Golifiar', 540, y || 1740);
    if (S.mark) { ctx.fillStyle = S.L.sub; ctx.font = `34px ${S.F}`; ctx.fillText(tr('Analiza tu chat en tu dispositivo · golifiar'), 540, (y || 1740) + 60); }
  }
  // Avatar circular: foto local opcional (solo en memoria) o iniciales. Con anonimizar nunca se usa la foto.
  function avatar(ctx, S, x, y, r, person, idx) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = AV[idx % 6]; ctx.fill(); ctx.restore();
    const img = !state.anon && state.avatars[idx];
    if (img) { ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip(); const k = Math.max(2 * r / img.width, 2 * r / img.height); ctx.drawImage(img, x - img.width * k / 2, y - img.height * k / 2, img.width * k, img.height * k); ctx.restore(); }
    else { ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.font = `bold ${Math.round(r * 0.8)}px ${S.F}`; ctx.textBaseline = 'middle'; ctx.fillText(state.anon ? String(idx + 1) : initials(person.name), x, y + 4); ctx.textBaseline = 'alphabetic'; }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 10; ctx.stroke();
  }
  function peopleFor(dp) {
    const list = (dp.members.filter(m => m.state !== 'ex').slice(0, 2));
    return list.map((m, i) => ({ name: state.anon ? tr('Persona {n}', { n: i + 1 }) : m.name, share: m.share }));
  }
  const handle = n => '@' + String(n).toLowerCase().replace(/\s+/g, '');
  function tierBadge(days) { return days >= 100 ? 'Amistad Inmortal 👑' : days >= 30 ? 'Amistad Leyenda 🔥' : days >= 7 ? 'Amistad en Racha ⚡' : 'Primeros pasos 🌱'; }
  function traitFor(slot) { return { madrugada: ['🦉', 'Búhos nocturnos'], 'noche': ['🌙', 'Noctámbulos'], 'mañana': ['☀️', 'Madrugadores'], tarde: ['☕', 'Charla de tarde'] }[slot] || ['💬', 'Charlatanes']; }
  function streakCanvas(chatArg) {
    const chat = chatArg || selectedChat(); if (!chat) return null;
    const messages = chatArg ? chatArg.messages : rangeMessages(chat), st = E().streaks(messages), dp = E().deep(messages);
    const S = cardStyle('streak'), L = S.L, F = S.F, { canvas, ctx } = baseCanvas(S);
    frame(ctx, S, 'streak');
    ctx.fillStyle = L.text; ctx.font = `600 46px ${F}`; ctx.fillText(tr('Días hablando en {plat}', { plat: chat.platform || 'WhatsApp' }), 540, 190);
    const ppl = peopleFor(dp); while (ppl.length < 2) ppl.push({ name: tr('Persona {n}', { n: ppl.length + 1 }) });
    avatar(ctx, S, 540 - 80, 390, 115, ppl[0], 0); avatar(ctx, S, 540 + 80, 390, 115, ppl[1], 1);
    ctx.fillStyle = L.text; ctx.font = `600 40px ${F}`; ctx.fillText(truncate(ctx, handle(ppl[0].name), 300, 40), 540 - 190, 580); ctx.fillText(truncate(ctx, handle(ppl[1].name), 300, 40), 540 + 190, 580);
    const days = st.current || st.longest, y = S.numY;
    ctx.font = `bold 340px ${F}`; const nw = ctx.measureText(String(days)).width; ctx.font = `300px ${F}`; const fw = ctx.measureText('🔥').width, gap = 20, total = fw + gap + nw, x0 = 540 - total / 2;
    ctx.textAlign = 'left'; ctx.font = `300px ${F}`; ctx.fillText('🔥', x0, y); ctx.fillStyle = L.glass ? '#ffffff' : L.accent; ctx.font = `bold 340px ${F}`; ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 30; ctx.fillText(String(days), x0 + fw + gap, y); ctx.restore(); ctx.textAlign = 'center';
    ctx.fillStyle = L.text; ctx.font = `bold 74px ${F}`; ctx.fillText(tr(st.current ? 'días seguidos' : 'racha más larga'), 540, y + 160);
    const bt = tr(tierBadge(days)); ctx.font = `bold 50px ${F}`; const bw = Math.min(900, ctx.measureText(bt).width + 120), by = y + 205;
    const bg = ctx.createLinearGradient(540 - bw / 2, 0, 540 + bw / 2, 0); bg.addColorStop(0, 'rgba(251,191,36,.85)'); bg.addColorStop(1, 'rgba(249,115,22,.85)');
    ctx.save(); ctx.shadowColor = 'rgba(251,146,60,.5)'; ctx.shadowBlur = 30; rr(ctx, 540 - bw / 2, by, bw, 96, 48); ctx.fillStyle = bg; ctx.fill(); ctx.restore(); rr(ctx, 540 - bw / 2, by, bw, 96, 48); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#451a03'; ctx.fillText(bt, 540, by + 65);
    // Línea de luces de la racha
    const dy = by + 165, N = 24;
    for (let i = 0; i < N; i++) { const t = i / (N - 1), r = 6 + t * 9; ctx.save(); ctx.globalAlpha = 0.35 + t * 0.65; ctx.shadowColor = 'rgba(255,255,255,.95)'; ctx.shadowBlur = 18; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(120 + i * (840 / (N - 1)), dy, r, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    const gy = dy + 65; glass(ctx, 110, gy, 860, 235, 56, 0.2);
    ctx.fillStyle = L.glass ? L.dark : L.text; ctx.font = `46px ${F}`;
    ctx.fillText(`${num(dp.words)} ${tr('palabras')} · ${num(dp.media.image)} ${tr('fotos enviadas')}`, 540, gy + 85);
    const tr2 = traitFor(dp.topSlot), tt = `${tr(tr2[1])} ${tr2[0]} (${tr('horario pico')})`; ctx.font = `bold 42px ${F}`; const tw = Math.min(800, ctx.measureText(tt).width + 80);
    rr(ctx, 540 - tw / 2, gy + 120, tw, 80, 40); ctx.fillStyle = 'rgba(15,23,42,.85)'; ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(tt, 540, gy + 175);
    brand(ctx, S, 1775);
    return canvas;
  }
  function summaryCanvas() {
    const chat = selectedChat(); if (!chat) return null;
    const messages = rangeMessages(chat), s = E().stats(messages), st = E().streaks(messages), dp = E().deep(messages);
    const S = cardStyle('summary'), L = S.L, F = S.F, { canvas, ctx } = baseCanvas(S);
    frame(ctx, S, 'summary');
    ctx.fillStyle = L.text; ctx.font = `bold 40px ${F}`; ctx.fillText(`GOLIFIAR · CHAT WRAPPED 🎉`, 540, 175);
    ctx.font = `bold 96px ${F}`; ctx.fillText(truncate(ctx, state.anon ? tr('Mi chat') : chat.name, 880, 96), 540, 310);
    const ppl = peopleFor(dp); while (ppl.length < 2) ppl.push({ name: tr('Persona {n}', { n: ppl.length + 1 }), share: 0 });
    avatar(ctx, S, 540 - 75, 480, 105, ppl[0], 0); avatar(ctx, S, 540 + 75, 480, 105, ppl[1], 1);
    ctx.fillStyle = L.text; ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 30; ctx.font = `900 230px ${F}`; ctx.fillText(num(s.totalMessages), 540, 800); ctx.restore();
    ctx.font = `46px ${F}`; ctx.globalAlpha = 0.85; ctx.fillText(tr('mensajes'), 540, 870); ctx.globalAlpha = 1;
    const pill = (x, y, w, h) => glass(ctx, x, y, w, h, 44, 0.16);
    const X = 110, W = 860, half = 420;
    pill(X, 930, half, 110); pill(X + half + 20, 930, half, 110);
    ctx.fillStyle = L.text; ctx.font = `44px ${F}`; ctx.fillText(`${num(s.participantCount)} ${tr('participantes')}`, X + half / 2, 1000); ctx.fillText(`${num(s.activeDays)} ${tr('días activos')}`, X + half + 20 + half / 2, 1000);
    pill(X, 1060, W, 170);
    const a = ppl[0], b = ppl[1], sum = (a.share + b.share) || 1, pa = Math.round(a.share / sum * 100), pb = 100 - pa;
    rr(ctx, X + 40, 1092, W - 80, 24, 12); ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill();
    const bw = W - 80, ga = ctx.createLinearGradient(X + 40, 0, X + 40 + bw * pa / 100, 0); ga.addColorStop(0, '#38bdf8'); ga.addColorStop(1, '#6ee7b7'); rr(ctx, X + 40, 1092, Math.max(24, bw * pa / 100), 24, 12); ctx.fillStyle = ga; ctx.fill();
    ctx.save(); rr(ctx, X + 40 + bw * pa / 100, 1092, bw * pb / 100, 24, 12); ctx.fillStyle = '#fb923c'; ctx.fill(); ctx.restore();
    ctx.fillStyle = L.text; ctx.font = `bold 44px ${F}`; ctx.fillText(`${pa}% ${handle(a.name)} · ${pb}% ${handle(b.name)}`, 540, 1190);
    pill(X, 1250, half, 160); pill(X + half + 20, 1250, half, 160);
    const topDay = Object.entries(s.days).sort((x, y) => y[1] - x[1])[0];
    ctx.font = `40px ${F}`; ctx.fillText(tr('Hora punta'), X + half / 2, 1310); ctx.font = `bold 54px ${F}`; ctx.fillText(s.peakHour === null ? '—' : `${String(s.peakHour).padStart(2, '0')}:00 ⏰`, X + half / 2, 1378);
    ctx.font = `40px ${F}`; ctx.fillText(tr('Día récord'), X + half + 20 + half / 2, 1310); ctx.font = `bold 46px ${F}`;
    const dl = topDay ? new Date(topDay[0] + 'T12:00:00').toLocaleDateString(root.I18n ? I18n.locale : undefined, { day: 'numeric', month: 'short' }).replace('.', '') : '—';
    ctx.fillText(`${dl} 🏆`, X + half + 20 + half / 2, 1363); ctx.font = `34px ${F}`; ctx.fillText(topDay ? `(${num(topDay[1])} msgs)` : '', X + half + 20 + half / 2, 1400);
    pill(X, 1430, W, 110); ctx.font = `44px ${F}`; ctx.fillText(`${tr('Racha más larga')}: ${num(st.longest)} ${tr('días')} 📈`, 540, 1500);
    ctx.fillStyle = L.sub; ctx.font = `34px ${F}`; ctx.fillText(tr('Generado localmente por Golifiar'), 540, 1790);
    return canvas;
  }
  function simpleCard(o) {
    const S = cardStyle('streak'), L = S.L, F = S.F, { canvas, ctx } = baseCanvas(S);
    if (L.glass) frame(ctx, S, 'streak');
    ctx.fillStyle = L.sub; ctx.font = `600 44px ${F}`; ctx.fillText(o.kicker, 540, 260);
    ctx.fillStyle = L.glass ? '#ffffff' : L.accent; ctx.font = `bold ${o.bigSize || 150}px ${F}`; ctx.fillText(truncate(ctx, o.big, 960, o.bigSize || 150), 540, 760);
    ctx.fillStyle = L.text; ctx.font = `bold 60px ${F}`; (o.lines || []).forEach((l, i) => ctx.fillText(truncate(ctx, l, 960, 60), 540, 940 + i * 100));
    brand(ctx, S);
    return canvas;
  }


  // Monta el análisis completo en otra sección (WhatsApp, informe de Instagram) sin duplicar lógica.
  function mountChats(chats, id) {
    const same = state.mount === id && state.chats.length === chats.length && state.chats[0] === chats[0];
    state.mount = id;
    if (!same) { state.chats = chats; state.selected = 0; state.range = 'all'; state.tab = 'resumen'; state.quiz = []; state.compare = null; }
    render();
  }
  async function mountInstagram(files, id) {
    const box = node(id); if (!box) return;
    box.innerHTML = `<p class="ex-note" role="status">${esc(tr('Leyendo ZIP de Instagram en este dispositivo…'))}</p>`;
    const chats = [];
    try {
      for (const file of files) {
        const messages = await E().parseInstagramZip(file), threads = new Map();
        for (const m of messages) { const key = m.chat || file.name.replace(/\.zip$/i, ''); if (!threads.has(key)) threads.set(key, []); threads.get(key).push(m); }
        for (const [name, tm] of threads) chats.push({ name, platform: 'Instagram', messages: tm });
      }
      if (!chats.length) throw new Error(tr('No se encontraron conversaciones compatibles dentro del ZIP.'));
      chats.sort((a, b) => b.messages.length - a.messages.length);
      mountChats(chats, id);
    } catch (err) { box.innerHTML = `<p class="ex-status error" role="alert">${esc(err.message || tr('No se pudo importar el ZIP.'))}</p>`; }
  }
  function updatePreview() {
    const cv = node('exPreview'); if (!cv || !selectedChat()) return;
    const big = streakCanvas(); if (!big) return; const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(big, 0, 0, cv.width, cv.height);
  }
  async function importCompare(input) {
    const file = input.files && input.files[0]; if (!file) return;
    try {
      const messages = await parseAsync(await readChunks(file, () => {}), file.name.replace(/\.txt$/i, ''), file.size);
      if (!messages.length) throw new Error(tr('No se encontraron mensajes con un formato compatible.'));
      state.compare = { name: file.name.replace(/\.txt$/i, ''), messages }; render(); selectTab('curiosidad');
    } catch (err) { showModal(`${file.name}: ${err.message}`); }
    input.value = '';
  }
  function refreshPremiumUI() {
    let dev = false, rol = ''; try { dev = localStorage.getItem('golifiar-dev') === '1'; rol = localStorage.getItem('golifiar-rol') || ''; } catch (e) { /* sin almacenamiento */ }
    document.querySelectorAll('.dev-role').forEach(el => { el.hidden = !dev; const sel = el.querySelector('select'); if (sel) sel.value = rol === 'dev' ? 'dev' : 'user'; });
    const on = isPremium();
    document.querySelectorAll('.js-premium-state').forEach(el => { el.textContent = tr(on ? 'Premium activo en este dispositivo' : 'Funciones bloqueadas en la versión gratuita'); el.classList.toggle('on', on); });
  }
  document.addEventListener('DOMContentLoaded', () => refreshPremiumUI());
  function premiumDemo() { try { localStorage.setItem('golifiar-premium-demo', 'true'); } catch (e) { /* sin almacenamiento */ } refreshPremiumUI(); if (selectedChat()) render(); }
  function viralCard(kind) {
    const chat = selectedChat(); if (!chat) return;
    const messages = rangeMessages(chat), st = E().streaks(messages), dp = E().deep(messages), who = E().whoIsMore(messages);
    const nm = (n, i) => state.anon ? tr('Persona {n}', { n: i + 1 }) : n;
    let o;
    if (kind.startsWith('diploma:')) {
      const w = who.find(x => x.key === kind.slice(8)); if (!w) return;
      o = { kicker: tr('DIPLOMA OFICIAL'), big: '🎓', lines: [nm(w.name, 0), tr(E().DIPLOMAS[w.key]), `${tr(w.title)} · ${w.value}`, tr('(Documento satírico sin validez)')], bigSize: 220 };
    } else if (kind === 'adn') {
      if (!state.topicsEnabled) return showModal(tr('Activa el análisis de palabras para crear esta tarjeta.'));
      const d = E().emojiDna(messages, true); o = { kicker: tr('ADN DE LA CONVERSACIÓN'), big: d.emojis.map(e => e.emoji).join(' ') || '💬', lines: [`${tr('Palabra mágica')}: ${d.magicWord || '—'}`], bigSize: 190 };
    } else if (kind === 'vs') {
      const a = dp.members.find(m => m.name === state.chemistryA) || dp.members[0], b = dp.members.find(m => m.name === state.chemistryB && m !== a) || dp.members[1]; if (!a || !b) return showModal(tr('Datos insuficientes'));
      o = { kicker: tr('DUELO DE CHAT'), big: `${num(a.messages)} ⚔️ ${num(b.messages)}`, lines: [nm(a.name, 0) + ' vs ' + nm(b.name, 1), `${Math.round(a.share)}% – ${Math.round(b.share)}%`], bigSize: 130 };
    } else if (kind === 'turno') {
      o = { kicker: tr('TU TURNO'), big: `🔥 ${st.current || st.longest}`, lines: [tr('Mi racha de días hablando'), tr('¿Y la tuya? Súbela con Golifiar')] };
    } else if (kind === 'adivina') {
      o = { kicker: tr('ADIVINA EL RESULTADO'), big: '🤔', lines: [tr('¿Cuántos mensajes crees que llevamos?'), tr('A) menos de 1.000   B) 1.000–10.000'), tr('C) más de 10.000')], bigSize: 220 };
    } else if (kind === 'peligro') {
      o = { kicker: tr('PELIGRO DE RACHA'), big: `⚠️ ${st.current || st.longest}`, lines: [tr('Tu racha de {n} días vence hoy a las 23:59', { n: num(st.current || st.longest) })] };
    } else return;
    const c = simpleCard(o);
    c.toBlob(blob => { if (!blob) return showStatus(tr('No se pudo generar la tarjeta.'), true); saveBlob(blob, `golifiar-${kind.replace(':', '-')}.png`); }, 'image/png');
  }
  // Guarda un PNG: compartir en móvil, descarga clásica en escritorio y, si nada funciona, vista previa para guardar a mano.
  async function saveBlob(blob, filename) {
    try { const was = localStorage.getItem('golifiar-compare-ok') === '1'; localStorage.setItem('golifiar-compare-ok', '1'); if (!was && selectedChat()) setTimeout(render, 0); } catch (e) { /* sin almacenamiento */ }
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
    try {
      const file = new File([blob], filename, { type: 'image/png' });
      if (mobile && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Golifiar' }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const url = URL.createObjectURL(blob);
    let ok = false;
    try { const a = document.createElement('a'); a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove(); ok = !mobile || /Chrome/.test(navigator.userAgent) && !/wv\)/.test(navigator.userAgent); } catch (e) { ok = false; }
    if (ok) { showStatus(tr('Tarjeta descargada: {f}', { f: filename }), false); setTimeout(() => URL.revokeObjectURL(url), 30000); return; }
    const reader = new FileReader();
    reader.onload = () => showModal(tr('Mantén pulsada la imagen y elige «Guardar imagen».'), reader.result);
    reader.readAsDataURL(blob);
  }
  function downloadStreak(chatArg) {
    const c = streakCanvas(chatArg); if (!c) return;
    c.toBlob(blob => { if (!blob) return showStatus(tr('No se pudo generar la tarjeta.'), true); sound('ok'); saveBlob(blob, `golifiar-racha-${safeFile((chatArg || selectedChat()).name)}.png`); }, 'image/png');
  }
  function copyStreak(chatArg) {
    const c = streakCanvas(chatArg); if (!c) return;
    c.toBlob(async blob => {
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); showStatus(tr('Imagen copiada al portapapeles.'), false); }
      catch (e) { showModal(tr('Tu navegador no permite copiar imágenes. Usa «Descargar para Story».')); }
    }, 'image/png');
  }
  async function copyText(chatArg) {
    const chat = chatArg || selectedChat(); if (!chat) return;
    const msgs = chatArg ? chatArg.messages : rangeMessages(chat); const name = state.anon ? tr('Mi chat') : chat.name;
    try { await navigator.clipboard.writeText(E().summaryText(msgs, name)); showStatus(tr('Resumen copiado.'), false); } catch (e) { showModal(tr('No se pudo copiar el texto.')); }
  }

  function exportCard() {
    const chat = selectedChat(); if (!chat) return;
    const c = summaryCanvas(); if (!c) return;
    c.toBlob(blob => { if (!blob) return showStatus(tr('No se pudo generar la tarjeta.'), true); saveBlob(blob, `golifiar-wrapped-${safeFile(chat.name)}.png`); }, 'image/png');
  }
  function truncate(ctx, text, maxWidth, fontSize) { let value = String(text || ''); ctx.font = `bold ${fontSize}px system-ui, sans-serif`; while (value.length && ctx.measureText(value).width > maxWidth) value = value.slice(0,-2); return value === text ? value : `${value}…`; }
  function safeFile(s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'').slice(0,60) || 'chat'; }

  document.addEventListener('change', e => {
    if (e.target.id === 'exWhatsAppFiles') importWhatsApp(e.target);
    if (e.target.id === 'exInstagramFiles') importInstagram(e.target);
    if (e.target.id === 'exChatSelect') { state.selected = Number(e.target.value) || 0; render(); }
    if (e.target.id === 'exPeriodA') state.compareA = e.target.value;
    if (e.target.id === 'exPeriodB') state.compareB = e.target.value;
    if (e.target.id === 'exEnableTopics' || e.target.id === 'exEnableTopics2') { state.topicsEnabled = e.target.checked; render(); }
    if (e.target.id === 'exCardTheme') state.cardTheme = e.target.value;
    if (e.target.id === 'exCardShowWords') state.cardShowWords = e.target.checked;
    if (e.target.id === 'exCardShowStreak') state.cardShowStreak = e.target.checked;
    if (e.target.id === 'exRange') { state.range = e.target.value; render(); }
    if (e.target.id === 'exFrom') { state.from = e.target.value; render(); }
    if (e.target.id === 'exTo') { state.to = e.target.value; render(); }
    if (e.target.id === 'exLook') { state.cardLook = e.target.value; if (!FREE_LOOKS.includes(state.cardLook) && !isPremium()) { showStatus(tr('Los estilos Neón, Cyberpunk y Minimalista son Premium. Se usará el estilo Golifiar.'), false); } updatePreview(); }
    if (e.target.id === 'exAnon') state.anon = e.target.checked;
    if (e.target.id === 'exCompareFile') importCompare(e.target);
    if (e.target.id === 'edAv0' || e.target.id === 'edAv1') { const i = e.target.id === 'edAv1' ? 1 : 0, f = e.target.files && e.target.files[0]; if (f && root.createImageBitmap) root.createImageBitmap(f).then(bm => { state.avatars[i] = bm; updatePreview(); }).catch(() => showModal(tr('No se pudo leer la imagen.'))); }
    if (e.target.id === 'exHd') { state.hd = e.target.checked; updatePreview(); }
    if (e.target.id === 'exNoMark') { state.noMark = e.target.checked; updatePreview(); }
    if (e.target.id === 'edOn') { state.edit.on = e.target.checked; updatePreview(); }
    if (e.target.classList && e.target.classList.contains('js-dev-sel')) { try { localStorage.setItem('golifiar-rol', e.target.value === 'dev' ? 'dev' : ''); } catch (err) { /* sin almacenamiento */ } refreshPremiumUI(); if (selectedChat()) render(); }
    if (e.target.id === 'exChemA') { state.chemistryA = e.target.value; render(); }
    if (e.target.id === 'exChemB') { state.chemistryB = e.target.value; render(); }
  });
  document.addEventListener('input', e => {
    const m = { edBg1: 'bg1', edBg2: 'bg2', edAccent: 'accent', edText: 'text', edFont: 'font', edNumY: 'numY' }[e.target.id]; if (!m) return;
    state.edit[m] = m === 'numY' ? Number(e.target.value) : e.target.value; state.edit.on = true; const on = node('edOn'); if (on) on.checked = true; updatePreview();
  });
  document.addEventListener('click', e => {
    const button = e.target.closest('button'); if (!button) return;
    if (button.id === 'exCompareBtn') render();
    if (button.id === 'exClear') clearAll();
    if (button.dataset.card) viralCard(button.dataset.card);
    if (button.id === 'exNext' || button.id === 'exPrev') { state.slide = Math.max(0, state.slide + (button.id === 'exNext' ? 1 : -1)); render(); sound('ok'); }
    if (button.id === 'exStreakDl' || button.id === 'exStreakDl2') downloadStreak();
    if (button.id === 'exStreakCopy') copyStreak();
    if (button.id === 'exCopyText') copyText();
    if (button.id === 'exModalClose') node('exModal').hidden = true;
    if (button.dataset.extab) selectTab(button.dataset.extab);
    if (button.id === 'exExportCard' || button.id === 'exExportCard2') exportCard();
    if (button.id === 'exStartQuiz') startQuiz();
    if (button.classList.contains('ex-answer')) answerQuiz(button.dataset.answer || '');
  });
  function selectTab(key) {
    state.tab = key;
    document.querySelectorAll('[data-extab]').forEach(b => { const on = b.dataset.extab === key; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    document.querySelectorAll('.ex-pane').forEach(p => { p.hidden = p.id !== 'expane-' + key; });
  }
  document.addEventListener('keydown', e => {
    const tab = e.target && e.target.closest && e.target.closest('[data-extab]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const list = [...document.querySelectorAll('[data-extab]')]; let i = list.indexOf(tab);
    if (e.key === 'ArrowRight') i = (i + 1) % list.length; else if (e.key === 'ArrowLeft') i = (i - 1 + list.length) % list.length; else if (e.key === 'Home') i = 0; else i = list.length - 1;
    e.preventDefault(); list[i].focus(); selectTab(list[i].dataset.extab);
  });
  ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { const z = e.target.closest && e.target.closest('.dropzone'); if (z) z.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { const z = e.target.closest && e.target.closest('.dropzone'); if (z) z.classList.remove('dragover'); }));
  if (root.I18n && I18n.alAplicar) I18n.alAplicar(function () {
    refreshPremiumUI();
    ['exTagWhatsApp', 'exTagInstagram'].forEach(id => { const el = node(id); if (el && Number(el.dataset.n)) setTag(id, Number(el.dataset.n)); });
    render();
    const mt = node(state.mount); if (I18n.lang !== 'es' && mt) I18n.aplicar(mt);
  });
  root.GolifiarExperiencias = Object.freeze({ parseAsync, mountChats, mountInstagram, premium: { demo: premiumDemo, refresh: refreshPremiumUI }, share: { download: downloadStreak, copyImage: copyStreak, copyText, setAnon: v => { state.anon = Boolean(v); } }, importWhatsApp, importInstagram, render, getState: () => ({ chats: state.chats.map(c => ({name:c.name,platform:c.platform,messages:c.messages.length})), selected: state.selected }) });
}(typeof window !== 'undefined' ? window : globalThis));
