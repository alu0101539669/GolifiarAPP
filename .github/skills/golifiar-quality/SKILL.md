---
name: golifiar-quality
description: "Use when validating Golifiar accessibility, privacy, internationalization, local-first behavior, browser smoke tests, or production builds."
---

# Golifiar Quality

Skill específica del repositorio para validar una aplicación vanilla, PWA y
Capacitor sin enviar exportaciones fuera del dispositivo.

## Flujo

1. Generar fixtures sintéticos:

   `python3 tests/fixtures/make_zip.py`

2. Ejecutar la suite funcional y de idioma:

   `npm test`

3. Auditar WCAG 2A y 2AA:

   `npm run test:a11y`

4. Verificar el build:

   `npm run build`

## Reglas

- Nunca usar exportaciones personales en fixtures.
- No añadir scraping, credenciales, analítica ni peticiones remotas.
- No debilitar aserciones para ocultar regresiones.
- Revisar las vistas Inicio y Analizar, incluido teclado, foco, formularios,
  estados vacíos, errores y textos traducidos.
- Si una comprobación no puede ejecutarse, informar del bloqueo exacto.

## Resultado

Informar de cada comando como `OK`, `FALLO` o `BLOQUEADO`, con el primer error
real y la ruta afectada.
