# Notas de sesión

Una entrada por sesión: fecha, qué se hizo, qué queda, decisiones y por qué.

## Sesión · idiomas y modo claro/oscuro
- Hecho: selector ES/EN en la cabecera, traducción completa (Inicio, guías, app y paneles de perfil), modo claro/oscuro, contadores con formato por idioma, prueba `tests/i18n.js`, SW v16.
- Pendiente: probar en móvil real; la rama `claude/android-compartir`; cobrar (decisión aplazada); lectores de WhatsApp/TikTok.
- Decisión: el español es la clave de traducción; si falta una entrada se ve el español y el test avisa.

## Módulo de experiencias de chat · parche local
- Añadido: perfil del grupo, calendario de actividad, rachas y récords, comparación mensual del mismo chat, análisis opcional de palabras, modo fiesta con preguntas de estadísticas, torneo entre chats, Wrapped y exportación de tarjeta PNG.
- Plataformas: WhatsApp TXT y exportación ZIP de Instagram con `messages/inbox/**/message_*.json` compatibles.
- Privacidad: procesamiento local; el análisis de palabras está desactivado por defecto y no guarda ni muestra el texto original.
- Pruebas: `tests/experiencias.js`; ejecutar `npm test` y `npm run build`.

## Inicio genérico y guía por red
- Hecho: el Inicio ya no es solo de Instagram: «Elige tu red» (Instagram, WhatsApp, Experiencias, TikTok y Spotify con estado), pasos comunes, privacidad y preguntas genéricas. «Cómo usarlo» pasa a ser una guía por red con navegación interna. Título y meta descriptivos de toda la suite. Inglés completo.
- Pendiente: cuando TikTok/Spotify estén listos, quitar «Próximamente» en la tarjeta y la guía; revisar las rutas de menú de su guía.

## Móvil y Experiencias
- Hecho: la cabecera ya no ensancha la página en móvil (menú deslizable que centra la pestaña activa, cabecera compacta); WhatsApp y Experiencias usan la misma zona de arrastrar que Instagram; Experiencias reorganizada en pestañas (Resumen, Actividad, Juegos, Récords y torneo, Wrapped) con gráficos de horas/meses, barras de participantes, medidores, tema claro/oscuro real y botón para borrar los chats de la memoria; nombres de Instagram con acentos corregidos; plurales; pruebas de desborde en móvil y accesibilidad ampliadas (`tests/i18n.js`, `tests/accessibility.js`).
- Pendiente: revisar en un móvil real; torneo con tabla ancha (se desplaza dentro de su tarjeta).

## Especificación de diseño (fase 1-2)
- Hecho: parser WhatsApp multiformato (DD/MM, MM/DD, AM/PM), mensajes de sistema (salidas/entradas), medios, palabras/caracteres, franjas, miembros activos/ex/fantasma con insignias, podio, «¿Quién es más…?», fantasma de la semana, peligro de racha, reloj de actividad, filtro de periodo, tarjeta 9:16 (descargar/copiar), resumen para WhatsApp, anonimizar, modal de errores, zona de subida de un solo .txt con botón/progreso/hover.
- Decisiones: un solo chat por sesión; avatares = iniciales; estilos Neón/Cyberpunk/Minimalista tras Premium demo; sonido sintetizado y apagado por defecto (`golifiar-sonido`).
- Pendiente: Web Worker >100k mensajes, Wrapped animado, Labs/«Full Curiosidad», Vs/diplomas/Tu turno/ADN, editor en vivo de tarjetas, momentos «te quiero» (con opt-in), botonera de plataformas y bypass de desarrollador, comparar 2 chats.
- WhatsApp: la vista usa ahora el mismo motor local que Experiencias (podio, miembros, medios, franjas, «¿Quién es más…?», tarjeta 9:16, copiar resumen), zona de subida con botón y progreso. Modo oscuro revisado en todas las vistas (claro/oscuro/alternador): sin fallos de contraste reales.
- Labs: pestaña «Full Curiosidad» (drama, conversación sin pausas, encaje, «¿con quién es más probable…?», ADN, primeras veces, compatibilidad de temas; lo que lee texto exige el opt-in), tarjetas Vs/diploma/Tu turno/Adivina/Peligro/ADN, Wrapped en 6 tarjetas, `#dev` activa Premium demo. Pendiente: Web Worker >100k, editor de tarjeta en vivo, comparar 2 chats, música del Wrapped.
- Worker: chats de más de ~5 MB se analizan en `modules/experiencias/worker.js` (con respaldo al hilo principal). 160.000 mensajes en ~3 s.
- Cierre de especificación: botonera Instagram/WhatsApp/TikTok/Spotify en Inicio, Premium con candado en paneles IG y WA + selector de rol (visible con #dev), editor de tarjeta en vivo + HD/sin marca (Premium), Comparar 2 chats (desbloqueo de confianza al crear una tarjeta), diccionario del chat, nube de emojis, química con 4 factores (con opt-in), test tests/cards.js. Pendiente: música del Wrapped, avatares reales, sticker de encuesta de Instagram (imposible desde web), TikTok/Spotify reales.
