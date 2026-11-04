/* Interfaz de experiencias: todos los datos importados permanecen solo en memoria. */
(function (root) {
  'use strict';
  const E = () => root.GolifiarExperienciasEngine;
  const state = { tab: 'resumen', chats: [], selected: 0, compareA: '', compareB: '', chemistryA: '', chemistryB: '', quizIndex: 0, quizScore: 0, quiz: [], topicsEnabled: false, cardTheme: 'ocean', cardShowWords: true, cardShowStreak: true, range: 'all', from: '', to: '', anon: false, cardLook: 'canario' };
  const tr = (s, p) => typeof root.t === 'function' ? root.t(s, p) : s;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = n => root.I18n && I18n.num ? I18n.num(n) : new Intl.NumberFormat().format(n);
  const fmtDate = ts => new Date(ts).toLocaleDateString(root.I18n ? I18n.locale : undefined);
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
  async function importWhatsApp(input) {
    const files = [...(input.files || [])]; if (!files.length) return;
    const file = files[0];
    if (files.length > 1) showStatus(tr('Solo se analiza un chat por sesión; se ha usado el primero.'), false);
    if (!/\.txt$/i.test(file.name) && file.type !== 'text/plain') { showModal(tr('Este archivo no es un .txt de WhatsApp. Exporta el chat desde WhatsApp → Más → Exportar chat → Sin multimedia.')); input.value = ''; return; }
    try {
      setProgress(0);
      const messages = E().parseWhatsApp(await readChunks(file, setProgress), file.name.replace(/\.txt$/i, ''));
      if (!messages.length) throw new Error(tr('No se encontraron mensajes con un formato compatible.'));
      state.chats = state.chats.filter(c => c.platform !== 'WhatsApp');
      state.chats.unshift({ name: file.name.replace(/\.txt$/i, ''), platform: 'WhatsApp', messages });
      state.selected = 0; state.range = 'all';
      showStatus(tr('Importación completada: {n} conversaciones.', { n: 1 }), false); setTag('exTagWhatsApp', 1); sound('ok'); render();
    } catch (err) { showModal(`${file.name}: ${err.message || tr('No se pudo importar el archivo.')}`); }
    setProgress(null); input.value = '';
  }
  function showModal(text) {
    let m = node('exModal');
    if (!m) { m = document.createElement('div'); m.id = 'exModal'; m.className = 'ex-modal'; m.setAttribute('role', 'alertdialog'); m.setAttribute('aria-modal', 'true'); document.body.appendChild(m); }
    m.innerHTML = `<div class="ex-modal-box"><p>${esc(text)}</p><button type="button" class="btn-minimal" id="exModalClose">${esc(tr('Entendido'))}</button></div>`;
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
    input.value = ''; state.selected = Math.max(0, state.chats.length - 1); if (state.chats.length > startCount) { showStatus(tr('Importación completada: {n} conversaciones.', { n: num(state.chats.length - startCount) }), false); setTag('exTagInstagram', state.chats.filter(c => c.platform === 'Instagram').length); } render();
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
  const TABS = [['resumen', 'Resumen'], ['actividad', 'Actividad'], ['juegos', 'Juegos'], ['records', 'Récords y torneo'], ['wrapped', 'Wrapped']];
  function renderEmpty() {
    node('experienciasResults').innerHTML = '<section class="ex-card ex-empty"><h3>Empieza importando una conversación</h3><p>Elige un TXT exportado desde WhatsApp o un ZIP de datos de Instagram. Los archivos se procesan localmente y no se guardan en el dispositivo.</p></section>';
  }
  function render() {
    const results = node('experienciasResults'); if (!results) return;
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
    const chemistryResult = s.participants.length > 1 ? E().chemistry(messages, chemistryA, chemistryB) : { available: false };
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
    const shareHtml = `<section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Para compartir'))}</p><h3>${esc(tr('Tarjeta de racha para Story (9:16)'))}</h3><p>${esc(tr('Se genera en tu dispositivo. Nada se sube a ningún sitio.'))}</p></div></div><div class="ex-card-options"><label>${esc(tr('Estilo'))}<select id="exLook"><option value="canario">${esc(tr('Amarillo Canario'))}</option><option value="neon">${esc(tr('Neón'))} · Premium</option><option value="cyber">Cyberpunk · Premium</option><option value="mini">${esc(tr('Minimalista'))} · Premium</option></select></label><label><input type="checkbox" id="exAnon" ${state.anon ? 'checked' : ''}> ${esc(tr('Anonimizar nombres en la tarjeta'))}</label></div><div class="ex-share-actions"><button type="button" class="btn-minimal" id="exStreakDl">${esc(tr('Descargar para Story (9:16)'))}</button><button type="button" class="btn-sub" id="exStreakCopy">${esc(tr('Copiar imagen al portapapeles'))}</button><button type="button" class="btn-sub" id="exCopyText">${esc(tr('Copiar resumen para WhatsApp'))}</button></div></section>`;
    const all = `
      <!--pane:resumen--><section class="ex-card ex-profile"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Perfil del grupo'))}</p><h3>${esc(chat.name)}</h3><p>${esc(tr('Resumen calculado a partir de las fechas y participantes de la exportación.'))}</p></div><button type="button" class="btn-sub" id="exExportCard">${esc(tr('Crear tarjeta PNG'))}</button></div><div class="ex-kpis">${kpi('Mensajes analizados',num(s.totalMessages))}${kpi('Participantes',num(s.participantCount))}${kpi('Días activos',num(s.activeDays))}${kpi('Hora punta',s.peakHour === null ? '—' : `${String(s.peakHour).padStart(2,'0')}:00`)}</div><details class="ex-more" open><summary>${esc(tr('Más datos del chat'))}</summary><div class="ex-metrics">${metric('Racha actual',dias(st.current))}${metric('Racha más larga',dias(st.longest))}${metric('Conversaciones estimadas',num(s.sessionCount))}${metric('Quién inicia más',s.topInitiator ? `${s.topInitiator.name} · ${num(s.topInitiator.count)}` : '—')}${metric('Duración media',s.avgConversationDurationMs === null ? '—' : E().formatDuration(s.avgConversationDurationMs))}${metric('Mediana de respuesta',s.medianResponseMinutes === null ? '—' : E().formatDuration(s.medianResponseMinutes*60000))}${metric('Reacciones',num(s.totalReactions))}${metric('Contenido compartido',num(s.sharedContentMessages))}${metric('Respuestas a historias',s.storyReplies ? num(s.storyReplies) : '—',s.storyReplies ? '' : tr('Solo si el ZIP las identifica'))}</div></details><div class="ex-top-participants"><h4>${esc(tr('Participantes más activos'))}</h4><ul class="ex-bars">${s.participants.slice(0,6).map(p => `<li><span class="ex-bar-name">${esc(p.name)}</span><span class="ex-bar"><i style="width:${Math.max(3, Math.round(p.count / topCount * 100))}%"></i></span><strong>${num(p.count)}</strong></li>`).join('')}</ul></div><p class="ex-note">${s.firstMessage ? `${esc(fmtDate(s.firstMessage))} – ${esc(fmtDate(s.lastMessage))}` : ''} · ${esc(tr('El texto original no se muestra ni se guarda.'))}</p></section>
      <!--pane:resumen-->${dangerHtml}${deepHtml}
      <!--pane:actividad--><section class="ex-card"><h3>${esc(tr('Reloj de actividad'))}</h3>${heatHtml}</section>${chartsHtml}${compareHtml}
      <section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Calendario'))}</p><h3>${esc(tr('Actividad día a día'))}</h3></div></div>${calendarHtml}<div class="ex-mini-calendar">${daysHtml}</div></section>
      <!--pane:juegos--><section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Tests de curiosidad'))}</p><h3>${esc(tr('¿Quién es más...?'))}</h3></div></div>${whoHtml}<div class="ex-records">${ghostHtml}${funHtml}</div><p class="ex-note">${esc(tr('Son aproximaciones estadísticas y no describen la personalidad.'))}</p></section>
      <section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Chemistry Score'))}</p><h3>${esc(tr('Compatibilidad de horarios'))}</h3><p>${esc(tr('Resultado lúdico y orientativo, no científico.'))}</p></div></div><div class="ex-compare-controls"><label>${esc(tr('Persona A'))}<select id="exChemA">${peopleOptions}</select></label><label>${esc(tr('Persona B'))}<select id="exChemB">${peopleOptions}</select></label></div><p class="ex-discovery">${chemistryResult.available ? `<strong class="ex-score">${num(chemistryResult.score)}/100</strong> · ${esc(chemistryResult.explanation)}` : esc(tr('Datos insuficientes para calcularlo.'))}</p>${chemistryResult.available ? meter(chemistryResult.score) : ''}<p class="ex-note">${esc(tr('La fórmula usa 60% de equilibrio de mensajes y 40% de solapamiento horario.'))}</p></section>
      <section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Índice de equilibrio'))}</p><h3>${esc(tr('Reparto de participación'))}</h3></div></div><p class="ex-discovery">${balance.available ? `<strong class="ex-score">${num(balance.score)}/100</strong>` : esc(tr('Datos insuficientes'))}</p>${balance.available ? meter(balance.score) : ''}<p class="ex-note">${esc(balance.explanation || tr('Se necesitan al menos dos participantes.'))}</p></section>
      <!--pane:actividad--><section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Temas del chat'))}</p><h3>${esc(tr('Palabras más frecuentes'))}</h3><p>${esc(tr('Se calculan localmente en memoria; no se conserva el texto de los mensajes.'))}</p><label class="ex-topic-toggle"><input type="checkbox" id="exEnableTopics" ${state.topicsEnabled ? 'checked' : ''}> ${esc(tr('Activar análisis local de palabras'))}</label></div></div>${topicHtml}</section>
      <!--pane:records--><section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Galería de récords'))}</p><h3>${esc(tr('Trofeos y logros'))}</h3></div></div><div class="ex-achievements">${achievementsHtml}</div><h4>${esc(tr('Récords del chat'))}</h4><div class="ex-records">${recordsHtml}</div></section>
      <!--pane:wrapped-->${shareHtml}<section class="ex-card ex-wrapped"><div><p class="ex-kicker">${esc(tr('Tu resumen compartible'))}</p><h3>${esc(tr('Wrapped del chat'))}</h3><p>${esc(wrap.period)} · ${num(wrap.totalMessages)} ${esc(tr('mensajes'))} · ${num(wrap.participantCount)} ${esc(tr('participantes'))}</p><p>${esc(tr('Palabras destacadas'))}: ${state.topicsEnabled ? (wrap.topWords.map(esc).join(' · ') || '—') : esc(tr('Activa el análisis de palabras para incluirlas'))}</p><div class="ex-card-options"><label>${esc(tr('Estilo de tarjeta'))}<select id="exCardTheme"><option value="ocean">${esc(tr('Océano'))}</option><option value="violet">${esc(tr('Violeta'))}</option><option value="sunset">${esc(tr('Atardecer'))}</option></select></label><label><input type="checkbox" id="exCardShowWords" ${state.cardShowWords ? 'checked' : ''}> ${esc(tr('Incluir palabras'))}</label><label><input type="checkbox" id="exCardShowStreak" ${state.cardShowStreak ? 'checked' : ''}> ${esc(tr('Incluir racha'))}</label></div></div><button type="button" class="btn-minimal" id="exExportCard2">${esc(tr('Descargar tarjeta'))}</button></section>
      <!--pane:juegos--><section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Modo fiesta'))}</p><h3>${esc(tr('Pon a prueba al grupo'))}</h3><p>${esc(tr('Preguntas generadas con estadísticas, sin revelar mensajes privados.'))}</p></div></div><div id="exPartyArea">${renderQuizIntro()}</div></section>
      <!--pane:records--><section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Torneo entre chats'))}</p><h3>${esc(tr('¿Qué chat tiene más actividad relativa?'))}</h3><p>${esc(tr('La puntuación combina mensajes por participante y por día activo para reducir la ventaja de los grupos grandes.'))}</p></div></div>${renderTournament()}</section>
      <!--pane:resumen--><section class="ex-card"><div class="ex-section-head"><div><p class="ex-kicker">${esc(tr('Descubrimiento diario'))}</p><h3>${esc(tr('Una curiosidad de hoy'))}</h3></div></div><p class="ex-discovery">${esc(dailyDiscoveryText(messages))}</p></section>`;
    const panes = {}; const parts = all.split(/<!--pane:(\w+)-->/);
    for (let i = 1; i < parts.length; i += 2) panes[parts[i]] = (panes[parts[i]] || '') + parts[i + 1];
    if (!TABS.some(t => t[0] === state.tab)) state.tab = 'resumen';
    const tabsHtml = `<div class="category-tabs ex-tabs" role="tablist" aria-label="${esc(tr('Secciones de Experiencias'))}">${TABS.map(([k, l]) => `<button type="button" role="tab" class="cat-tab${k === state.tab ? ' active' : ''}" id="extab-${k}" data-extab="${k}" aria-controls="expane-${k}" aria-selected="${k === state.tab}" tabindex="${k === state.tab ? 0 : -1}">${esc(tr(l))}</button>`).join('')}</div>`;
    const panesHtml = TABS.map(([k]) => `<div role="tabpanel" class="ex-pane" id="expane-${k}" aria-labelledby="extab-${k}"${k === state.tab ? '' : ' hidden'}>${panes[k] || ''}</div>`).join('');
    results.innerHTML = `<section class="ex-toolbar"><div class="ex-chat-picker"><label for="exChatSelect">${esc(tr('Conversación seleccionada'))}</label><select id="exChatSelect">${options}</select><span class="ex-platform">${esc(chat.platform)}</span></div><button type="button" class="btn-sub" id="exClear">${esc(tr('Borrar chats importados'))}</button></section>${rangeHtml}${tabsHtml}${panesHtml}`;
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
  const LOOKS = {
    canario: { bg: ['#0f0f14', '#2a2210'], accent: '#FFD21F', text: '#ffffff', sub: '#c9c3ad' },
    neon: { bg: ['#05010f', '#1b0a4a'], accent: '#39ff14', text: '#ffffff', sub: '#b8a7ff' },
    cyber: { bg: ['#12002b', '#3a0057'], accent: '#ff2bd6', text: '#00f0ff', sub: '#e9a8ff' },
    mini: { bg: ['#fafafa', '#e9e9ee'], accent: '#111111', text: '#111111', sub: '#555555' }
  };
  const AV = ['#FFD21F', '#ff7a59', '#4cc9f0', '#9b5de5', '#43aa8b', '#f15bb5'];
  function streakCanvas(chatArg) {
    const chat = chatArg || selectedChat(); if (!chat) return null;
    const messages = chatArg ? chatArg.messages : rangeMessages(chat), st = E().streaks(messages), dp = E().deep(messages);
    let look = state.cardLook;
    if (look !== 'canario' && !(root.premiumActivo && root.premiumActivo())) look = 'canario';
    const L = LOOKS[look] || LOOKS.canario;
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1920; const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 1920); g.addColorStop(0, L.bg[0]); g.addColorStop(1, L.bg[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1920);
    const glow = ctx.createRadialGradient(540, 820, 40, 540, 820, 620); glow.addColorStop(0, L.accent + '55'); glow.addColorStop(1, 'transparent'); ctx.fillStyle = glow; ctx.fillRect(0, 0, 1080, 1920);
    ctx.textAlign = 'center'; ctx.fillStyle = L.sub; ctx.font = '600 38px system-ui, sans-serif';
    const plat = chat.platform || 'WhatsApp';
    ctx.fillText(tr('Días hablando en {plat}', { plat }), 540, 250);
    const people = (dp.isGroup ? dp.podium : dp.members.slice(0, 2)).map((m, i) => ({ name: state.anon ? tr('Persona {n}', { n: i + 1 }) : m.name, i }));
    const n = Math.max(1, people.length), gap = 230, x0 = 540 - (n - 1) * gap / 2;
    people.forEach((p, k) => { const x = x0 + k * gap; ctx.fillStyle = AV[p.i % 6]; ctx.beginPath(); ctx.arc(x, 420, 90, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#111'; ctx.font = 'bold 64px system-ui, sans-serif'; ctx.fillText(state.anon ? String(p.i + 1) : initials(p.name), x, 442); ctx.fillStyle = L.text; ctx.font = '600 34px system-ui, sans-serif'; ctx.fillText(truncate(ctx, '@' + p.name.toLowerCase().replace(/\s+/g, ''), 210, 34), x, 570); });
    const days = st.current || st.longest;
    ctx.fillStyle = L.accent; ctx.font = 'bold 340px system-ui, sans-serif'; ctx.fillText(`🔥 ${days}`, 540, 1000);
    ctx.fillStyle = L.text; ctx.font = 'bold 56px system-ui, sans-serif'; ctx.fillText(tr(st.current ? 'días seguidos' : 'racha más larga'), 540, 1100);
    const heat = Math.min(7, Math.max(1, Math.round(days / 5)));
    ctx.font = '70px system-ui, sans-serif'; ctx.fillText('🔥'.repeat(heat), 540, 1230);
    ctx.fillStyle = L.sub; ctx.font = '40px system-ui, sans-serif'; ctx.fillText(`${num(dp.totalMessages)} ${tr('mensajes')} · ${num(dp.words)} ${tr('palabras')}`, 540, 1380);
    ctx.fillStyle = L.accent; ctx.font = 'bold 76px system-ui, sans-serif'; ctx.fillText('Golifiar', 540, 1700);
    ctx.fillStyle = L.sub; ctx.font = '34px system-ui, sans-serif'; ctx.fillText(tr('Analiza tu chat en tu dispositivo · golifiar'), 540, 1770);
    return canvas;
  }
  function downloadStreak(chatArg) {
    const c = streakCanvas(chatArg); if (!c) return;
    c.toBlob(blob => { if (!blob) return showStatus(tr('No se pudo generar la tarjeta.'), true); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `golifiar-racha-${safeFile((chatArg || selectedChat()).name)}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); sound('ok'); }, 'image/png');
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
    const data = E().toCardData(state.topicsEnabled ? chat.messages : chat.messages.map(m => ({ ...m, text: '' })), chat.name);
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    const palettes = { ocean: ['#0b6e99','#6542a6'], violet: ['#4c1d95','#c026d3'], sunset: ['#9a3412','#db2777'] }; const palette = palettes[state.cardTheme] || palettes.ocean; const gradient = ctx.createLinearGradient(0,0,1080,1350); gradient.addColorStop(0,palette[0]); gradient.addColorStop(1,palette[1]); ctx.fillStyle = gradient; ctx.fillRect(0,0,1080,1350);
    ctx.fillStyle = 'rgba(255,255,255,.13)'; if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(55,55,970,1240,34); ctx.fill(); } else { ctx.fillRect(55,55,970,1240); }
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.font = 'bold 42px system-ui'; ctx.fillText('GOLIFIAR · CHAT WRAPPED', 100, 145);
    ctx.font = 'bold 56px system-ui'; ctx.fillText(truncate(ctx, data.title, 820, 58), 100, 260);
    ctx.font = 'bold 108px system-ui'; ctx.fillText(num(data.totalMessages), 100, 445);
    ctx.font = '32px system-ui'; ctx.fillText(tr('mensajes'), 105, 500);
    ctx.font = 'bold 46px system-ui'; ctx.fillText(`${num(data.participantCount)} ${tr('participantes')}`, 100, 620);
    ctx.font = '38px system-ui'; ctx.fillText(`${num(data.activeDays)} ${tr('días activos')}`, 100, 700);
    ctx.fillText(`${tr('Hora punta')}: ${data.peakHour === null ? '—' : `${String(data.peakHour).padStart(2,'0')}:00`}`, 100, 780);
    if (state.cardShowWords && state.topicsEnabled) { ctx.font = 'bold 34px system-ui'; ctx.fillText(tr('Palabras destacadas'), 100, 980); ctx.font = '32px system-ui'; ctx.fillText(truncate(ctx, data.topWords.join(' · ') || '—', 820, 32), 100, 1040); }
    if (state.cardShowStreak) { ctx.font = '32px system-ui'; ctx.fillText(`${tr('Racha más larga')}: ${data.longestStreak} ${tr('días')}`, 100, 920); }
    ctx.font = '28px system-ui'; ctx.fillText(tr('Generado localmente por Golifiar'), 100, 1200);
    canvas.toBlob(blob => { if (!blob) return showStatus(tr('No se pudo generar la tarjeta.'), true); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `golifiar-wrapped-${safeFile(chat.name)}.png`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }, 'image/png');
  }
  function truncate(ctx, text, maxWidth, fontSize) { let value = String(text || ''); ctx.font = `bold ${fontSize}px system-ui`; while (value.length && ctx.measureText(value).width > maxWidth) value = value.slice(0,-2); return value === text ? value : `${value}…`; }
  function safeFile(s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'').slice(0,60) || 'chat'; }

  document.addEventListener('change', e => {
    if (e.target.id === 'exWhatsAppFiles') importWhatsApp(e.target);
    if (e.target.id === 'exInstagramFiles') importInstagram(e.target);
    if (e.target.id === 'exChatSelect') { state.selected = Number(e.target.value) || 0; render(); }
    if (e.target.id === 'exPeriodA') state.compareA = e.target.value;
    if (e.target.id === 'exPeriodB') state.compareB = e.target.value;
    if (e.target.id === 'exEnableTopics') { state.topicsEnabled = e.target.checked; render(); }
    if (e.target.id === 'exCardTheme') state.cardTheme = e.target.value;
    if (e.target.id === 'exCardShowWords') state.cardShowWords = e.target.checked;
    if (e.target.id === 'exCardShowStreak') state.cardShowStreak = e.target.checked;
    if (e.target.id === 'exRange') { state.range = e.target.value; render(); }
    if (e.target.id === 'exFrom') { state.from = e.target.value; render(); }
    if (e.target.id === 'exTo') { state.to = e.target.value; render(); }
    if (e.target.id === 'exLook') { state.cardLook = e.target.value; if (state.cardLook !== 'canario' && !(root.premiumActivo && root.premiumActivo())) { showStatus(tr('Los estilos Neón, Cyberpunk y Minimalista son Premium. Se usará Amarillo Canario.'), false); } }
    if (e.target.id === 'exAnon') state.anon = e.target.checked;
    if (e.target.id === 'exChemA') { state.chemistryA = e.target.value; render(); }
    if (e.target.id === 'exChemB') { state.chemistryB = e.target.value; render(); }
  });
  document.addEventListener('click', e => {
    const button = e.target.closest('button'); if (!button) return;
    if (button.id === 'exCompareBtn') render();
    if (button.id === 'exClear') clearAll();
    if (button.id === 'exStreakDl') downloadStreak();
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
    ['exTagWhatsApp', 'exTagInstagram'].forEach(id => { const el = node(id); if (el && Number(el.dataset.n)) setTag(id, Number(el.dataset.n)); });
    render();
    if (I18n.lang !== 'es' && node('experienciasResults')) I18n.aplicar(node('experienciasResults'));
  });
  root.GolifiarExperiencias = Object.freeze({ share: { download: downloadStreak, copyImage: copyStreak, copyText, setAnon: v => { state.anon = Boolean(v); } }, importWhatsApp, importInstagram, render, getState: () => ({ chats: state.chats.map(c => ({name:c.name,platform:c.platform,messages:c.messages.length})), selected: state.selected }) });
}(typeof window !== 'undefined' ? window : globalThis));
