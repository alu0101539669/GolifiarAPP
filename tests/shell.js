// Integridad: caché sin conexión completa y pruebas no vacías.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const www = path.resolve(__dirname, '../www');
const norm = p => p.replace(/^\.?\//, '').split('?')[0];
try {
  for (const f of fs.readdirSync(__dirname).filter(f => f.endsWith('.js'))) {
    assert.ok(fs.statSync(path.join(__dirname, f)).size > 200, `tests/${f} está vacío o truncado`);
  }
  const sw = fs.readFileSync(path.join(www, 'service-worker.js'), 'utf8');
  const shell = new Set([...sw.match(/APP_SHELL\s*=\s*\[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map(m => norm(m[1])));
  shell.forEach(p => { if (p) assert.ok(fs.existsSync(path.join(www, p)), `APP_SHELL apunta a un archivo que no existe: ${p}`); });
  const html = fs.readFileSync(path.join(www, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css|webmanifest))"/g)].map(m => norm(m[1]));
  const fuera = refs.filter(r => !shell.has(r));
  assert.deepStrictEqual(fuera, [], 'Archivos de index.html que faltan en APP_SHELL (no funcionarían sin conexión): ' + fuera.join(', '));
  console.log('OK: caché sin conexión y pruebas completas');
} catch (e) { console.error('FALLO:', e.message); process.exit(1); }
