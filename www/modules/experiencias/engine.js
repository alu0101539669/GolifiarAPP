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
      return { timestamp, sender, text: typeof m.text === 'string' ? m.text : (typeof m.content === 'string' ? m.content : ''), platform: m.platform || cfg.platform || 'unknown', chat: m.chat || cfg.chat || 'Chat', reactions: Array.isArray(m.reactions) ? m.reactions.length : Number(m.reactions || 0), attachmentsCount: Number(m.attachmentsCount || 0), isStoryReply: Boolean(m.isStoryReply), media: m.media || null, mediaCounts: m.mediaCounts || null };
    }).filter(Boolean).sort((a,b) => a.timestamp - b.timestamp);
  }

  // ---- WhatsApp: fechas en varios formatos, mensajes de sistema y medios omitidos ----
  const HEAD = /^[\u200e\u200f\u202a-\u202e]*\[?(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*(?:([ap])\.?\s*m\.?)?\]?\s*(?:[-–]\s*)?(.*)$/i;
  function mediaKind(text) {
    const t = String(text || '').toLowerCase().replace(/[\u200e\u200f]/g, '');
    if (/<(?:attached|adjunto):\s*[^>]*>/.test(t)) {
      if (/audio|ptt|\.opus|\.m4a/.test(t)) return 'audio';
      if (/sticker|\.webp/.test(t)) return 'sticker';
      if (/video|\.mp4/.test(t)) return 'video';
      if (/photo|img|\.jpe?g|\.png/.test(t)) return 'image';
      return 'other';
    }
    if (/^<?\s*(?:media omitted|multimedia omitido)\s*>?$/.test(t.trim())) return 'other';
    const m = t.trim().match(/^<?\s*(audio|imagen|image|foto|photo|v[ií]deo|sticker|gif|documento|document)\s+(?:omitid[oa]|omitted)\s*>?$/);
    if (!m) return null;
    return { audio: 'audio', imagen: 'image', image: 'image', foto: 'image', photo: 'image', video: 'video', 'vídeo': 'video', sticker: 'sticker', gif: 'video' }[m[1]] || 'other';
  }
  function systemEvent(rest) {
    const s = rest.replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim();
    let m;
    if ((m = s.match(/^(.+?) (?:se salió|salió|left)(?: del grupo)?\.?$/i))) return { type: 'leave', name: m[1].trim() };
    if ((m = s.match(/^(.+?) (?:eliminó a|removed) (.+?)\.?$/i))) return { type: 'remove', name: m[2].trim(), actor: m[1].trim() };
    if ((m = s.match(/^(.+?) (?:añadió a|added) (.+?)\.?$/i))) return { type: 'join', name: m[2].trim(), actor: m[1].trim() };
    if ((m = s.match(/^(.+?) (?:se unió|joined)(?: usando| using|\.|$)/i))) return { type: 'join', name: m[1].trim() };
    return null;
  }
  function detectOrder(heads) {
    for (const h of heads) { if (String(h[1]).length === 4) return 'ymd'; }
    for (const h of heads) { if (Number(h[1]) > 12) return 'dmy'; }
    for (const h of heads) { if (Number(h[2]) > 12) return 'mdy'; }
    return 'dmy';
  }
  function buildTs(h, order) {
    let a = Number(h[1]), b = Number(h[2]), c = Number(h[3]), day, month, year;
    if (order === 'ymd') { year = a; month = b; day = c; }
    else { year = c; if (order === 'mdy') { month = a; day = b; } else { day = a; month = b; } }
    if (year < 100) year += 2000;
    let hour = Number(h[4]); const min = Number(h[5]);
    if (h[6]) { const pm = h[6].toLowerCase() === 'p'; if (hour === 12) hour = pm ? 12 : 0; else if (pm) hour += 12; }
    const dt = new Date(year, month - 1, day, hour, min, 0, 0);
    if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day || dt.getHours() !== hour) return null;
    return dt.getTime();
  }
  function parseWhatsApp(text, chatName) {
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
    const parsed = lines.map(l => l.match(HEAD));
    const order = detectOrder(parsed.filter(Boolean));
    const messages = [], system = [];
    let last = null;
    lines.forEach((line, i) => {
      const h = parsed[i];
      const ts = h ? buildTs(h, order) : null;
      if (h && ts !== null) {
        const rest = h[7];
        const sm = rest.match(/^(.+?): ([\s\S]*)$/);
        if (sm && !/^[^:]*\d:\d/.test(sm[1])) {
          const sender = sm[1].replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim();
          const body = sm[2];
          last = { timestamp: ts, sender, text: body, platform: 'whatsapp', chat: chatName || 'WhatsApp', media: mediaKind(body) };
          messages.push(last);
        } else {
          const ev = systemEvent(rest);
          if (ev) system.push({ ...ev, timestamp: ts });
          last = null;
        }
      } else if (last && line.trim()) {
        last.text += ` ${line.trim()}`;
        if (!last.media) last.media = mediaKind(last.text);
      }
    });
    const out = normalizeMessages(messages, { platform: 'whatsapp', chat: chatName || 'WhatsApp' });
    Object.defineProperty(out, 'system', { value: system, enumerable: false });
    Object.defineProperty(out, 'dateOrder', { value: order, enumerable: false });
    return out;
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
      media: m.audio_files ? 'audio' : m.videos ? 'video' : m.photos ? 'image' : m.sticker ? 'sticker' : null,
      mediaCounts: { audio: (m.audio_files || []).length, video: (m.videos || []).length, image: (m.photos || []).length, sticker: m.sticker ? 1 : 0 },
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


  // ---- Análisis ampliado (Fase 1): totales, medios, franjas, miembros y tests ----
  const SLOTS = [['madrugada', 0, 6], ['mañana', 6, 12], ['tarde', 12, 20], ['noche', 20, 24]];
  function slotOf(h) { return SLOTS.find(([, a, b]) => h >= a && h < b)[0]; }
  function wordCount(t) { return (String(t || '').match(/[\p{L}\p{N}]+/gu) || []).length; }

  function deep(messages, system) {
    const ms = normalizeMessages(messages), ev = Array.isArray(system) ? system : (messages && messages.system) || [];
    const media = { audio: 0, image: 0, video: 0, sticker: 0, other: 0 }, slots = { madrugada: 0, 'mañana': 0, tarde: 0, noche: 0 };
    const weekdays = Array(7).fill(0), per = new Map();
    let words = 0, chars = 0;
    const row = n => { if (!per.has(n)) per.set(n, { name: n, messages: 0, words: 0, chars: 0, media: 0, audio: 0, stickers: 0, night: 0, caps: 0, excl: 0, emojis: 0, first: null, last: null, responseMs: [], starts: 0 }); return per.get(n); };
    ms.forEach((m, i) => {
      const r = row(m.sender), d = new Date(m.timestamp), isMedia = Boolean(m.media);
      r.messages++; if (r.first === null) r.first = m.timestamp; r.last = m.timestamp;
      if (isMedia) { if (m.mediaCounts) { for (const k of Object.keys(m.mediaCounts)) media[k] = (media[k] || 0) + m.mediaCounts[k]; } else media[m.media] = (media[m.media] || 0) + 1; r.media++; if (m.media === 'audio' || (m.mediaCounts && m.mediaCounts.audio)) r.audio += m.mediaCounts ? m.mediaCounts.audio : 1; if (m.media === 'sticker' || (m.mediaCounts && m.mediaCounts.sticker)) r.stickers += m.mediaCounts ? m.mediaCounts.sticker : 1; }
      else { const w = wordCount(m.text); words += w; chars += m.text.length; r.words += w; r.chars += m.text.length; }
      slots[slotOf(d.getHours())]++; weekdays[(d.getDay() + 6) % 7]++;
      if (d.getHours() < 6) r.night++;
      r.caps += (m.text.match(/\b\p{Lu}{3,}\b/gu) || []).length; r.excl += (m.text.match(/[!¡]/g) || []).length; r.emojis += (m.text.match(/\p{Extended_Pictographic}/gu) || []).length;
      const prev = ms[i - 1];
      if (!prev || m.timestamp - prev.timestamp > 6 * 3600000) r.starts++;
      else if (prev.sender !== m.sender && m.timestamp - prev.timestamp < 24 * 3600000) r.responseMs.push(m.timestamp - prev.timestamp);
    });
    const lastTs = ms.length ? ms[ms.length - 1].timestamp : 0, DAY = 86400000;
    const status = new Map();
    for (const e of [...ev].sort((a, b) => a.timestamp - b.timestamp)) {
      if (e.type === 'join') { status.set(e.name, 'in'); row(e.name); } else status.set(e.name, 'out');
    }
    const members = [...per.values()].map(r => {
      const out = status.get(r.name) === 'out' && (r.last === null || true);
      let state = 'active';
      if (out) state = 'ex';
      else if (r.messages === 0 || lastTs - r.last > 60 * DAY) state = 'ghost';
      const avgResp = r.responseMs.length ? r.responseMs.reduce((a, b) => a + b, 0) / r.responseMs.length : null;
      return { ...r, state, avgResponseMs: avgResp, share: ms.length ? r.messages / ms.length * 100 : 0, responseMs: undefined };
    }).sort((a, b) => b.messages - a.messages || a.name.localeCompare(b.name));
    const topSlot = Object.entries(slots).sort((a, b) => b[1] - a[1])[0];
    const topDay = weekdays.indexOf(Math.max(...weekdays));
    return { totalMessages: ms.length, words, chars, media, slots, topSlot: ms.length ? topSlot[0] : null, weekdays, topWeekday: ms.length ? topDay : null, members, podium: members.slice(0, 3), rest: members.slice(3), ghosts: members.filter(m => m.state === 'ghost'), exMembers: members.filter(m => m.state === 'ex'), isGroup: members.filter(m => m.state !== 'ex').length > 2 };
  }

  function whoIsMore(messages, system) {
    const d = deep(messages, system), people = d.members.filter(m => m.messages > 0 && m.state !== 'ex');
    if (people.length < 2) return [];
    const best = (fn, min) => { const c = people.filter(p => (min ? p.messages >= min : true)); return (c.length ? c : people).map(p => ({ p, v: fn(p) })).filter(x => x.v !== null && Number.isFinite(x.v)).sort((a, b) => b.v - a.v)[0]; };
    const pct = v => `${Math.round(v * 100)}%`;
    const defs = [
      { key: 'leftOnRead', title: 'Más de dejar en visto', fn: p => p.avgResponseMs, fmt: v => formatDuration(v), explanation: 'Tiempo medio que tarda en responder a otra persona (máx. 24 h).' },
      { key: 'nocturnal', title: 'Más nocturno', fn: p => p.night / p.messages, fmt: pct, explanation: 'Porcentaje de sus mensajes entre las 00:00 y las 06:00.' },
      { key: 'voice', title: 'Más notas de voz', fn: p => p.audio, fmt: v => String(v), explanation: 'Notas de voz enviadas. El .txt no incluye su duración, solo cuántas hay.' },
      { key: 'stickers', title: 'Rey o reina de los stickers', fn: p => p.stickers, fmt: v => String(v), explanation: 'Stickers enviados.' },
      { key: 'initiator', title: 'Quien rompe el hielo', fn: p => p.starts, fmt: v => String(v), explanation: 'Veces que escribe el primer mensaje tras una pausa de más de 6 horas.' },
      { key: 'dramatic', title: 'Más dramático', fn: p => (p.caps * 2 + p.excl + p.emojis * 0.5) / p.messages, fmt: v => (Math.round(v * 10) / 10).toString(), explanation: 'Mayúsculas, exclamaciones y emojis por mensaje.' }
    ];
    return defs.map(df => { const b = best(df.fn, 3); return b && b.v > 0 ? { key: df.key, title: df.title, name: b.p.name, value: df.fmt(b.v), explanation: df.explanation } : null; }).filter(Boolean);
  }

  function ghostOfWeek(messages, system) {
    const d = deep(messages, system), ms = normalizeMessages(messages);
    if (!ms.length) return null;
    const lastTs = ms[ms.length - 1].timestamp, weekAgo = lastTs - 7 * 86400000;
    const recent = new Set(ms.filter(m => m.timestamp >= weekAgo).map(m => m.sender));
    const c = d.members.filter(m => m.state !== 'ex' && m.messages > 0 && !recent.has(m.name)).sort((a, b) => a.last - b.last)[0];
    return c ? { name: c.name, daysSilent: Math.floor((lastTs - c.last) / 86400000) } : null;
  }

  function dangerStreak(messages, now) {
    const st = streaks(messages), t = now || Date.now();
    const ms = normalizeMessages(messages);
    if (!ms.length || !st.current) return { danger: false, days: st.current };
    const wroteToday = dayKey(ms[ms.length - 1].timestamp) === dayKey(t);
    return { danger: !wroteToday, days: st.current };
  }

  function hourHeat(messages) {
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const m of normalizeMessages(messages)) { const d = new Date(m.timestamp); grid[(d.getDay() + 6) % 7][d.getHours()]++; }
    return grid;
  }


  // ---- Labs / Full Curiosidad ----
  const norm = t => String(t || '').toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '');
  function emojiDna(messages, textAllowed) {
    if (!textAllowed) return { emojis: [], magicWord: null };
    const ems = new Map();
    for (const m of normalizeMessages(messages)) for (const e of (m.text.match(/\p{Extended_Pictographic}/gu) || [])) ems.set(e, (ems.get(e) || 0) + 1);
    const top = [...ems.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([emoji, count]) => ({ emoji, count }));
    const w = topics(messages, 1)[0];
    return { emojis: top, magicWord: w ? w.word : null };
  }
  // Solo devuelve fecha y autor de la primera aparición, nunca el texto.
  function firstMoments(messages, terms) {
    const list = terms || ['te quiero', 'perdon', 'gracias', 'jajaja', 'te amo'];
    return list.map(term => { const m = normalizeMessages(messages).find(x => norm(x.text).includes(term)); return m ? { term, timestamp: m.timestamp, sender: m.sender } : { term, timestamp: null, sender: null }; });
  }
  function burst(messages) {
    const ms = normalizeMessages(messages); let best = { count: 0, start: null }, j = 0;
    for (let i = 0; i < ms.length; i++) { while (ms[i].timestamp - ms[j].timestamp > 3600000) j++; if (i - j + 1 > best.count) best = { count: i - j + 1, start: ms[j].timestamp }; }
    return best.count ? best : null;
  }
  function longestRun(messages) {
    const ms = normalizeMessages(messages); if (!ms.length) return null;
    let best = { count: 1, start: ms[0].timestamp, end: ms[0].timestamp }, cur = { count: 1, start: ms[0].timestamp, end: ms[0].timestamp };
    for (let i = 1; i < ms.length; i++) {
      if (ms[i].timestamp - ms[i - 1].timestamp <= 1800000) { cur.count++; cur.end = ms[i].timestamp; } else cur = { count: 1, start: ms[i].timestamp, end: ms[i].timestamp };
      if (cur.count > best.count) best = { ...cur };
    }
    return best;
  }
  function mostLikely(messages, textAllowed) {
    const d = deep(messages), people = d.members.filter(m => m.messages > 0 && m.state !== 'ex'); if (people.length < 2) return [];
    const out = [];
    const top = (fn) => people.map(p => ({ p, v: fn(p) })).sort((a, b) => b.v - a.v)[0];
    const meme = top(p => p.media); if (meme.v > 0) out.push({ key: 'memes', title: 'Mandar más memes y multimedia', name: meme.p.name, value: String(meme.v) });
    const run = longestRun(messages); if (run && run.count > 3) { const ms = normalizeMessages(messages).filter(m => m.timestamp >= run.start && m.timestamp <= run.end); const c = new Map(); ms.forEach(m => c.set(m.sender, (c.get(m.sender) || 0) + 1)); const w = [...c.entries()].sort((a, b) => b[1] - a[1])[0]; out.push({ key: 'run', title: 'Protagonizar el récord de conversación sin pausas', name: w[0], value: String(run.count) }); }
    if (textAllowed) {
      const kw = { trip: ['viaje', 'playa', 'fiesta', 'cumple', 'vacaciones', 'plan'], biz: ['reunion', 'trabajo', 'proyecto', 'dinero', 'cliente', 'negocio'] };
      for (const [k, title] of [['trip', 'Organizar un viaje o una fiesta'], ['biz', 'Montar un negocio']]) {
        const c = new Map(); normalizeMessages(messages).forEach(m => { const t = norm(m.text); const n = kw[k].filter(w => t.includes(w)).length; if (n) c.set(m.sender, (c.get(m.sender) || 0) + n); });
        const w = [...c.entries()].sort((a, b) => b[1] - a[1])[0]; if (w) out.push({ key: k, title, name: w[0], value: String(w[1]) });
      }
    }
    return out;
  }
  function soulmates(messages) {
    const ms = normalizeMessages(messages), pair = new Map();
    for (let i = 1; i < ms.length; i++) { const a = ms[i - 1], b = ms[i]; if (a.sender === b.sender || b.timestamp - a.timestamp > 600000) continue; const k = [a.sender, b.sender].sort().join('\u0000'); pair.set(k, (pair.get(k) || 0) + 1); }
    const total = [...pair.values()].reduce((x, y) => x + y, 0) || 1;
    return [...pair.entries()].map(([k, v]) => { const [a, b] = k.split('\u0000'); return { a, b, count: v, percent: Math.round(v / total * 100) }; }).sort((x, y) => y.count - x.count).slice(0, 5);
  }
  function topicCompat(messages, nameA, nameB) {
    const words = n => new Set(topics(normalizeMessages(messages).filter(m => m.sender === n), 60).map(x => x.word));
    const A = words(nameA), B = words(nameB); if (!A.size || !B.size) return { available: false };
    const shared = [...A].filter(w => B.has(w)); const uni = new Set([...A, ...B]);
    return { available: true, percent: Math.round(shared.length / uni.size * 100), shared: shared.slice(0, 8) };
  }
  const DIPLOMAS = { leftOnRead: 'Máster en Visto Eterno', nocturnal: 'Doctor honoris causa en Madrugones', voice: 'Podcaster oficial del grupo', stickers: 'Embajador mundial del sticker', initiator: 'Rompehielos certificado', dramatic: 'Premio Goya al mejor drama' };


  function insideJokes(messages, limit) {
    const info = new Map();
    for (const m of normalizeMessages(messages)) {
      const words = norm(m.text).match(/[a-zñ]{4,}/g) || [];
      for (const w of new Set(words)) { if (STOP.has(w)) continue; const r = info.get(w) || { count: 0, senders: new Set() }; r.count++; r.senders.add(m.sender); info.set(w, r); }
    }
    return [...info.entries()].filter(([, r]) => r.count >= 5 && r.senders.size >= 2).map(([word, r]) => ({ word, count: r.count, people: r.senders.size })).sort((a, b) => b.count * b.people - a.count * a.people).slice(0, limit || 10);
  }
  function emojiCloud(messages, limit) {
    const c = new Map();
    for (const m of normalizeMessages(messages)) for (const e of (m.text.match(/\p{Extended_Pictographic}/gu) || [])) c.set(e, (c.get(e) || 0) + 1);
    return [...c.entries()].map(([emoji, count]) => ({ emoji, count })).sort((a, b) => b.count - a.count).slice(0, limit || 18);
  }
  // Química completa: equilibrio, horarios y velocidad de respuesta; con content=true añade emojis y vocabulario.
  function chemistryFull(messages, nameA, nameB, content) {
    const base = chemistry(messages, nameA, nameB); if (!base.available) return base;
    const d = deep(messages), A = d.members.find(m => m.name === nameA), B = d.members.find(m => m.name === nameB);
    const ms = normalizeMessages(messages);
    const speed = (A.avgResponseMs && B.avgResponseMs) ? Math.min(A.avgResponseMs, B.avgResponseMs) / Math.max(A.avgResponseMs, B.avgResponseMs) : 0.5;
    const parts = [{ w: 0.3, v: base.score / 100, k: 'equilibrio y horarios' }, { w: 0.3, v: speed, k: 'velocidad de respuesta' }];
    if (content) {
      const emo = n => new Set(ms.filter(m => m.sender === n).flatMap(m => m.text.match(/\p{Extended_Pictographic}/gu) || []));
      const eA = emo(nameA), eB = emo(nameB), eu = new Set([...eA, ...eB]);
      const emojiScore = eu.size ? [...eA].filter(e => eB.has(e)).length / eu.size : 0.5;
      const tc = topicCompat(messages, nameA, nameB);
      parts.push({ w: 0.2, v: emojiScore, k: 'emojis' }, { w: 0.2, v: tc.available ? tc.percent / 100 : 0.5, k: 'vocabulario' });
    } else parts[0].w = 0.5, parts[1].w = 0.5;
    const score = Math.round(parts.reduce((a, p) => a + p.w * p.v, 0) * 100);
    return { available: true, score, parts: parts.map(p => ({ key: p.k, percent: Math.round(p.v * 100) })), explanation: 'Mezcla orientativa de equilibrio y horarios, velocidad de respuesta' + (content ? ', emojis y vocabulario.' : '. Activa el análisis de palabras para añadir emojis y vocabulario.') };
  }

  function summaryText(messages, name, system) {
    const s = stats(messages), st = streaks(messages), d = deep(messages, system);
    const top = d.members[0];
    return [`📊 ${name || 'Mi chat'} · Golifiar`, `💬 ${s.totalMessages} mensajes · ${d.words} palabras`, `🔥 Racha más larga: ${st.longest} días`, top ? `🏆 Más activo: ${top.name} (${Math.round(top.share)}%)` : '', 'Analizado en mi dispositivo con Golifiar'].filter(Boolean).join('\n');
  }

  function toCardData(messages, name) { return wrapped(messages, name); }

  root.GolifiarExperienciasEngine = Object.freeze({ normalizeMessages, parseWhatsApp, parseInstagramThread, parseInstagramZip, stats, calendar, streaks, comparePeriods, topics, funTests, balance, chemistry, records, achievements, wrapped, dailyDiscovery, partyQuiz, tournament, toCardData, formatDuration, monthKey, dayKey, deep, whoIsMore, ghostOfWeek, dangerStreak, hourHeat, summaryText, mediaKind, emojiDna, firstMoments, burst, longestRun, mostLikely, soulmates, topicCompat, DIPLOMAS, insideJokes, emojiCloud, chemistryFull });
}(typeof window !== 'undefined' ? window : globalThis));
