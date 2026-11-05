(function () {
  'use strict';

  let ultimoResultado = null, ultimoTexto = '', ultimoNombre = '', ultimoChat = null;

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
      <div id="waFull" class="wa-full"></div>
      <p class="results-disclaimer">${t('Solo se han contado fechas, horas y participantes. El texto de los mensajes no se muestra ni se guarda.')}</p>`;
  }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  async function leer(archivo) {
    const dz = document.getElementById('whatsappFile').closest('.dropzone'), barra = dz && dz.querySelector('.dz-progress'), dec = new TextDecoder('utf-8'), partes = [], TAM = 4 * 1024 * 1024;
    if (barra) barra.hidden = false;
    for (let o = 0; o < archivo.size; o += TAM) {
      partes.push(dec.decode(await archivo.slice(o, o + TAM).arrayBuffer(), { stream: true }));
      if (barra && barra.firstElementChild) barra.firstElementChild.style.width = Math.min(100, Math.round((o + TAM) / archivo.size * 100)) + '%';
      await new Promise(r => setTimeout(r, 0));
    }
    partes.push(dec.decode());
    if (barra) barra.hidden = true;
    return partes.join('');
  }

  // El análisis completo (podio, tests, calor, Full Curiosidad, tarjetas…) lo monta el motor local de Experiencias.
  async function extra() {
    const X = window.GolifiarExperiencias;
    if (!X || !ultimoTexto) return;
    if (!ultimoChat) {
      const msgs = await X.parseAsync(ultimoTexto, ultimoNombre, ultimoTexto.length);
      if (!msgs.length) return;
      ultimoChat = { name: ultimoNombre, platform: 'WhatsApp', messages: msgs };
    }
    X.mountChats([ultimoChat], 'waFull');
  }

  async function cargar(input) {
    const archivo = input.files && input.files[0];
    if (!archivo) return;
    const etiqueta = document.getElementById('whatsappTag');
    if (etiqueta) { etiqueta.textContent = archivo.name; etiqueta.classList.add('active'); }
    if (!/\.txt$/i.test(archivo.name)) {
      ultimoResultado = { mensajes: 0 };
      mostrar(ultimoResultado);
      return;
    }
    try {
      ultimoTexto = ''; ultimoChat = null; ultimoNombre = archivo.name.replace(/\.txt$/i, '');
      const texto = await leer(archivo);
      ultimoResultado = GolifiarWhatsApp.analizar(texto, archivo.name);
      ultimoTexto = texto;
      mostrar(ultimoResultado);
      extra();
    } catch (error) {
      console.error('No se pudo leer la exportación de WhatsApp.', error);
      ultimoResultado = { mensajes: 0 };
      const salida = document.getElementById('whatsappResults');
      if (salida) salida.innerHTML = `<p class="status-message error">${t('No se pudo leer la exportación de WhatsApp.')}</p>`;
    }
  }

  if (window.I18n) I18n.alAplicar(() => { if (ultimoResultado) { mostrar(ultimoResultado); extra(); } });
  window.cargarWhatsApp = cargar;
}());
