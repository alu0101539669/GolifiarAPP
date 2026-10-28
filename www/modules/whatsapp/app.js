(function () {
  'use strict';

  let ultimoResultado = null;

  function mostrar(resultado) {
    const salida = document.getElementById('whatsappResults');
    if (!salida) return;
    if (!resultado.mensajes) {
      salida.innerHTML = `<p class="status-message error">${t('No se encontraron mensajes con un formato de exportación de WhatsApp compatible.')}</p>`;
      return;
    }
    const personas = resultado.participantes.map(item => `<li><strong>${esc(item.participante)}</strong><span>${t('{n} mensajes', { n: I18n.num(item.cantidad) })}</span></li>`).join('');
    salida.innerHTML = `
      <div class="wa-summary" aria-live="polite">
        <div><strong>${I18n.num(resultado.mensajes)}</strong><span>${t('Mensajes analizados')}</span></div>
        <div><strong>${I18n.num(resultado.participantes.length)}</strong><span>${t('Participantes')}</span></div>
        <div><strong>${I18n.num(resultado.diasActivos)}</strong><span>${t('Días con actividad')}</span></div>
        <div><strong>${resultado.horaPico === null ? '—' : `${String(resultado.horaPico).padStart(2, '0')}:00`}</strong><span>${t('Hora con más actividad')}</span></div>
      </div>
      <h3>${t('Personas con más mensajes')}</h3>
      <ol class="wa-ranking">${personas}</ol>
      <p class="results-disclaimer">${t('Solo se han contado fechas, horas y participantes. El texto de los mensajes no se muestra ni se guarda.')}</p>`;
  }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  async function cargar(input) {
    const archivo = input.files && input.files[0];
    if (!archivo) return;
    if (!/\.txt$/i.test(archivo.name)) {
      ultimoResultado = { mensajes: 0 };
      mostrar(ultimoResultado);
      return;
    }
    try {
      ultimoResultado = GolifiarWhatsApp.analizar(await archivo.text(), archivo.name);
      mostrar(ultimoResultado);
    } catch (error) {
      console.error('No se pudo leer la exportación de WhatsApp.', error);
      ultimoResultado = { mensajes: 0 };
      const salida = document.getElementById('whatsappResults');
      if (salida) salida.innerHTML = `<p class="status-message error">${t('No se pudo leer la exportación de WhatsApp.')}</p>`;
    }
  }

  if (window.I18n) I18n.alAplicar(() => { if (ultimoResultado) mostrar(ultimoResultado); });
  window.cargarWhatsApp = cargar;
}());
