/* Golifiar · experiencias de chat. Sin dependencias externas ni almacenamiento de mensajes. */
(function (root) {
  'use strict';
  const STOP = new Set(('a al algo algunas algunos ante antes como con contra cual cuando de del desde donde durante e el ella ellas ellos en entre era erais eran eras eres es esa esas ese eso esos esta estaba estaban estado estamos estan estar estas este esto estos fue fueron ha habia han hasta hay la las le les lo los mas me mi mis mucha muchas mucho muchos muy nada ni no nos o os otra otras otro otros para pero poco por porque que quien se sea ser si sin sobre son su sus te tiene todo todos tu tus un una unas uno unos y ya the and for are but not you your with from this that have has was were its our we they them a an in on is it as at be or if').split(/\s+/));

  function safeDate(value) {
    const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isFinite(d.getTime()) ? d.getTime() : null;
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function dayKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
  function monthKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }
  function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function normalizeMessages(input, defaults) {
    const cfg = defaults || {};
    return (Array.isArray(input) ? input : []).map((m) => {
      const timestamp = safeDate(m.timestamp ?? m.timestamp_ms ?? m.date);
      const sender = String(m.sender ?? m.sender_name ?? m.participante ?? '').trim();
      if (timestamp === null || !sender) return null;
      return { timestamp, sender, text: typeof m.text === 'string' ? m.text : (typeof m.content === 'string' ? m.content : ''), platform: m.platform || cfg.platform || 'unknown', chat: m.chat || cfg.chat || 'Chat', reactions: Array.isArray(m.reactions) ? m.reactions.length : Number(m.reactions || 0), attachmentsCount: Number(m.attachmentsCount || 0), isStoryReply: Boolean(m.isStoryReply) };
    }).filter(Boolean).sort((a,b) => a.timestamp - b.timestamp);
  }

  function parseDateParts(d, m, y, h, min, ampm) {
    let day = Number(d), month = Number(m), year = Number(y);
    if (year < 100) year += 2000;
    // Exportes en español suelen usar dd/mm/yyyy; cambia a mm/dd si el primer campo no puede ser mes.
    if (month > 12 && day <= 12) [day, month] = [month, day];
    let hour = Number(h);
    if (ampm) {
      const a = ampm.toLowerCase().startsWith('p');
      if (hour === 12) hour = a ? 12 : 0; else if (a) hour += 12;
    }
    const dt = new Date(year, month - 1, day, hour, Number(min), 0, 0);
    if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day || dt.getHours() !== hour || dt.getMinutes() !== Number(min)) return null;
    return dt.getTime();
  }

  function parseWhatsApp(text, chatName) {
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
    const patterns = [
      /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?m?\.?\]\s*(.+?):\s?(.*)$/i,
      /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?m?\.?\s*-\s*(.+?):\s?(.*)$/i,
      /^(\d{4})-(\d{1,2})-(\d{1,2}),?\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*-\s*(.+?):\s?(.*)$/i
    ];
    const messages = [];
    for (const line of lines) {
      let match, patternIndex = -1;
      for (let i = 0; i < patterns.length; i++) { match = line.match(patterns[i]); if (match) { patternIndex = i; break; } }
      if (match) {
        let timestamp, sender, body;
        if (patternIndex === 2) {
          const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
          const dt = new Date(year, month - 1, day, Number(match[4]), Number(match[5]));
          timestamp = dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day ? dt.getTime() : null;
          sender = match[6]; body = match[7];
        } else {
          timestamp = parseDateParts(match[1], match[2], match[3], match[4], match[5], match[6]);
          sender = match[7]; body = match[8];
        }
        if (timestamp !== null && sender && !/^\s*$/.test(sender)) messages.push({ timestamp, sender: sender.replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim(), text: body || '', platform: 'whatsapp', chat: chatName || 'WhatsApp' });
      } else if (messages.length && line.trim()) {
        // Las líneas continuadas se mantienen solo en memoria para el análisis local de palabras.
        messages[messages.length - 1].text += ` ${line.trim()}`;
      }
    }
    return normalizeMessages(messages, { platform: 'whatsapp', chat: chatName || 'WhatsApp' });
  }

  // Meta exporta el UTF-8 leído como latin-1 («JosÃ©»): se corrige solo si el texto lo parece.
  function fixText(v) {
    if (typeof v !== 'string' || !/[ÃÂ]/.test(v)) return v;
    try { return decodeURIComponent(escape(v)); } catch (e) { return v; }
  }
  function parseInstagramThread(json, chatName) {
    const obj = typeof json === 'string' ? JSON.parse(json) : json;
    const messages = Array.isArray(obj && obj.messages) ? obj.messages : [];
    return normalizeMessages(messages.map(m => ({
      timestamp: m.timestamp_ms ?? m.timestamp,
      sender: fixText(m.sender_name || m.sender || 'Desconocido'),
      text: typeof m.content === 'string' ? fixText(m.content) : '',
      platform: 'instagram', chat: fixText(chatName || (obj.title || (obj.participants || []).map(p => p.name).join(', ') || 'Instagram')),
      reactions: m.reactions,
      attachmentsCount: ['photos','videos','audio_files','files','share'].reduce((n, key) => n + (m[key] ? (Array.isArray(m[key]) ? m[key].length : 1) : 0), 0),
      isStoryReply: /story|historia/i.test(JSON.stringify(m.share || {})) || /replied to your story|respondio a tu historia|respondió a tu historia/i.test(String(m.content || ''))
    })), { platform: 'instagram', chat: fixText(chatName || obj.title || 'Instagram') });
  }

  async function parseInstagramZip(file) {
    // Reutiliza el lector ZIP por streaming del proyecto; no descomprime el ZIP entero en memoria.
    if (!root.zip || !root.zip.ZipReader || !root.zip.BlobReader || !root.zip.TextWriter) {
      throw new Error('No está disponible el lector ZIP por streaming. Comprueba que www/vendor/zip-inflate.min.js se haya cargado correctamente.');
    }
    root.zip.configure({ useWebWorkers: false });
    const reader = new root.zip.ZipReader(new root.zip.BlobReader(file));
    const all = [];
    try {
      const entries = await reader.getEntries();
      const paths = entries.filter(e => !e.directory && /(?:^|\/)messages\/inbox\/.*\/message_\d+\.json$/i.test(e.filename));
      for (const entry of paths) {
        try {
          const obj = JSON.parse(await entry.getData(new root.zip.TextWriter()));
          const threadName = obj.title || entry.filename.split('/').slice(-2, -1)[0].replace(/_/g, ' ');
          all.push(...parseInstagramThread(obj, threadName));
        } catch (err) { /* Archivos no compatibles se omiten; se informa si no queda ningún mensaje. */ }
      }
    } finally {
      await reader.close().catch(() => {});
    }
    return normalizeMessages(all, { platform: 'instagram', chat: file.name || 'Instagram' });
  }

  function stats(messages) {
    const ms = normalizeMessages(messages);
    const participants = new Map(), hours = Array(24).fill(0), days = new Map(), months = new Map();
    for (const m of ms) {
      participants.set(m.sender, (participants.get(m.sender) || 0) + 1);
      const d = new Date(m.timestamp); hours[d.getHours()]++;
      const dk = dayKey(m.timestamp); days.set(dk, (days.get(dk) || 0) + 1);
      const mk = monthKey(m.timestamp); months.set(mk, (months.get(mk) || 0) + 1);
    }
    const ranking = [...participants.entries()].map(([name,count]) => ({ name, count })).sort((a,b) => b.count-a.count || a.name.localeCompare(b.name));
    const activeDays = [...days.keys()].sort();
    const peakHour = ms.length ? hours.indexOf(Math.max(...hours)) : null;
    const activeDates = activeDays.map(x => new Date(`${x}T12:00:00`).getTime());
    let longestGap = null, totalReactions = 0, sharedContentMessages = 0, storyReplies = 0;
    const responseMinutes = [], conversationStarts = new Map(), sessions = [];
    const SESSION_GAP_MS = 6 * 60 * 60 * 1000;
    for (let i=0; i<ms.length; i++) {
      totalReactions += Number(ms[i].reactions || 0);
      if (Number(ms[i].attachmentsCount || 0) > 0) sharedContentMessages++;
      if (ms[i].isStoryReply) storyReplies++;
      if (i === 0 || ms[i].timestamp - ms[i-1].timestamp > SESSION_GAP_MS) {
        conversationStarts.set(ms[i].sender, (conversationStarts.get(ms[i].sender) || 0) + 1);
        sessions.push({ start: ms[i].timestamp, end: ms[i].timestamp, count: 1, initiator: ms[i].sender });
      } else {
        const current = sessions[sessions.length-1]; current.end = ms[i].timestamp; current.count++;
      }
      if (i === 0) continue;
      const gap = ms[i].timestamp - ms[i-1].timestamp;
      if (longestGap === null || gap > longestGap) longestGap = gap;
      // Estimación conservadora: solo se considera respuesta si cambia el remitente y el intervalo es <= 24 h.
      if (ms[i].sender !== ms[i-1].sender && gap > 0 && gap <= 24*60*60*1000) responseMinutes.push(gap / 60000);
    }
    responseMinutes.sort((a,b) => a-b);
    const medianResponseMinutes = responseMinutes.length ? (responseMinutes.length % 2 ? responseMinutes[(responseMinutes.length-1)/2] : (responseMinutes[responseMinutes.length/2-1] + responseMinutes[responseMinutes.length/2])/2) : null;
    const initiatorRanking = [...conversationStarts.entries()].map(([name,count]) => ({ name, count })).sort((a,b) => b.count-a.count || a.name.localeCompare(b.name));
    const avgConversationDurationMs = sessions.length ? sessions.reduce((n,session) => n + (session.end-session.start),0) / sessions.length : null;
    return { totalMessages: ms.length, participants: ranking, participantCount: ranking.length, activeDays: activeDays.length, activeDates, days: Object.fromEntries(days), months: Object.fromEntries(months), hours, peakHour, topSender: ranking[0] || null, firstMessage: ms[0]?.timestamp ?? null, lastMessage: ms[ms.length-1]?.timestamp ?? null, longestGapMs: longestGap, messagesPerActiveDay: activeDays.length ? ms.length / activeDays.length : 0, totalReactions, sharedContentMessages, storyReplies, responseCount: responseMinutes.length, medianResponseMinutes, sessionCount: sessions.length, conversationStarts: initiatorRanking, topInitiator: initiatorRanking[0] || null, avgConversationDurationMs };
  }

  function calendar(messages) {
    const s = stats(messages);
    return Object.entries(s.days).map(([date, count]) => ({ date, count, level: count === 0 ? 0 : count < 5 ? 1 : count < 20 ? 2 : count < 50 ? 3 : 4 })).sort((a,b) => a.date.localeCompare(b.date));
  }

  function streaks(messages) {
    const dates = [...new Set(normalizeMessages(messages).map(m => dayKey(m.timestamp)))].sort();
    if (!dates.length) return { current: 0, longest: 0, activeDays: 0 };
    const ord = s => Math.floor(new Date(`${s}T12:00:00`).getTime() / 86400000);
    let longest = 1, run = 1;
    for (let i=1; i<dates.length; i++) { if (ord(dates[i]) - ord(dates[i-1]) === 1) run++; else run = 1; longest = Math.max(longest, run); }
    const today = dayKey(Date.now()), yesterday = dayKey(Date.now() - 86400000);
    let current = 0, cursor = ord(dates[dates.length - 1]);
    if (dates[dates.length - 1] !== today && dates[dates.length - 1] !== yesterday) return { current: 0, longest, activeDays: dates.length };
    for (let i=dates.length-1; i>=0; i--) { if (ord(dates[i]) === cursor) { current++; cursor--; } else if (ord(dates[i]) < cursor) break; }
    return { current, longest, activeDays: dates.length };
  }

  function comparePeriods(messages, periodA, periodB) {
    const ms = normalizeMessages(messages);
    const pick = p => ms.filter(m => monthKey(m.timestamp) === p);
    const a = stats(pick(periodA)), b = stats(pick(periodB));
    const keys = ['totalMessages','participantCount','activeDays','messagesPerActiveDay'];
    const metrics = {};
    for (const k of keys) {
      const av = a[k] || 0, bv = b[k] || 0;
      metrics[k] = { a: av, b: bv, difference: bv-av, percent: av === 0 ? (bv === 0 ? 0 : null) : ((bv-av)/av)*100 };
    }
    return { periodA, periodB, a, b, metrics };
  }

  function topics(messages, limit) {
    const counts = new Map();
    for (const m of normalizeMessages(messages)) {
      const text = String(m.text || '').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const words = text.match(/[a-zñ]{3,}/g) || [];
      for (const w of words) if (!STOP.has(w) && !/^\d+$/.test(w)) counts.set(w, (counts.get(w) || 0) + 1);
    }
    return [...counts.entries()].map(([word,count]) => ({ word, count })).sort((a,b) => b.count-a.count || a.word.localeCompare(b.word)).slice(0, Math.max(1, limit || 20));
  }

  function funTests(messages) {
      const ms = normalizeMessages(messages);
      if (!ms.length) return [];
      const bySender = new Map();
      for (const m of ms) {
        const current = bySender.get(m.sender) || { name: m.sender, messages: 0, night: 0, expressive: 0 };
        current.messages++;
        const hour = new Date(m.timestamp).getHours();
        if (hour < 6) current.night++;
        current.expressive += (m.text.match(/[!?¡¿]/g) || []).length
          + (m.text.match(/\p{Extended_Pictographic}/gu) || []).length
          + (m.text.match(/\p{Lu}/gu) || []).length * 0.15;
        bySender.set(m.sender, current);
      }
      const people = [...bySender.values()];
      const nocturnal = [...people].sort((a, b) => b.night / b.messages - a.night / a.messages || b.messages - a.messages)[0];
      const expressive = [...people].sort((a, b) => b.expressive / b.messages - a.expressive / a.messages || b.messages - a.messages)[0];
      const initiator = stats(ms).topInitiator;
      return [
        { key: 'nocturnal', title: 'Más nocturno', name: nocturnal.name, value: `${Math.round(nocturnal.night / nocturnal.messages * 100)}%`, explanation: 'Porcentaje de mensajes entre las 00:00 y las 06:00.' },
        { key: 'expressive', title: 'Más expresivo', name: expressive.name, value: Math.round(expressive.expressive / expressive.messages * 10) / 10, explanation: 'Puntuación basada en signos, emojis y mayúsculas; no describe la personalidad.' },
        { key: 'initiator', title: 'Inicia más conversaciones', name: initiator ? initiator.name : null, value: initiator ? initiator.count : null, explanation: 'Primera persona que escribe tras una pausa de seis horas o más.' }
      ];
    }

  function balance(messages) {
      const ranking = stats(messages).participants;
      if (ranking.length < 2) return { available: false, score: null };
      const total = ranking.reduce((sum, p) => sum + p.count, 0);
      const shares = ranking.map(p => p.count / total).filter(Boolean);
      const entropy = -shares.reduce((sum, share) => sum + share * Math.log(share), 0);
      return { available: true, score: Math.round(entropy / Math.log(shares.length) * 100), explanation: '0 concentra la actividad en una persona; 100 indica reparto uniforme.' };
    }

  function chemistry(messages, nameA, nameB) {
      const ms = normalizeMessages(messages).filter(m => m.sender === nameA || m.sender === nameB);
      if (!nameA || !nameB || nameA === nameB || ms.length < 4) return { available: false, score: null };
      const counts = [ms.filter(m => m.sender === nameA).length, ms.filter(m => m.sender === nameB).length];
      if (!counts[0] || !counts[1]) return { available: false, score: null };
      const balanceScore = Math.min(...counts) / Math.max(...counts);
      const hoursA = new Set(ms.filter(m => m.sender === nameA).map(m => new Date(m.timestamp).getHours()));
      const hoursB = new Set(ms.filter(m => m.sender === nameB).map(m => new Date(m.timestamp).getHours()));
      const overlap = [...hoursA].filter(hour => hoursB.has(hour)).length / new Set([...hoursA, ...hoursB]).size;
      return { available: true, score: Math.round((balanceScore * 0.6 + overlap * 0.4) * 100), explanation: '60% equilibrio de mensajes y 40% solapamiento horario. Es orientativo y no científico.' };
  }

  function records(messages) {
    const ms = normalizeMessages(messages), s = stats(ms), streak = streaks(ms);
    const dayEntries = Object.entries(s.days).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
    const top = s.participants[0];
    return [
      { key: 'mostMessages', title: 'Día con más mensajes', value: dayEntries[0] ? `${dayEntries[0][0]} · ${dayEntries[0][1]}` : 'Sin datos' },
      { key: 'topParticipant', title: 'Más mensajes', value: top ? `${top.name} · ${top.count}` : 'Sin datos' },
      { key: 'longestStreak', title: 'Racha más larga', value: `${streak.longest} días` },
      { key: 'peakHour', title: 'Hora punta', value: s.peakHour === null ? 'Sin datos' : `${String(s.peakHour).padStart(2,'0')}:00` },
      { key: 'longestPause', title: 'Mayor pausa entre mensajes', value: s.longestGapMs === null ? 'Sin datos' : formatDuration(s.longestGapMs) }
    ];
  }
  function achievements(messages) {
    const s = stats(messages), st = streaks(messages);
    const spanDays = s.firstMessage && s.lastMessage ? Math.floor((s.lastMessage - s.firstMessage) / 86400000) + 1 : 0;
    const candidates = [
      { key: 'firstMessage', title: 'Primeros pasos', description: 'La primera conversación ya está analizada.', icon: '🌱', unlocked: s.totalMessages >= 1 },
      { key: 'hundred', title: 'Centenario', description: 'Has analizado al menos 100 mensajes.', icon: '💬', unlocked: s.totalMessages >= 100 },
      { key: 'fiveHundred', title: 'Charla larga', description: 'Has analizado al menos 500 mensajes.', icon: '🗣️', unlocked: s.totalMessages >= 500 },
      { key: 'thousand', title: 'Mil y una historias', description: 'Has analizado al menos 1.000 mensajes.', icon: '🏅', unlocked: s.totalMessages >= 1000 },
      { key: 'week', title: 'Una semana presente', description: 'El chat tiene actividad en 7 días distintos.', icon: '📆', unlocked: s.activeDays >= 7 },
      { key: 'month', title: 'Costumbre de grupo', description: 'El chat tiene actividad en 30 días distintos.', icon: '🗓️', unlocked: s.activeDays >= 30 },
      { key: 'streak7', title: 'Racha de siete', description: 'Se registró una racha de 7 días consecutivos.', icon: '🔥', unlocked: st.longest >= 7 },
      { key: 'span30', title: 'De largo recorrido', description: 'La exportación cubre al menos 30 días entre el primer y último mensaje.', icon: '🧭', unlocked: spanDays >= 30 },
      { key: 'crew', title: 'Buen grupo', description: 'Participan al menos 5 personas.', icon: '👥', unlocked: s.participantCount >= 5 }
    ];
    return candidates.filter(x => x.unlocked);
  }

  function formatDuration(ms) {
    const mins = Math.round(ms / 60000), days = Math.floor(mins / 1440), hours = Math.floor((mins % 1440) / 60), minutes = mins % 60;
    if (days) return `${days} d ${hours} h`; if (hours) return `${hours} h ${minutes} min`; return `${minutes} min`;
  }

  function wrapped(messages, name) {
    const s = stats(messages), st = streaks(messages), t = topics(messages, 3);
    return { title: name || 'Tu chat en cifras', totalMessages: s.totalMessages, participantCount: s.participantCount, activeDays: s.activeDays, peakHour: s.peakHour, medianResponseMinutes: s.medianResponseMinutes, sessionCount: s.sessionCount, topInitiator: s.topInitiator?.name || null, avgConversationDurationMs: s.avgConversationDurationMs, totalReactions: s.totalReactions, sharedContentMessages: s.sharedContentMessages, storyReplies: s.storyReplies, topParticipant: s.topSender?.name || null, longestStreak: st.longest, topWords: t.map(x => x.word), period: s.firstMessage && s.lastMessage ? `${new Date(s.firstMessage).getFullYear()}–${new Date(s.lastMessage).getFullYear()}` : 'Sin fechas' };
  }

  function dailyDiscovery(messages, date) {
    const s = stats(messages), st = streaks(messages), rec = records(messages);
    const choices = [
      () => `El chat acumula ${s.totalMessages} mensajes en ${s.activeDays} días activos.`,
      () => s.peakHour === null ? 'Todavía no hay suficientes datos para descubrir la hora punta.' : `La hora con más actividad es alrededor de las ${String(s.peakHour).padStart(2,'0')}:00.`,
      () => `La racha más larga registrada es de ${st.longest} días.`,
      () => s.topSender ? `${s.topSender.name} aparece en el primer puesto por cantidad de mensajes.` : 'Importa una conversación para descubrir una estadística.',
      () => rec[0].value === 'Sin datos' ? 'Importa una conversación para descubrir el día más activo.' : `El récord de día más activo es ${rec[0].value}.`
    ];
    const seed = String(date || dayKey(Date.now())).split('').reduce((a,c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    return choices[seed % choices.length]();
  }

  function partyQuiz(messages) {
    const s = stats(messages), rec = records(messages);
    const questions = [];
    if (s.topSender) questions.push({ question: '¿Quién ha enviado más mensajes?', answer: s.topSender.name, options: s.participants.slice(0,4).map(p => p.name) });
    if (s.peakHour !== null) questions.push({ question: '¿A qué hora suele haber más actividad?', answer: `${String(s.peakHour).padStart(2,'0')}:00`, options: [...new Set([`${String(s.peakHour).padStart(2,'0')}:00`, '09:00', '15:00', '21:00'])] });
    questions.push({ question: '¿Cuántos días distintos tuvieron mensajes?', answer: String(s.activeDays), options: [...new Set([String(s.activeDays), String(Math.max(0,s.activeDays-1)), String(s.activeDays+3), String(s.activeDays+10)])] });
    return questions.map(q => ({ ...q, options: shuffleDeterministic(q.options, q.question) }));
  }
  function shuffleDeterministic(list, seed) { return list.slice().sort((a,b) => hash(`${seed}:${a}`) - hash(`${seed}:${b}`)); }
  function hash(s) { let h=2166136261; for (let i=0;i<s.length;i++) { h ^= s.charCodeAt(i); h = Math.imul(h,16777619); } return h >>> 0; }

  function tournament(chats) {
    return (Array.isArray(chats) ? chats : []).map(chat => {
      const s = stats(chat.messages || []);
      const perPerson = s.participantCount ? s.totalMessages / s.participantCount : 0;
      const perDay = s.activeDays ? s.totalMessages / s.activeDays : 0;
      const score = Math.round((perPerson * 0.6 + perDay * 0.4) * 10) / 10;
      return { name: chat.name || 'Chat', platform: chat.platform || 'unknown', totalMessages: s.totalMessages, participants: s.participantCount, activeDays: s.activeDays, messagesPerPerson: Math.round(perPerson*10)/10, messagesPerDay: Math.round(perDay*10)/10, score };
    }).sort((a,b) => b.score-a.score || b.totalMessages-a.totalMessages);
  }

  function toCardData(messages, name) { return wrapped(messages, name); }

  root.GolifiarExperienciasEngine = Object.freeze({ normalizeMessages, parseWhatsApp, parseInstagramThread, parseInstagramZip, stats, calendar, streaks, comparePeriods, topics, funTests, balance, chemistry, records, achievements, wrapped, dailyDiscovery, partyQuiz, tournament, toCardData, formatDuration, monthKey, dayKey });
}(typeof window !== 'undefined' ? window : globalThis));
