'use strict';
const assert = require('node:assert/strict');
require('../www/modules/experiencias/engine.js');
const E = global.GolifiarExperienciasEngine;
assert.ok(E, 'El motor de experiencias debe registrarse');

const wa = [
  '[01/10/2026, 10:00:00] Ana: Hola buenas',
  '[01/10/2026, 10:05:00] Luis: fútbol partido mañana',
  '[02/10/2026, 21:00:00] Ana: fútbol genial',
  '[03/10/2026, 21:15:00] Luis: genial'
].join('\n');
const messages = E.parseWhatsApp(wa, 'Grupo de prueba');
assert.equal(messages.length, 4, 'Debe reconocer cuatro mensajes de WhatsApp');
assert.equal(E.stats(messages).participantCount, 2, 'Debe contar dos participantes');
assert.equal(E.stats(messages).activeDays, 3, 'Debe contar tres días activos');
assert.equal(E.stats(messages).totalMessages, 4, 'Debe contar cuatro mensajes');
assert.ok(E.stats(messages).sessionCount >= 1, 'Debe estimar conversaciones usando pausas temporales');
assert.ok(E.stats(messages).topInitiator, 'Debe estimar quién inicia más conversaciones');
assert.ok(E.calendar(messages).length === 3, 'El calendario debe tener un día por fecha activa');
assert.ok(E.records(messages).some(r => r.key === 'longestStreak'), 'Debe producir un récord de racha');
assert.ok(E.achievements(messages).some(a => a.key === 'firstMessage'), 'Debe desbloquear el trofeo inicial al importar mensajes');
const months = Object.keys(E.stats(messages).months);
assert.equal(months.length, 1, 'El fixture pertenece a un mes');
assert.ok(E.topics(messages, 10).some(x => x.word === 'futbol'), 'Debe normalizar acentos al detectar temas');
const quiz = E.partyQuiz(messages);
assert.ok(quiz.length >= 2, 'Debe generar preguntas para modo fiesta');
assert.equal(E.funTests(messages).length, 3, 'Debe generar tests de curiosidad');
assert.ok(E.balance(messages).available, 'Debe calcular el índice de equilibrio con dos participantes');
assert.ok(E.chemistry(messages, 'Ana', 'Luis').available, 'Debe calcular Chemistry Score con datos suficientes');
const wrapped = E.wrapped(messages, 'Grupo de prueba');
assert.equal(wrapped.totalMessages, 4, 'Wrapped debe resumir mensajes');
assert.equal(E.tournament([{name:'A',messages},{name:'B',messages:messages.slice(0,1)}]).length, 2, 'El torneo debe ordenar varios chats');
const multiMonth = messages.concat([{ timestamp: new Date(2026,10,1,12).getTime(), sender: 'Ana', text: 'nuevo tema', platform: 'whatsapp' }]);
const periodKeys = Object.keys(E.stats(multiMonth).months).sort();
const cmp = E.comparePeriods(multiMonth, periodKeys[0], periodKeys[1]);
assert.equal(cmp.metrics.totalMessages.a, 4, 'La comparación de periodos debe calcular mensajes del periodo A');
assert.equal(cmp.metrics.totalMessages.b, 1, 'La comparación de periodos debe calcular mensajes del periodo B');
const ig = E.parseInstagramThread({title:'DM prueba', participants:[{name:'Ana'}], messages:[{sender_name:'Ana',timestamp_ms:Date.UTC(2026,0,2),content:'hola',reactions:[{reaction:'❤️'}],photos:[{uri:'local'}],share:{link:'story'}}]});
assert.equal(ig.length, 1, 'Debe normalizar un hilo JSON de Instagram');
assert.equal(E.stats(ig).totalReactions, 1, 'Debe contar reacciones si aparecen en el ZIP');
assert.equal(E.stats(ig).sharedContentMessages, 1, 'Debe detectar adjuntos cuando existen metadatos');
assert.equal(E.stats(ig).storyReplies, 1, 'Debe identificar respuestas a historias cuando los metadatos las señalan');

// Fase 1: formatos de fecha, sistema, medios y miembros
const us = E.parseWhatsApp('1/13/26, 9:05 PM - Ana: hi\n1/14/26, 12:10 AM - Bob: <Media omitted>\n1/14/26, 12:11 AM - Bob: ok', 'US');
assert.equal(us.length, 3, 'Debe leer formato MM/DD/YY con AM/PM');
assert.equal(us.dateOrder, 'mdy', 'Debe detectar MM/DD');
assert.equal(new Date(us[0].timestamp).getHours(), 21, '9:05 PM son las 21 h');
assert.equal(new Date(us[1].timestamp).getHours(), 0, '12:10 AM son las 0 h');
const grp = E.parseWhatsApp([
  '[05/01/2026, 10:00:00] Ana: hola',
  '[05/01/2026, 10:01:00] Luis: <Multimedia omitido>',
  '[05/01/2026, 10:02:00] Luis: audio omitido',
  '[05/01/2026, 10:03:00] Eva: sticker omitido',
  '05/01/2026, 10:04 - Eva salió',
  '[06/01/2026, 01:00:00] Ana: ¡HOLA! 😀',
  '[06/01/2026, 01:05:00] Pepe se unió usando el enlace',
  '[01/04/2026, 12:00:00] Ana: otra vez'
].join('\n'), 'G');
assert.equal(grp.length, 6, 'Los mensajes de sistema no son mensajes');
assert.equal(grp.system.length, 2, 'Debe leer salidas y entradas');
const dp = E.deep(grp);
assert.equal(dp.media.audio, 1); assert.equal(dp.media.sticker, 1);
assert.equal(dp.exMembers.map(m => m.name).join(), 'Eva', 'Eva salió');
assert.ok(dp.ghosts.some(m => m.name === 'Pepe'), 'Pepe entró y no escribió');
assert.ok(dp.words > 0 && dp.chars > 0 && dp.topSlot, 'Debe contar palabras, caracteres y franja');
assert.ok(Array.isArray(E.whoIsMore(messages)), 'whoIsMore devuelve lista');
assert.equal(E.hourHeat(messages).length, 7);

// Labs
const lab = E.parseWhatsApp(['[01/10/2026, 10:00:00] Ana: te quiero 😀 viaje','[01/10/2026, 10:01:00] Luis: perdón 😀 viaje','[01/10/2026, 10:02:00] Ana: <Multimedia omitido>','[01/10/2026, 10:03:00] Luis: jajaja 😂','[02/10/2026, 11:00:00] Ana: gracias viaje'].join('\n'),'L');
assert.equal(E.firstMoments(lab)[0].sender, 'Ana', 'Primer «te quiero»');
assert.ok(!('text' in E.firstMoments(lab)[0]), 'No devuelve texto');
assert.equal(E.emojiDna(lab, true).emojis[0].emoji, '😀');
assert.deepEqual(E.emojiDna(lab, false).emojis, [], 'Sin opt-in no se leen emojis');
assert.equal(E.burst(lab).count, 4); assert.equal(E.longestRun(lab).count, 4);
assert.ok(E.mostLikely(lab, true).some(x => x.key === 'trip'), 'Viaje con opt-in');
assert.ok(!E.mostLikely(lab, false).some(x => x.key === 'trip'), 'Sin opt-in no hay palabras clave');
assert.ok(E.soulmates(lab).length >= 1);
assert.ok(E.topicCompat(lab, 'Ana', 'Luis').available);

const jk = E.parseWhatsApp(Array.from({length: 12}, (_, i) => `[0${1 + i % 9}/10/2026, 10:${10 + i}:00] ${i % 2 ? 'Ana' : 'Luis'}: el chiringuito mola 🍻`).join('\n'), 'J');
assert.ok(E.insideJokes(jk).some(x => x.word === 'chiringuito'), 'Detecta jerga recurrente');
assert.equal(E.emojiCloud(jk)[0].emoji, '🍻');
const cf = E.chemistryFull(jk, 'Ana', 'Luis', true);
assert.ok(cf.available && cf.score >= 0 && cf.score <= 100 && cf.parts.length === 4, 'Química con 4 factores');
assert.equal(E.chemistryFull(jk, 'Ana', 'Luis', false).parts.length, 2, 'Sin opt-in solo factores de metadatos');

const igm = E.parseInstagramThread({ title: 'M', participants: [{ name: 'Ana' }], messages: [
  { sender_name: 'Ana', timestamp_ms: Date.UTC(2026, 0, 2, 10), photos: [{ uri: 'a' }, { uri: 'b' }, { uri: 'c' }] },
  { sender_name: 'Ana', timestamp_ms: Date.UTC(2026, 0, 2, 11), audio_files: [{ uri: 'v' }] },
  { sender_name: 'Ana', timestamp_ms: Date.UTC(2026, 0, 2, 12), sticker: { uri: 's' } }] });
const igd = E.deep(igm);
assert.equal(igd.media.image, 3, 'Cuenta cada foto de un mensaje de Instagram');
assert.equal(igd.media.audio, 1); assert.equal(igd.media.sticker, 1);

const amb = E.parseWhatsApp('03/04/2026, 10:00 - Ana: hola', 'A', { defaultOrder: 'mdy' });
assert.equal(new Date(amb[0].timestamp).getMonth(), 2, 'Fecha ambigua en orden MM/DD si el sistema es de EE. UU.');
assert.equal(new Date(E.parseWhatsApp('03/04/2026, 10:00 - Ana: hola', 'A')[0].timestamp).getMonth(), 3, 'Por defecto DD/MM');
const th = E.parseWhatsApp(['[01/10/2026, 10:00:00] Ana: vamos al futbol y luego una pelicula','[01/10/2026, 10:01:00] Luis: el partido de futbol estuvo genial, y la serie','[02/10/2026, 10:02:00] Ana: ese cine nuevo mola'].join('\n'), 'T');
const tt = E.topicThemes(th, 'Ana', 'Luis'); assert.ok(tt.available && tt.shared.some(x => x.theme === 'Deportes'), 'Temas compartidos');
assert.ok(E.bestMatches(jk, 'Ana', true)[0].name === 'Luis', 'Mejor encaje');
assert.ok(E.firstMoments(jk, ['chiringuito'])[0].sender, 'Búsqueda de frase personalizada');
const dayStarts = E.deep(E.parseWhatsApp(['[01/10/2026, 10:00:00] Ana: a','[01/10/2026, 10:30:00] Luis: b','[02/10/2026, 09:00:00] Luis: c','[02/10/2026, 09:05:00] Ana: d'].join('\n'),'D'));
assert.equal(dayStarts.members.find(m => m.name === 'Luis').starts, 1, 'Inicia = primer mensaje del día'); assert.equal(dayStarts.members.find(m => m.name === 'Ana').starts, 1);
console.log('experiencias: OK');
