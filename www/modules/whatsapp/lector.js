(function () {
  'use strict';

  const FORMATOS = [
    /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([ap])\.?\s*m\.?)?\]\s*([^:]+):\s*/i,
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([ap])\.?\s*m\.?)?\s*-\s*([^:]+):\s*/i
  ];

  // Orden de día y mes: lo decide el archivo entero (un «13» solo cabe como día); si es ambiguo, el idioma del dispositivo.
  function ordenFechas(coincidencias) {
    for (const c of coincidencias) {
      if (Number(c[1]) > 12) return 'dmy';
      if (Number(c[2]) > 12) return 'mdy';
    }
    return /^en-us/i.test((typeof navigator !== 'undefined' && navigator.language) || '') ? 'mdy' : 'dmy';
  }

  function fecha(partes, orden) {
    let [, dia, mes, anio, hora, minuto, ampm] = partes;
    dia = Number(dia);
    mes = Number(mes);
    if (orden === 'mdy') [dia, mes] = [mes, dia];
    anio = Number(anio);
    if (anio < 100) anio += 2000;
    hora = Number(hora);
    minuto = Number(minuto);
    const meridiano = ampm && ampm.toLowerCase();
    if (meridiano && hora > 12) return null;
    if (meridiano === 'p' && hora < 12) hora += 12;
    if (meridiano === 'a' && hora === 12) hora = 0;
    if (mes < 1 || mes > 12 || dia < 1 || hora < 0 || hora > 23 || minuto < 0 || minuto > 59) return null;
    const valor = new Date(anio, mes - 1, dia, hora, minuto);
    return valor.getFullYear() === anio && valor.getMonth() === mes - 1 &&
      valor.getDate() === dia && valor.getHours() === hora && valor.getMinutes() === minuto ? valor : null;
  }

  function analizar(texto, nombre) {
    const participantes = new Map();
    const horas = new Array(24).fill(0);
    const dias = new Map();
    let mensajes = 0;
    let formato = '';
    const lineas = String(texto || '').replace(/^\uFEFF/, '').split(/\r?\n/);

    const hallazgos = [];
    for (const linea of lineas) {
      for (let i = 0; i < FORMATOS.length; i++) {
        const coincidencia = linea.match(FORMATOS[i]);
        if (coincidencia) { hallazgos.push({ c: coincidencia, i }); break; }
      }
    }
    const orden = ordenFechas(hallazgos.map(h => h.c));
    for (const { c: encontrada, i: indice } of hallazgos) {
      const momento = fecha(encontrada, orden);
      const participante = encontrada[7].replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim();
      // Avisos del sistema con dos puntos («cambió el asunto a “A: B”») no son mensajes de una persona.
      if (!momento || !participante || participante.length > 40 || /[“”"]/.test(participante)) continue;
      formato = indice === 0 ? 'corchetes' : 'guiones';
      mensajes++;
      participantes.set(participante, (participantes.get(participante) || 0) + 1);
      horas[momento.getHours()]++;
      const dia = `${momento.getFullYear()}-${String(momento.getMonth() + 1).padStart(2, '0')}-${String(momento.getDate()).padStart(2, '0')}`;
      dias.set(dia, (dias.get(dia) || 0) + 1);
    }

    const ranking = [...participantes.entries()]
      .map(([participante, cantidad]) => ({ participante, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad || a.participante.localeCompare(b.participante));
    const horaPico = horas.reduce((mejor, valor, hora) => valor > horas[mejor] ? hora : mejor, 0);
    return {
      red: 'whatsapp',
      archivo: nombre || '',
      formato,
      mensajes,
      participantes: ranking,
      diasActivos: dias.size,
      horaPico: mensajes ? horaPico : null,
      advertencias: mensajes ? [] : ['No se encontraron líneas con un formato de exportación compatible.']
    };
  }

  window.GolifiarWhatsApp = Object.freeze({ analizar });
}());
