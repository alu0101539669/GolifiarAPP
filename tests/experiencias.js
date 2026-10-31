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
console.log('experiencias: OK');
