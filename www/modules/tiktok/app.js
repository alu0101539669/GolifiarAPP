(function () {
  'use strict';

  const TIKTOK_HISTORY_KEY = 'golifiar-tiktok-history';
  let ultimoResultado = null;

  function esc(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function premiumActivo() {
    try {
      return localStorage.getItem('golifiar-premium-demo') === 'true';
    } catch (error) {
      return false;
    }
  }

  function activarPremiumDemo() {
    try {
      localStorage.setItem('golifiar-premium-demo', 'true');
    } catch (error) {
      /* sin almacenamiento */
    }
    if (ultimoResultado) mostrar(ultimoResultado);
  }

  function leerHistorial() {
    try {
      const data = JSON.parse(localStorage.getItem(TIKTOK_HISTORY_KEY) || '[]');
      return Array.isArray(data) ? data : [];
    } catch (error) {
      return [];
    }
  }

  function guardarHistorial(historial) {
    try {
      localStorage.setItem(TIKTOK_HISTORY_KEY, JSON.stringify(historial.slice(0, 10)));
    } catch (error) {
      /* sin almacenamiento */
    }
  }

  function snapshotDesdeResultado(resultado) {
    return {
      fecha: new Date().toISOString(),
      archivo: resultado?.archivo || 'tiktok-export',
      perfil: resultado?.perfil || { username: '', nombre: 'TikTok' },
      seguidores: Number(resultado?.seguidores || 0),
      seguidos: Number(resultado?.seguidos || 0),
      likes: Number(resultado?.likes || 0),
      favoritos: Number(resultado?.favoritos || 0),
      videos: Number(resultado?.videos || 0),
      comentarios: Number(resultado?.comentarios || 0),
      categorias: Array.isArray(resultado?.categorias) ? resultado.categorias.slice(0, 10) : [],
      topUsuarios: Array.isArray(resultado?.topUsuarios) ? resultado.topUsuarios.slice(0, 5) : []
    };
  }

  function formatearCambio(valor) {
    const numero = Number(valor || 0);
    if (numero === 0) return '0';
    return `${numero > 0 ? '+' : ''}${I18n.num(Math.abs(numero))}`;
  }

  function compararConAnterior(resultado, previo) {
    if (!previo) return '';
    const cambios = [
      ['seguidores', resultado?.seguidores || 0, previo?.seguidores || 0],
      ['seguidos', resultado?.seguidos || 0, previo?.seguidos || 0],
      ['likes', resultado?.likes || 0, previo?.likes || 0],
      ['videos', resultado?.videos || 0, previo?.videos || 0],
      ['favoritos', resultado?.favoritos || 0, previo?.favoritos || 0],
      ['comentarios', resultado?.comentarios || 0, previo?.comentarios || 0]
    ];

    const partes = cambios.map(([label, actual, anterior]) => {
      const delta = Number(actual) - Number(anterior);
      const signo = delta > 0 ? '▲' : delta < 0 ? '▼' : '•';
      return `<div class="wa-summary small"><div><strong>${signo} ${formatearCambio(delta)}</strong><span>${t(label === 'seguidores' ? 'Seguidores' : label === 'seguidos' ? 'Seguidos' : label === 'likes' ? 'Me gusta' : label === 'videos' ? 'Videos' : label === 'favoritos' ? 'Favoritos' : 'Comentarios')}</span></div></div>`;
    }).join('');

    return `<div class="tiktok-compare"><h3>${t('Comparar con la última exportación')}</h3>${partes}</div>`;
  }

  function mostrarHistorial(history) {
    if (!history.length) {
      return `<div class="wa-summary small"><div><strong>—</strong><span>${t('Sin historial')}</span></div></div>`;
    }

    return history.slice(0, 4).map(item => `
      <div class="wa-summary small">
        <div><strong>${I18n.num(item.seguidores || 0)}</strong><span>${t('Seguidores')}</span></div>
        <div><strong>${I18n.num(item.videos || 0)}</strong><span>${t('Videos')}</span></div>
        <div><strong>${I18n.num(item.likes || 0)}</strong><span>${t('Me gusta')}</span></div>
      </div>
      <p class="results-disclaimer">${esc(item.archivo)} · ${new Date(item.fecha).toLocaleDateString()}</p>
    `).join('');
  }

  function mostrar(resultado, previousSnapshot = null) {
    const salida = document.getElementById('tiktokResults');
    if (!salida) return;
    if (!resultado || !resultado.perfil || (!resultado.seguidores && !resultado.seguidos && !resultado.likes && !resultado.videos && !resultado.favoritos && !resultado.comentarios && !resultado.categorias.length)) {
      salida.innerHTML = `<p class="status-message error">${t('No se encontraron datos exportados de TikTok con un formato compatible.')}</p>`;
      return;
    }

    const history = leerHistorial();
    const previous = previousSnapshot || history[0] || null;
    const top = (resultado.topUsuarios || []).slice(0, 5).map(usuario => `<li><strong>${esc(usuario)}</strong></li>`).join('') || '<li><span>—</span></li>';
    const categorias = (resultado.categorias || []).slice(0, 5).map(categoria => `<span class="tag">${esc(categoria)}</span>`).join('') || '<span>—</span>';
    const premiumActions = premiumActivo() ? `<button class="btn-sub" type="button" onclick="activarTikTokPremium()">${t('Premium de demostración activo en este dispositivo')}</button>` : `<button class="btn-sub" type="button" onclick="activarTikTokPremium()">${t('Activar demo Premium')}</button>`;

    salida.innerHTML = `
      <div class="tiktok-dashboard" aria-live="polite">
        <div class="wa-summary">
          <div><strong>${I18n.num(resultado.seguidores || 0)}</strong><span>${t('Seguidores')}</span></div>
          <div><strong>${I18n.num(resultado.seguidos || 0)}</strong><span>${t('Seguidos')}</span></div>
          <div><strong>${I18n.num(resultado.videos || 0)}</strong><span>${t('Videos')}</span></div>
          <div><strong>${I18n.num(resultado.likes || 0)}</strong><span>${t('Me gusta')}</span></div>
        </div>
        <div class="wa-summary small">
          <div><strong>${I18n.num(resultado.favoritos || 0)}</strong><span>${t('Favoritos')}</span></div>
          <div><strong>${I18n.num(resultado.comentarios || 0)}</strong><span>${t('Comentarios')}</span></div>
        </div>
        <div class="wa-summary small">
          <div><strong>${I18n.num((resultado.topUsuarios || []).length || 0)}</strong><span>${t('Usuarios relevantes')}</span></div>
          <div><strong>${I18n.num((resultado.categorias || []).length || 0)}</strong><span>${t('Categorías')}</span></div>
        </div>
        ${compararConAnterior(resultado, previous)}
        <div class="tiktok-actions">${premiumActions}</div>
        <h3>${t('Perfil')}</h3>
        <p><strong>${esc(resultado.perfil?.username || resultado.perfil?.nombre || 'TikTok')}</strong></p>
        <h3>${t('Temas y categorías')}</h3>
        <div class="tags">${categorias}</div>
        <h3>${t('Usuarios más relevantes')}</h3>
        <ol class="wa-ranking">${top}</ol>
        <h3>${t('Historial local')}</h3>
        ${mostrarHistorial(history)}
        <p class="results-disclaimer">${t('Solo se han contado métricas, categorías y actividad. El contenido de los vídeos no se muestra ni se guarda.')}</p>
      </div>`;
  }

  async function cargar(input) {
    const archivos = Array.from(input.files || []);
    if (!archivos.length) return;

    const resultados = [];
    for (const archivo of archivos) {
      if (!/\.(json|txt)$/i.test(archivo.name)) {
        continue;
      }
      try {
        const texto = await archivo.text();
        const analisis = GolifiarTikTok.analizar(texto, archivo.name);
        analisis.archivo = archivo.name;
        resultados.push(analisis);
      } catch (error) {
        console.error('No se pudo leer la exportación de TikTok.', error);
      }
    }

    if (!resultados.length) {
      ultimoResultado = { seguidores: 0, seguidos: 0, likes: 0, videos: 0, favoritos: 0, comentarios: 0, categorias: [], topUsuarios: [], perfil: { username: '', nombre: 'TikTok' } };
      mostrar(ultimoResultado);
      return;
    }

    ultimoResultado = resultados[resultados.length - 1];
    const history = leerHistorial();
    const snapshot = snapshotDesdeResultado(ultimoResultado);
    const nextHistory = [snapshot].concat(history.filter(item => item.archivo !== snapshot.archivo || Math.abs(new Date(item.fecha).getTime() - new Date(snapshot.fecha).getTime()) > 5000));
    guardarHistorial(nextHistory);

    const previa = history[0] || null;
    if (premiumActivo() || archivos.length <= 1) {
      mostrar(ultimoResultado, previa);
      return;
    }

    const resumen = {
      ...ultimoResultado,
      categorias: ultimoResultado.categorias || [],
      topUsuarios: ultimoResultado.topUsuarios || []
    };
    mostrar(resumen, previa);
    if (previa) {
      const area = document.getElementById('tiktokResults');
      if (area) area.insertAdjacentHTML('beforeend', `<p class="status-message">${t('Se comparará la última exportación con la anterior en el historial local.')}</p>`);
    }
  }

  if (window.I18n) I18n.alAplicar(() => { if (ultimoResultado) mostrar(ultimoResultado); });
  window.cargarTikTok = cargar;
  window.activarTikTokPremium = activarPremiumDemo;
}());
