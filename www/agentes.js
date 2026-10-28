(function () {
  'use strict';

  const agentes = new Map();
  let ejecuciones = 0;

  function registrar(agente) {
    if (!agente || typeof agente.id !== 'string' || typeof agente.ejecutar !== 'function') {
      throw new TypeError('Un agente debe tener id y una función ejecutar.');
    }
    agentes.set(agente.id, Object.freeze({ ...agente }));
  }

  function listar() {
    return [...agentes.values()].map(({ ejecutar, ...metadatos }) => metadatos);
  }

  function ejecutar(id, contexto) {
    const agente = agentes.get(id);
    if (!agente) throw new Error(`Agente no registrado: ${id}`);
    if (contexto !== undefined && (contexto === null || typeof contexto !== 'object' || Array.isArray(contexto))) {
      throw new TypeError('El contexto del agente debe ser un objeto.');
    }
    const ejecucion = ++ejecuciones;
    return Promise.resolve(agente.ejecutar(contexto || {})).then(resultado => ({
      ...resultado,
      ejecucion,
      version: '1.0'
    }));
  }

  registrar({
    id: 'privacidad-local',
    nombre: 'Revisión de privacidad local',
    descripcion: 'Comprueba que el análisis pueda mantenerse en el dispositivo.',
    ejecutar(contexto) {
      const advertencias = [];
      if (contexto.red !== 'local') advertencias.push('El análisis debe ejecutarse sin enviar datos a una red.');
      if (contexto.credenciales) advertencias.push('No se deben solicitar credenciales de ninguna red social.');
      return { id: 'privacidad-local', estado: advertencias.length ? 'revisar' : 'correcto', advertencias };
    }
  });

  registrar({
    id: 'calidad-exportacion',
    nombre: 'Revisión de calidad de exportación',
    descripcion: 'Detecta exportaciones incompletas sin presentar conclusiones engañosas.',
    ejecutar(contexto) {
      const advertencias = [];
      const resumen = contexto.resumen || {};
      if (!Number.isFinite(resumen.seguidores) && !Number.isFinite(resumen.seguidos)) {
        advertencias.push('No hay métricas de seguidores o seguidos para revisar.');
      }
      if (resumen.perfilesNoDisponibles > 0) {
        advertencias.push('Algunos perfiles no están disponibles en la consulta actual.');
      }
      return { id: 'calidad-exportacion', estado: advertencias.length ? 'revisar' : 'correcto', advertencias };
    }
  });

  registrar({
    id: 'resumen-metricas',
    nombre: 'Resumen de métricas',
    descripcion: 'Ordena métricas ya calculadas sin leer mensajes ni acceder a servicios externos.',
    ejecutar(contexto) {
      const metricas = Array.isArray(contexto.metricas) ? contexto.metricas : [];
      return {
        id: 'resumen-metricas',
        estado: 'correcto',
        resultados: metricas
          .filter(item => item && typeof item.nombre === 'string' && Number.isFinite(item.valor))
          .slice()
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 5)
      };
    }
  });

  window.GolifiarAgentes = Object.freeze({ registrar, listar, ejecutar });
}());
