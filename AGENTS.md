# Golifiar · reglas del proyecto (para Claude, Gemini, Codex y personas)

Golifiar analiza el ZIP de datos que descarga el propio usuario de Instagram (y, en el futuro, de WhatsApp, TikTok…). **Todo ocurre en el dispositivo**: no hay servidor, ni cuentas, ni contraseñas, ni peticiones de red con datos del usuario.

## Estructura
- `www/index.html` · interfaz, estilos y la lógica de carga y de la pestaña Seguidores (un solo archivo).
- `www/inicio.css` · estilos de la página de Inicio y de las animaciones. `www/motion.js` · entradas al hacer scroll, contadores y cabecera; respetan «reducir movimiento».
- `www/perfil.js` · análisis del perfil (interacciones, actividad, mensajes, contenido, limpieza, comparar). Expone `window.Perfil`.
- `www/service-worker.js` · caché sin conexión (red primero) y recepción de archivos compartidos. Sube el número de `CACHE_NAME` al publicar.
- `www/vendor/` · librerías de terceros ya incluidas (zip.js, JSZip). No añadas dependencias de CDN.
- `android/` · proyecto de Capacitor. `tests/` · prueba de humo con navegador real y ZIP de ejemplo inventados.

## Cómo trabajar
- Arrancar: `npm start` (sirve `www/`). Probar: `npm test` (con `CHROMIUM_PATH` si usas un Chromium propio).
- Antes de cada commit: `npm test` debe pasar y no debe haber errores en la consola del navegador.
- Rama de trabajo propia; `main` se publica sola en GitHub Pages al hacer push.

## Reglas que no se rompen
1. Privacidad: nunca enviar datos del usuario fuera del dispositivo; nada de analítica ni servidores. Del contenido de los mensajes solo se cuentan fechas y cantidades.
2. Sin límite de tamaño del ZIP: se lee por partes (zip.js con `useWebWorkers:false`); no cargar el archivo entero en memoria.
3. Nombres de usuario siempre en minúsculas; las fechas con `toLocaleDateString('es-ES')`; textos en español y con tuteo.
4. Las cuentas que el usuario dejó de seguir (`recently_unfollowed_*`) no cuentan como «seguidos»; con varios ZIP, las listas de seguidores/seguidos salen solo del más reciente.
5. Los nombres en Mensajes solo se enlazan a un perfil si coinciden con una única cuenta; si no, texto plano.
6. Cada red social nueva tiene su propio lector (un archivo por red) y devuelve el mismo formato interno; no mezclar su lógica con la de Instagram.
7. Movimiento: toda animación nueva debe quedar quieta con `prefers-reduced-motion` y la página debe verse completa sin JavaScript.
8. Accesibilidad: foco visible, teclado en pestañas, `prefers-reduced-motion`, sin `transition: all`.

## Reparto sugerido entre asistentes
- **Gemini** explora y resume (gran contexto): «¿qué toca este cambio?».
- **Claude** diseña el cambio y revisa.
- **Codex** implementa en una rama aparte y ejecuta las pruebas.
Un humano decide cuando discrepan. Cada sesión deja al final unas líneas en `NOTAS.md` (hecho, pendiente, decisiones).
