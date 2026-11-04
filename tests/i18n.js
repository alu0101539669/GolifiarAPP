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

  // WhatsApp y Experiencias (chat de ejemplo generado al vuelo, con varios meses para ver todas las secciones)
  const lineas = [];
  for (let i = 0; i < 120; i++) {
    const d = new Date(2026, 6 + Math.floor(i / 40), 1 + (i % 28), 8 + (i % 14), (i * 7) % 60);
    const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0'), hh = String(d.getHours()).padStart(2, '0'), mi = String(d.getMinutes()).padStart(2, '0');
    lineas.push(`[${dd}/${mm}/${d.getFullYear()}, ${hh}:${mi}:00] ${['Ana', 'Luis', 'Marta'][i % 3]}: mensaje ${i} fútbol`);
  }
  const chat = (n) => ({ name: n, mimeType: 'text/plain', buffer: Buffer.from(lineas.join('\n'), 'utf-8') });
  await pg.evaluate(() => cambiarVista('whatsapp'));
  await pg.setInputFiles('#whatsappFile', chat('chat1.txt'));
  await pg.waitForTimeout(500);
  await pg.evaluate(() => cambiarVista('experiencias'));
  await pg.setInputFiles('#exWhatsAppFiles', chat('chat1.txt'));
  await pg.waitForTimeout(700);
  await pg.setInputFiles('#exInstagramFiles', fx('completo.zip'));
  await pg.waitForTimeout(1500);
  for (const t of ['resumen', 'actividad', 'juegos', 'records', 'wrapped']) {
    await pg.click('#extab-' + t);
    if (t === 'actividad') await pg.check('#exEnableTopics');
    if (t === 'juegos') { await pg.click('#exStartQuiz'); await pg.waitForTimeout(150); }
  }
  assert.ok((await pg.locator('#exTagWhatsApp').innerText()).length > 0, 'la zona de WhatsApp debe mostrar cuántos chats se importaron');
  // Sin desbordes horizontales en móvil
  await pg.setViewportSize({ width: 390, height: 844 });
  for (const v of ['inicio', 'auditoria', 'whatsapp', 'experiencias', 'comousar']) {
    await pg.evaluate(x => cambiarVista(x), v);
    const ancho = await pg.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(ancho <= 391, `la vista ${v} no debe desbordar en móvil (ancho ${ancho})`);
  }
  await pg.setViewportSize({ width: 1200, height: 900 });

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
