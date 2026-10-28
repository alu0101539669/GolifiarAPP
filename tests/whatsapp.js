const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

const web = 'file://' + path.resolve(__dirname, '../www/index.html');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await (await browser.newContext({ locale: 'es-ES' })).newPage();
  await page.goto(web);
  const resultado = await page.evaluate(() => GolifiarWhatsApp.analizar(
    '[28/10/2026, 12:30] Ana: Hola\n[28/10/2026, 12:31] Yo: ¿Qué tal?\n[29/10/2026, 09:00] Ana: Bien',
    'chat.txt'
  ));
  assert.strictEqual(resultado.mensajes, 3);
  assert.strictEqual(resultado.participantes[0].participante, 'Ana');
  assert.strictEqual(resultado.diasActivos, 2);
  assert.strictEqual(resultado.horaPico, 12);
  const advertencias = await page.evaluate(() => GolifiarWhatsApp.analizar('texto sin formato').advertencias.length);
  assert.strictEqual(advertencias, 1);
  const guiones = await page.evaluate(() => GolifiarWhatsApp.analizar(
    '28/10/2026, 12:30 - Ana: Mensaje\ncontinuación\n29/10/2026, 09:00 - Tú: Respuesta',
    'guiones.txt'
  ));
  assert.strictEqual(guiones.formato, 'guiones');
  assert.strictEqual(guiones.mensajes, 2);
  assert.strictEqual(guiones.participantes[1].participante, 'Tú');
  assert.strictEqual(guiones.diasActivos, 2);
  assert.ok(!JSON.stringify(guiones).includes('Mensaje'));
  await page.setInputFiles('#whatsappFile', {
    name: 'chat.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('[28/10/2026, 12:30] Ana: Hola')
  });
  await page.evaluate(() => I18n.fijar('en'));
  assert.match(await page.locator('#whatsappResults').innerText(), /Messages analysed/);
  assert.match(await page.locator('#whatsappResults').innerText(), /People with the most messages/);
  await page.evaluate(() => I18n.fijar('es'));
  assert.match(await page.locator('#whatsappResults').innerText(), /Mensajes analizados/);
  const internacional = await page.evaluate(() => GolifiarWhatsApp.analizar(
    '\uFEFF[12/31/24, 11:59 PM] \u200eAna: Noche\n12/31/24, 12:01 AM - Yo: Madrugada\n[31/02/24, 10:00] Error: Fecha inválida\n[01/01/25, 10:00:12] Ana: Otro',
    'internacional.txt'
  ));
  assert.strictEqual(internacional.mensajes, 3);
  assert.strictEqual(internacional.horaPico, 0);
  assert.strictEqual(internacional.diasActivos, 2);
  assert.ok(!JSON.stringify(internacional).includes('Noche'));
  await browser.close();
  console.log('OK: WhatsApp');
})().catch(error => {
  console.error('FALLO:', error.message);
  process.exit(1);
});
