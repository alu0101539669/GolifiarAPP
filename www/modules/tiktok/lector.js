(function () {
  'use strict';

  function limpiarTexto(valor) {
    return String(valor ?? '').replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim();
  }

  function numero(valor, fallback = 0) {
    if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
    if (typeof valor === 'string') {
      const limpio = valor.replace(/[^0-9.,kKmMbB]/g, '').trim();
      if (!limpio) return fallback;
      const normalizado = limpio.replace(/,/g, '').replace(/\s+/g, '');
      const conEscala = /[kKmM]$/i.test(normalizado);
      let base = Number.parseFloat(normalizado.replace(/[kKmM]/gi, ''));
      if (Number.isNaN(base)) return fallback;
      if (conEscala) {
        const letra = normalizado.slice(-1).toLowerCase();
        if (letra === 'k') base *= 1000;
        if (letra === 'm') base *= 1000000;
      }
      return Number.isFinite(base) ? Math.round(base) : fallback;
    }
    if (Array.isArray(valor) && valor.length) return numero(valor[0], fallback);
    return fallback;
  }

  function visitar(node, fn) {
    if (node === null || node === undefined) return;
    fn(node);
    if (Array.isArray(node)) {
      for (const item of node) visitar(item, fn);
      return;
    }
    if (typeof node !== 'object') return;
    for (const value of Object.values(node)) visitar(value, fn);
  }

  function buscarValor(obj, claves) {
    const candidatos = [];
    if (obj && typeof obj === 'object') {
      candidatos.push(obj);
      for (const valor of Object.values(obj)) {
        if (valor && typeof valor === 'object') candidatos.push(valor);
      }
    }
    for (const candidato of candidatos) {
      for (const clave of claves) {
        if (Object.prototype.hasOwnProperty.call(candidato, clave)) {
          const valor = candidato[clave];
          if (valor !== undefined && valor !== null && valor !== '') return valor;
        }
        const match = Object.keys(candidato).find(k => k.toLowerCase() === clave.toLowerCase());
        if (match && candidato[match] !== undefined && candidato[match] !== null && candidato[match] !== '') {
          return candidato[match];
        }
      }
    }
    return null;
  }

  function formaBase() {
    return {
      red: 'tiktok',
      archivo: '',
      formato: 'json',
      perfil: { username: '', nombre: 'TikTok' },
      seguidores: 0,
      seguidos: 0,
      likes: 0,
      favoritos: 0,
      videos: 0,
      comentarios: 0,
      categorias: [],
      topUsuarios: [],
      actividad: [],
      advertencias: []
    };
  }

  function normalizarJson(raw) {
    const fuente = raw && typeof raw === 'object' ? raw : {};
    const salida = formaBase();
    const categorias = new Map();
    const usuarios = new Map();
    const actividad = new Map();

    function registrarMetric(nombre, valor) {
      const num = numero(valor, 0);
      if (num > salida[nombre]) salida[nombre] = num;
    }

    function registrarCategoria(valor) {
      const texto = limpiarTexto(valor);
      if (!texto) return;
      const clave = texto.toLowerCase();
      if (!clave) return;
      categorias.set(clave, (categorias.get(clave) || 0) + 1);
    }

    function registrarUsuario(valor) {
      const texto = limpiarTexto(valor);
      if (!texto || texto.length > 60) return;
      const clave = texto.toLowerCase();
      usuarios.set(clave, (usuarios.get(clave) || 0) + 1);
    }

    function registrarFecha(valor) {
      const texto = limpiarTexto(valor);
      if (!texto) return;
      const fecha = new Date(texto);
      if (Number.isNaN(fecha.getTime())) return;
      const iso = fecha.toISOString().slice(0, 10);
      actividad.set(iso, (actividad.get(iso) || 0) + 1);
    }

    visitar(fuente, node => {
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        const low = String(key).toLowerCase();
        if (['followers', 'follower_count', 'followers_count', 'followercount', 'fans', 'fans_count', 'total_followers', 'totalfollowers'].includes(low)) registrarMetric('seguidores', value);
        if (['following', 'following_count', 'followings_count', 'followingcount', 'total_following', 'totalfollowing'].includes(low)) registrarMetric('seguidos', value);
        if (['likes', 'like_count', 'likes_count', 'likecount', 'total_likes', 'totallikes'].includes(low)) registrarMetric('likes', value);
        if (['favorites', 'favorite_count', 'favorites_count', 'favoritecount', 'bookmarks', 'total_favorites', 'totalfavorites'].includes(low)) registrarMetric('favoritos', value);
        if (['videos', 'video_count', 'videos_count', 'videocount', 'total_videos', 'totalvideos'].includes(low)) registrarMetric('videos', value);
        if (['comments', 'comment_count', 'comments_count', 'commentcount', 'total_comments', 'totalcomments'].includes(low)) registrarMetric('comentarios', value);

        if (typeof value === 'string' || typeof value === 'number') {
          if (low.includes('date') || low.includes('timestamp') || low.includes('time') || low.includes('created')) registrarFecha(value);
          if (/(category|categor|hashtag|tag|topic)/i.test(low)) registrarCategoria(value);
        }

        if (Array.isArray(value)) {
          value.forEach(item => {
            if (typeof item === 'string') {
              if (/(category|categor|hashtag|tag|topic)/i.test(low)) registrarCategoria(item);
              else registrarUsuario(item);
            } else if (item && typeof item === 'object') {
              const user = buscarValor(item, ['username', 'userName', 'screen_name', 'nickname', 'handle', 'name']) || buscarValor(item, ['displayName', 'fullName', 'title']);
              if (user) registrarUsuario(user);
              const categoria = buscarValor(item, ['category', 'hashtag', 'tag', 'topic', 'name']);
              if (categoria) registrarCategoria(categoria);
              const fecha = buscarValor(item, ['date', 'timestamp', 'time', 'createdAt']);
              if (fecha) registrarFecha(fecha);
            }
          });
        }

        if (value && typeof value === 'object' && ['user', 'profile', 'account', 'creator'].includes(low)) {
          const username = buscarValor(value, ['username', 'userName', 'screen_name', 'nickname', 'uniqueId', 'handle']);
          const nombre = buscarValor(value, ['displayName', 'name', 'fullName', 'title']);
          if (typeof username === 'string' && !salida.perfil.username) salida.perfil.username = username.toLowerCase();
          if (typeof nombre === 'string' && !salida.perfil.nombre) salida.perfil.nombre = nombre.trim();
        }
      }
    });

    const username = buscarValor(fuente, ['username', 'userName', 'screen_name', 'nickname', 'uniqueId', 'handle']);
    const nombre = buscarValor(fuente, ['displayName', 'name', 'fullName', 'title']);
    if (typeof username === 'string' && !salida.perfil.username) salida.perfil.username = username.toLowerCase();
    if (typeof nombre === 'string' && !salida.perfil.nombre) salida.perfil.nombre = nombre.trim();

    salida.formato = 'json';
    salida.categorias = [...categorias.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([nombreCategoria]) => nombreCategoria);
    salida.topUsuarios = [...usuarios.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([usuario]) => usuario);
    salida.actividad = [...actividad.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-7);
    return salida;
  }

  function normalizarTexto(texto) {
    const lineas = String(texto || '').split(/\r?\n/).map(linea => linea.trim()).filter(Boolean);
    const salida = formaBase();
    salida.formato = 'texto';

    if (!lineas.length) {
      salida.advertencias = ['No se encontraron datos exportados de TikTok con un formato compatible.'];
      return salida;
    }

    for (const linea of lineas) {
      const limpio = linea.toLowerCase();
      const match = linea.match(/([0-9][0-9.,kKmM]*)/);
      if (match) {
        const valor = numero(match[1], 0);
        if (/followers?|seguidores/.test(limpio)) salida.seguidores = Math.max(salida.seguidores, valor);
        if (/following?|seguidos/.test(limpio)) salida.seguidos = Math.max(salida.seguidos, valor);
        if (/likes?|me gusta/.test(limpio)) salida.likes = Math.max(salida.likes, valor);
        if (/favorites?|favoritos/.test(limpio)) salida.favoritos = Math.max(salida.favoritos, valor);
        if (/videos?/.test(limpio)) salida.videos = Math.max(salida.videos, valor);
        if (/comments?|comentarios/.test(limpio)) salida.comentarios = Math.max(salida.comentarios, valor);
      }

      if (/(category|categor(?:[íi]a)?|tag|tema|hashtag|tópico)/i.test(linea)) {
        const resto = linea.match(/(?:category(?:s)?|categor(?:[íi]a)?|tag|tema|hashtag|tópico)\s*[:\-]?\s*(.+)$/i);
        const valor = resto && resto[1] ? resto[1].replace(/[;,.].*$/, '').trim() : '';
        if (valor) salida.categorias.push(valor);
      }
    }

    salida.categorias = [...new Set(salida.categorias)].slice(0, 10);
    if (!salida.seguidores && !salida.seguidos && !salida.likes && !salida.videos && !salida.favoritos && !salida.comentarios && !salida.categorias.length) {
      salida.advertencias = ['No se encontraron datos exportados de TikTok con un formato compatible.'];
    }
    return salida;
  }

  function analizar(texto, nombre) {
    const entrada = String(texto || '');
    if (!entrada.trim()) {
      const vacio = formaBase();
      vacio.archivo = nombre || '';
      vacio.formato = 'vacío';
      vacio.advertencias = ['No se encontraron datos exportados de TikTok.'];
      return vacio;
    }

    try {
      const json = JSON.parse(entrada);
      const normalizada = normalizarJson(json);
      normalizada.archivo = nombre || '';
      return normalizada;
    } catch (error) {
      const normalizada = normalizarTexto(entrada);
      normalizada.archivo = nombre || '';
      return normalizada;
    }
  }

  window.GolifiarTikTok = Object.freeze({ analizar, normalizarJson, normalizarTexto });
}());
