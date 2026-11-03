// shared headless harness (from SineHighway tools/lib.cjs): static server on a free port + Chrome (SwiftShader WebGL) via puppeteer-core. Used by tools/test-gearbox.cjs
const http = require('http'), fs = require('fs'), path = require('path');
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = require(process.env.PPTR || '/workspace/scratch/ptest/node_modules/puppeteer-core'); }
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
function serve() { return new Promise(res => { const s = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); });
  s.listen(0, '127.0.0.1', () => res({ server: s, url: 'http://127.0.0.1:' + s.address().port + '/' })); }); }
async function launch(opts = {}) {
  const { server, url } = await serve();
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', `--window-size=${opts.w || 844},${opts.h || 390}`] });
  const page = await browser.newPage(); await page.setViewport({ width: opts.w || 844, height: opts.h || 390 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', r => { const u = r.url(); if (!/favicon/.test(u)) errors.push('requestfailed: ' + u); });
  return { browser, page, url, errors, async close() { await browser.close(); server.close(); } };
}
async function open(h, qs) { await h.page.goto(h.url + 'index.html?' + qs, { waitUntil: 'load' }); await h.page.waitForFunction('window.__st && window.__st.veh && window.__fps > 0', { timeout: 90000 }); }
let fails = 0; function ok(c, m) { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; }
function done() { console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0); }
module.exports = { launch, open, ok, done, ROOT };
