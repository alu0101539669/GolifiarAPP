const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

const web = 'file://' + path.resolve(__dirname, '../www/index.html');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await (await browser.newContext({ locale: 'es-ES' })).newPage();
  await page.goto(web);

  const jsonResultado = await page.evaluate(() => GolifiarTikTok.analizar(JSON.stringify({
    username: 'maria_creativa',
    displayName: 'María',
    followerCount: 12500,
    followingCount: 340,
    likes: 54000,
    totalVideos: 92,
    favoriteCount: 830,
    comments: 460,
    categories: ['arte', 'fotografía', 'viajes'],
    topUsers: ['ana', 'luis', 'sofia']
  }), 'perfil.json'));

  assert.strictEqual(jsonResultado.perfil.username, 'maria_creativa');
  assert.strictEqual(jsonResultado.seguidores, 12500);
  assert.strictEqual(jsonResultado.seguidos, 340);
  assert.strictEqual(jsonResultado.likes, 54000);
  assert.strictEqual(jsonResultado.videos, 92);
  assert.strictEqual(jsonResultado.favoritos, 830);
  assert.strictEqual(jsonResultado.comentarios, 460);
  assert.ok(jsonResultado.categorias.includes('arte'));
  assert.ok(jsonResultado.topUsuarios.includes('ana'));

  const textoResultado = await page.evaluate(() => GolifiarTikTok.analizar(
    'Followers: 12.5k\nFollowing: 540\nLikes: 20K\nVideos: 74\nFavoritos: 902\nComentarios: 130\nCategoría: arte',
    'resumen.txt'
  ));
  assert.strictEqual(textoResultado.seguidores, 12500);
  assert.strictEqual(textoResultado.seguidos, 540);
  assert.strictEqual(textoResultado.likes, 20000);
  assert.strictEqual(textoResultado.videos, 74);
  assert.strictEqual(textoResultado.favoritos, 902);
  assert.strictEqual(textoResultado.comentarios, 130);
  assert.ok(textoResultado.categorias.includes('arte'));

  const vacio = await page.evaluate(() => GolifiarTikTok.analizar('   ', 'vacio.txt'));
  assert.strictEqual(vacio.advertencias.length, 1);

  await page.setInputFiles('#tiktokFile', {
    name: 'perfil.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ username: 'maria_creativa', followerCount: 12500, followingCount: 340, videos: 92, totalLikes: 54000 }))
  });
  await page.evaluate(() => I18n.fijar('en'));
  const textoPagina = await page.locator('#tiktokResults').innerText();
  assert.ok(/Followers|Videos|Profile|Topics and categories|Most relevant users/.test(textoPagina));
  await page.evaluate(() => I18n.fijar('es'));

  await browser.close();
  console.log('OK: TikTok');
})().catch(error => {
  console.error('FALLO:', error.message);
  process.exit(1);
});
