// Las tarjetas deben descargarse de verdad y el editor/Premium/comparar no deben dar errores.
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');
const web = 'file://' + path.resolve(__dirname, '../www/index.html');
const chat = Array.from({ length: 120 }, (_, i) => `[${String(1 + i % 28).padStart(2, '0')}/0${1 + Math.floor(i / 40)}/2026, ${String(8 + i % 14).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00] ${['Ana', 'Luis', 'Marta'][i % 3]}: hola jajaja 😀 viaje ${i}`).join('\n');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext({ locale: 'es-ES', acceptDownloads: true, viewport: { width: 1000, height: 800 } });
  const page = await ctx.newPage(); const errores = []; page.on('pageerror', e => errores.push(e.message));
  await page.goto(web + '#dev'); await page.reload();
  await page.evaluate(() => cambiarVista('experiencias'));
  await page.setInputFiles('#exWhatsAppFiles', { name: 'chat.txt', mimeType: 'text/plain', buffer: Buffer.from(chat) });
  await page.waitForSelector('#exChatSelect');
  await page.click('#extab-curiosidad'); await page.check('#exEnableTopics2');
  const pedir = async sel => { const d = page.waitForEvent('download', { timeout: 5000 }); await page.click(sel); return (await d).suggestedFilename(); };
  for (const c of ['adn', 'vs', 'turno', 'adivina', 'peligro']) assert.ok((await pedir(`[data-card="${c}"]`)).endsWith('.png'), `Tarjeta ${c}`);
  await page.click('#extab-wrapped');
  assert.ok((await pedir('#exStreakDl')).endsWith('.png'), 'Tarjeta de racha');
  assert.ok((await pedir('#exExportCard2')).endsWith('.png'), 'Tarjeta Wrapped');
  await page.evaluate(() => { const e = document.getElementById('edAccent'); e.value = '#ff0066'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.ok((await pedir('#exStreakDl')).endsWith('.png'), 'Tarjeta con editor');
  await page.click('#extab-curiosidad');
  await page.setInputFiles('#exCompareFile', { name: 'otro.txt', mimeType: 'text/plain', buffer: Buffer.from(chat) });
  await page.waitForSelector('#expane-curiosidad .ex-table');
  // Vista de WhatsApp: el análisis completo se monta debajo del resumen.
  await page.evaluate(() => cambiarVista('whatsapp'));
  await page.setInputFiles('#whatsappFile', { name: 'wa.txt', mimeType: 'text/plain', buffer: Buffer.from(chat) });
  await page.waitForSelector('#waFull .ex-toolbar');
  await page.click('#waFull #extab-curiosidad');
  assert.ok(await page.locator('#waFull .ex-heat, #waFull #expane-curiosidad').count() > 0, 'WhatsApp muestra Full Curiosidad');
  assert.strictEqual(await page.locator('#exChatSelect').count(), 1, 'Sin IDs duplicados');
  // Informe de Instagram: pestaña Full Curiosidad con los mensajes del ZIP.
  await page.evaluate(() => cambiarVista('auditoria'));
  await page.setInputFiles('#zipFileInput', path.resolve(__dirname, 'fixtures/dejados-y-mensajes.zip'));
  await page.waitForTimeout(1500); await page.evaluate(() => ejecutarAnalisis()); await page.waitForTimeout(1500);
  await page.waitForSelector('#ptab-curiosidad', { state: 'visible', timeout: 20000 });
  await page.click('#ptab-curiosidad');
  await page.waitForSelector('#panel-curiosidad .ex-toolbar, #panel-curiosidad .ex-status', { timeout: 20000 });
  assert.strictEqual(await page.locator('#panel-curiosidad .ex-status.error').count(), 0, 'Instagram monta el análisis sin error');
  assert.deepStrictEqual(errores, [], 'Sin errores de consola: ' + errores.join(' | '));
  await browser.close();
  console.log('OK: tarjetas');
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
