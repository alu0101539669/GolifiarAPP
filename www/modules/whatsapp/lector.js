(function () {
  'use strict';

  const FORMATOS = [
    /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?m?\.?\]\s*([^:]+):\s*/i,
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?m?\.?\s*-\s*([^:]+):\s*/i
  ];

  function fecha(partes) {
    let [, dia, mes, anio, hora, minuto, ampm] = partes;
    dia = Number(dia);
    mes = Number(mes);
    if (mes > 12 && dia <= 12) [dia, mes] = [mes, dia];
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

    for (const linea of lineas) {
      let encontrada = null;
      let indice = -1;
      for (let i = 0; i < FORMATOS.length; i++) {
        const coincidencia = linea.match(FORMATOS[i]);
        if (coincidencia) { encontrada = coincidencia; indice = i; break; }
      }
      if (!encontrada) continue;
      const inicio = indice === 0 ? 7 : 7;
      const momento = fecha(encontrada);
      const participante = encontrada[inicio].replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim();
      if (!momento || !participante) continue;
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
