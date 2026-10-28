---
description: "Use when editing Golifiar web files, local analysis agents, parsers, privacy behavior, UI text, or PWA assets."
applyTo: ["www/**/*.html", "www/**/*.js", "www/**/*.css", "tests/**/*.js", "tests/**/*.py"]
---
# Golifiar web rules

- Process exports locally and do not add analytics, scraping, login, or remote data requests.
- Keep each social-network reader independent and normalize its result before shared presentation.
- Keep page structure in HTML, shared behavior in `www/app/`, network importers in
  `www/modules/`, and styles in `www/styles/`; do not grow `index.html` with
  application logic.
- Source copy is Spanish and uses tuteo. Add English translations for every visible dynamic string.
- Use `I18n.fecha` and `I18n.locale` for dates.
- Use synthetic fixtures only. Do not commit personal exports, ZIP files, or conversations.
- Preserve keyboard access, visible focus, reduced motion, and offline behavior.
- Use semantic HTML, stable accessible names, 44px minimum touch targets, and
  explicit loading, empty, error, and success states.
- Prefer the repository quality skill for validation instead of copying external
  UI frameworks or design systems into the shipped app.
- Run `npm test` and `npm run build` after behavior changes.
