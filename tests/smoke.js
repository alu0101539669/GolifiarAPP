// Prueba de humo: abre la web en un navegador real y comprueba lo esencial.
// Uso: npm test   (necesita: npm i -D playwright && npx playwright install chromium)
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');
const web = 'file://' + path.resolve(__dirname, '../www/index.html');
const fx = n => path.resolve(__dirname, 'fixtures', n);
const visibles = pg => pg.evaluate(() => [...document.querySelectorAll('.view-container:not(.hidden)')].map(e => e.id));

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.CHROMIUM_PATH || undefined });
  const errores = [];
  const pg = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: 'es-ES' })).newPage();
  pg.on('pageerror', e => errores.push(e.message));
  await pg.goto(web);
  await pg.waitForTimeout(400);

  assert.deepStrictEqual(await visibles(pg), ['viewInicio'], 'la web debe abrir en Inicio');
  await pg.click('text=Empezar a analizar');
  assert.deepStrictEqual(await visibles(pg), ['viewAuditoria'], 'el botón debe llevar a Analizar');

  // 1) ZIP completo en JSON
  await pg.setInputFiles('#zipFileInput', fx('completo.zip'));
  await pg.waitForTimeout(2000);
  await pg.evaluate(() => ejecutarAnalisis());
  await pg.waitForTimeout(1500);
  assert.strictEqual(await pg.locator('#valFollowers').innerText(), '25', 'seguidores');
  assert.strictEqual(await pg.locator('#valFollowing').innerText(), '28', 'seguidos');
  assert.strictEqual(await pg.locator('#profileTabs.hidden').count(), 0, 'las pestañas del perfil deben verse');

  // 2) Cuentas dejadas de seguir no cuentan como seguidas; solo se enlaza si el nombre es único
  await pg.setInputFiles('#zipFileInput', fx('dejados-y-mensajes.zip'));
  await pg.waitForTimeout(1500);
  const seguidos = await pg.evaluate(() => zipFollowingArray.map(u => u.username).sort());
  assert.deepStrictEqual(seguidos, ['ana_ruiz', 'nuevo', 'reseguido'], 'viejo debe descartarse');
  await pg.evaluate(() => ejecutarAnalisis());
  await pg.waitForTimeout(1500);
  await pg.evaluate(() => Perfil.cambiarPanel('mensajes'));
  const enlaces = await pg.$$eval('#panel-mensajes a', a => a.map(x => x.href));
  assert.deepStrictEqual(enlaces, ['https://www.instagram.com/ana_ruiz/'], 'solo Ana debe enlazar');

  // 3) Descarga en HTML
  await pg.setInputFiles('#zipFileInput', fx('html.zip'));
  await pg.waitForTimeout(1500);
  assert.ok((await pg.evaluate(() => zipFollowersArray.length)) > 0, 'el HTML debe leer seguidores');

  assert.deepStrictEqual(errores, [], 'no debe haber errores de JavaScript');
  console.log('OK: todas las comprobaciones pasan');
  await browser.close();
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
