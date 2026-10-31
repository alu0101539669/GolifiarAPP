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
