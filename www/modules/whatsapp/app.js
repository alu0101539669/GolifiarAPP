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
      <div id="waExtra"></div>
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

  function iniciales(n) { return String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => Array.from(w)[0] || '').join('').toUpperCase(); }
  // Estadísticas ampliadas: reutilizan el motor local de Experiencias; nada sale del dispositivo.
  function extra() {
    const sitio = document.getElementById('waExtra'), E = window.GolifiarExperienciasEngine;
    if (!sitio || !E || !ultimoTexto) return;
    const msgs = E.parseWhatsApp(ultimoTexto, ultimoNombre);
    if (!msgs.length) return;
    ultimoChat = { name: ultimoNombre, platform: 'WhatsApp', messages: msgs };
    const d = E.deep(msgs), quien = E.whoIsMore(msgs), fantasma = E.ghostOfWeek(msgs), peligro = E.dangerStreak(msgs), n = I18n.num;
    const dia = i => new Date(2024, 0, 1 + i).toLocaleDateString(I18n.locale, { weekday: 'long' });
    const ins = m => m.state === 'ex' ? `<span class="ex-badge ex">${t('Ex-miembro')}</span> <span class="ex-badge ex">${t('Salió del grupo')}</span>` : m.state === 'ghost' ? `<span class="ex-badge ghost">${t('Fantasma')}</span>` : '';
    const lista = d.isGroup ? d.rest : d.members;
    const podio = d.isGroup ? `<ol class="ex-podium">${d.podium.map((m, i) => `<li class="p${i + 1}"><span class="ex-avatar c${i}" aria-hidden="true">${esc(iniciales(m.name))}</span><strong>${['🥇', '🥈', '🥉'][i]} ${esc(m.name)}</strong>${ins(m)}<span>${n(m.messages)} · ${Math.round(m.share)}%</span></li>`).join('')}</ol>` : '';
    const resto = lista.length ? `<details class="ex-more"><summary>${t(d.isGroup ? 'Ver al resto del grupo ({n})' : 'Participantes ({n})', { n: n(lista.length) })}</summary><ul class="ex-bars">${lista.map(m => `<li><span class="ex-bar-name">${esc(m.name)} ${ins(m)}</span><span class="ex-bar"><i style="width:${Math.max(2, Math.round(m.share))}%"></i></span><strong>${m.share.toFixed(1)}%</strong></li>`).join('')}</ul></details>` : '';
    sitio.innerHTML = `
      ${peligro.danger ? `<p class="ex-danger" role="status"><strong>⚠️ ${t('Tu racha de {n} días vence hoy a las 23:59', { n: n(peligro.days) })}</strong></p>` : ''}
      <h3>${t('Podio y miembros')}</h3>${podio}${resto}
      <h3>${t('Palabras, medios y momentos')}</h3>
      <div class="wa-summary">
        <div><strong>${n(d.words)}</strong><span>${t('Palabras')}</span></div>
        <div><strong>${n(d.chars)}</strong><span>${t('Caracteres')}</span></div>
        <div><strong>${d.topSlot ? t(d.topSlot) : '—'}</strong><span>${t('Franja más activa')}</span></div>
        <div><strong>${d.topWeekday === null ? '—' : esc(dia(d.topWeekday))}</strong><span>${t('Día más activo de la semana')}</span></div>
        <div><strong>${n(d.media.audio)}</strong><span>${t('Audios')}</span></div>
        <div><strong>${n(d.media.image)}</strong><span>${t('Fotos')}</span></div>
        <div><strong>${n(d.media.video)}</strong><span>${t('Vídeos')}</span></div>
        <div><strong>${n(d.media.sticker)}</strong><span>${t('Stickers')}</span></div>
      </div>
      ${quien.length ? `<h3>${t('¿Quién es más...?')}</h3><ul class="wa-ranking">${quien.map(q => `<li><strong>${t(q.title)}</strong><span>${esc(q.name)} · ${esc(q.value)}</span></li>`).join('')}</ul>` : ''}
      ${fantasma ? `<p class="results-disclaimer">👻 ${t('Fantasma de la semana')}: <strong>${esc(fantasma.name)}</strong></p>` : ''}
      <div class="ex-share-actions">
        <button type="button" class="btn-minimal" id="waShareDl">${t('Descargar para Story (9:16)')}</button>
        <button type="button" class="btn-sub" id="waShareCopy">${t('Copiar imagen al portapapeles')}</button>
        <button type="button" class="btn-sub" id="waShareText">${t('Copiar resumen para WhatsApp')}</button>
      </div>`;
    const X = window.GolifiarExperiencias && window.GolifiarExperiencias.share;
    const on = (id, fn) => { const b = document.getElementById(id); if (b && X) b.addEventListener('click', () => fn(ultimoChat)); };
    on('waShareDl', X && X.download); on('waShareCopy', X && X.copyImage); on('waShareText', X && X.copyText);
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
      ultimoTexto = ''; ultimoNombre = archivo.name.replace(/\.txt$/i, '');
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
