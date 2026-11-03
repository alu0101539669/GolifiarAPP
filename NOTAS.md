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
