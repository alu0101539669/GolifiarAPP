// Auditoría local WCAG con axe-core y Playwright.
const { chromium } = require('playwright');
const axeSource = require('axe-core').source;
const path = require('path');
const assert = require('assert');

const web = 'file://' + path.resolve(__dirname, '../www/index.html');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' })).newPage();
  await page.goto(web);
  await page.waitForTimeout(300);
  await page.addScriptTag({ content: axeSource });
  await page.addStyleTag({ content: `
    *, *::before, *::after { animation: none !important; transition: none !important; }
    .rv, .in-pv-row, .in-pv-hours i { opacity: 1 !important; transform: none !important; }
    .in-title span { color: #0b6e99 !important; background: none !important; }
  ` });

  const vistas = ['#viewInicio', '#viewAuditoria', '#viewWhatsapp'];
  for (const vista of vistas) {
    if (vista === '#viewAuditoria') await page.evaluate(() => cambiarVista('auditoria'));
    if (vista === '#viewWhatsapp') {
      await page.evaluate(() => cambiarVista('whatsapp'));
      await page.setInputFiles('#whatsappFile', {
        name: 'chat.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('[28/10/2026, 12:30] Ana: Hola')
      });
      await page.waitForTimeout(100);
    }
    const relevantes = await page.evaluate(async () => {
      const resultado = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }
      });
      return resultado.violations.filter(issue => !issue.nodes.every(node => {
        const elemento = document.querySelector(node.target.join(','));
        return elemento && elemento.closest('.hidden');
      }));
    });
    assert.deepStrictEqual(relevantes, [], `${vista}: problemas de accesibilidad detectados`);
  }

  console.log('OK: accesibilidad WCAG 2A/2AA');
  await browser.close();
})().catch(error => {
  console.error('FALLO:', error.message);
  process.exit(1);
});
