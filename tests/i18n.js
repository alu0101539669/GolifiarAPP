// Prueba de idiomas: en inglés no debe quedar ningún texto sin traducir y al volver a español todo se restaura.
// Uso: npm run test:i18n   (DUMP=ruta.json guarda las claves que faltan)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const web = 'file://' + path.resolve(__dirname, '../www/index.html');
const fx = n => path.resolve(__dirname, 'fixtures', n);
const PANELES = ['resumen', 'seguidores', 'interacciones', 'limpieza', 'actividad', 'mensajes', 'contenido', 'comparar'];

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.CHROMIUM_PATH || undefined });
  const errores = [];
  const pg = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: 'en-GB' })).newPage();
  pg.on('pageerror', e => errores.push(e.message));
  await pg.goto(web);
  await pg.waitForTimeout(400);
  await pg.evaluate(() => I18n.fijar('en'));
  await pg.click('text=Start analysing').catch(() => pg.evaluate(() => cambiarVista('auditoria')));

  for (const zip of ['completo.zip', 'dejados-y-mensajes.zip']) {
    await pg.setInputFiles('#zipFileInput', fx(zip));
    await pg.waitForTimeout(1500);
    await pg.evaluate(() => ejecutarAnalisis());
    await pg.waitForTimeout(1500);
    for (const p of PANELES) {
      await pg.evaluate(n => Perfil.cambiarPanel(n), p);
      await pg.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
      if (p === 'limpieza') for (const a of ['saltar', 'mantener', 'dejar', 'deshacer']) await pg.evaluate(x => { window.open = () => null; Perfil.limpiezaAccion(x); }, a);
      await pg.waitForTimeout(100);
    }
    await pg.evaluate(() => Perfil.guardarSnap());
  }
  // ZIP en HTML (rama «tu descarga está en HTML»)
  await pg.setInputFiles('#zipFileInput', fx('html.zip'));
  await pg.waitForTimeout(1200);
  await pg.evaluate(() => ejecutarAnalisis());
  await pg.waitForTimeout(1200);
  for (const p of PANELES) await pg.evaluate(n => Perfil.cambiarPanel(n), p);

  const faltan = await pg.evaluate(() => [...I18n.faltan]);
  if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(faltan, null, 1));
  assert.deepStrictEqual(faltan, [], 'textos sin traducir: ' + JSON.stringify(faltan.slice(0, 15)));

  // Volver a español restaura el original
  await pg.evaluate(() => I18n.fijar('es'));
  const resumen = await pg.locator('#panel-resumen').innerText();
  assert.ok(/^es(?:-|$)/.test(await pg.evaluate(() => I18n.locale)), 'el idioma debe volver a español');
  assert.ok(!/Profile health|Not much to analyse/.test(resumen), 'el Resumen no debe conservar el inglés');
  await pg.evaluate(() => I18n.fijar('en'));
  const resumenIngles = await pg.locator('#panel-resumen').innerText();
  assert.ok(/^en(?:-|$)/.test(await pg.evaluate(() => I18n.locale)), 'el idioma debe pasar a inglés');
  assert.ok(!/Salud de tu perfil|Tu descarga está en HTML/.test(resumenIngles), 'el Resumen no debe conservar el español');

  assert.deepStrictEqual(errores, [], 'no debe haber errores de JavaScript');
  console.log('OK: idiomas');
  await browser.close();
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
