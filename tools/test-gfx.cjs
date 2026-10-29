// SineRally UI — graphics levels e2e: LOW / MED / HIGH / ULTRA. Headless Chrome 844x390 @ dpr 3 (iPhone 12 landscape) with touch.
// Serve the repo: python3 -m http.server 18941 --bind 127.0.0.1 ; then node tools/test-gfx.cjs  (screenshots -> shots/gfx_*.png)
// For every level (loaded fresh with ?q=<level>&dyn=0): pixel ratio, HD road texture level, terrain detail, grass count, vehicle shadow, draw distance,
// plus fps + triangles/draw calls on a fixed highway spot (car) and in the air (plane). NOTE: headless = software GL (SwiftShader, CPU) —
// fps numbers are only relative between levels, a real iPhone 12 GPU is several times faster.
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = require('/workspace/scratch/ptest/node_modules/puppeteer-core'); }
const SH = require('path').join(__dirname, '..', 'shots') + '/'; const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PORT || 18941, BASE = `http://127.0.0.1:${PORT}/`;
const res = {}; const ok = (k, v, info) => { res[k] = { pass: !!v, info }; console.log((v ? 'PASS ' : 'FAIL ') + k, info !== undefined ? JSON.stringify(info) : ''); };
const LEVELS = ['Low', 'Med', 'High', 'Ultra'];
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = []; const perf = {};
  const page = async (url, dpr = 3) => { const p = await b.newPage(); await p.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: dpr });
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); await p.goto(url, { waitUntil: 'load' }); return p; };
  const fpsOf = p => p.evaluate(() => new Promise(r => { let n = 0, tris = 0, calls = 0; const t0 = performance.now(); const f = () => { n++; const ri = __st.rinfo; tris += ri.tris; calls += ri.calls; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else r({ fps: +(n / ((performance.now() - t0) / 1000)).toFixed(1), tris: Math.round(tris / n), calls: Math.round(calls / n) }); }; requestAnimationFrame(f); }));
  const toRoad = p => p.evaluate(() => { const W = __st.W, es = W.pathsNear(0, 0, 4000).filter(e => e.type === W.HWY && !e.loop).sort((a, b) => (a.id + '').localeCompare(b.id + ''));
    for (const e of es) for (const t of [0.5, 0.4, 0.6, 0.3, 0.7]) { const P = W.pathPoint(e, t); if (P.bridge || P.y < 3) continue; __st.teleport(P.x, P.z, Math.atan2(P.tx, P.tz)); return { id: e.id, t }; } return null; });
  const p0 = await page(BASE + '?dyn=0'); await p0.evaluate(() => localStorage.clear()); await p0.close();
  const info = {};
  for (const L of LEVELS) {
    const p = await page(BASE + `?q=${L.toLowerCase()}&dyn=0&wx=clear&tod=0.4&craft=car`); await sleep(5000);
    const at = await toRoad(p); await sleep(4000);
    const ri = await p.evaluate(() => __st.rinfo), q = await p.evaluate(() => ({ name: __st.q, Q: __st.QUAL[__st.q], label: document.getElementById('tQ').textContent }));
    info[L] = { ...ri, label: q.label };
    const fr = await fpsOf(p); perf[L] = { car: fr };
    await p.screenshot({ path: SH + `gfx_road_${L.toLowerCase()}.png` });
    await p.screenshot({ path: SH + `gfx_roadzoom_${L.toLowerCase()}.png`, clip: { x: 222, y: 250, width: 400, height: 140 } });
    await p.evaluate(() => { __st.setCraft('plane', 'cub', 'air'); __st.planeCtl = { pitch: 0, roll: 0, thr: 0.7 }; }); await sleep(3500);
    perf[L].air = await fpsOf(p); perf[L].air.far = Math.round(await p.evaluate(() => __st.camera.far));
    if (L === 'Low' || L === 'Ultra') await p.screenshot({ path: SH + `gfx_air_${L.toLowerCase()}.png` });
    await p.evaluate(() => __st.setCraft('car')); await p.close();
    console.log(L, JSON.stringify({ at, ...info[L] }), JSON.stringify(perf[L]));
  }
  const I = info;
  ok('quality label + level applied at load (?q=)', LEVELS.every(L => I[L].label === 'GFX: ' + L), LEVELS.map(L => I[L].label));
  ok('pixel ratio rises with level (dpr 3: 1 / 1.5 / 2 / 3)', I.Low.pr === 1 && I.Med.pr === 1.5 && I.High.pr === 2 && I.Ultra.pr === 3, LEVELS.map(L => I[L].pr));
  ok('HD road textures: off at LOW/MED, level 1 at HIGH, level 2 at ULTRA', I.Low.road.level === 0 && I.Med.road.level === 0 && I.High.road.level === 1 && I.Ultra.road.level === 2, LEVELS.map(L => I[L].road));
  ok('terrain micro-detail only at HIGH/ULTRA', I.Low.det === 0 && I.Med.det === 0 && I.High.det > 0 && I.Ultra.det >= I.High.det, LEVELS.map(L => I[L].det));
  ok('grass density rises', I.Low.grass < I.Med.grass && I.Med.grass < I.High.grass && I.High.grass <= I.Ultra.grass, LEVELS.map(L => I[L].grass));
  ok('projected vehicle shadows at HIGH (512) / ULTRA (1024)', I.Low.sh === 0 && I.Med.sh === 0 && I.High.sh === 512 && I.Ultra.sh === 1024, LEVELS.map(L => I[L].sh));
  ok('draw distance (camera far) larger at HIGH/ULTRA', I.High.far > I.Med.far && I.Ultra.far > I.High.far, LEVELS.map(L => Math.round(I[L].far)));
  ok('triangles rise with level (more terrain / grass)', perf.Ultra.car.tris > perf.Med.car.tris && perf.High.car.tris > perf.Low.car.tris, LEVELS.map(L => perf[L].car.tris));
  const p = await page(BASE + '?dyn=0', 1); await sleep(4000);
  const cyc = []; for (let i = 0; i < 4 && (await p.evaluate(() => __st.q)) !== 'Ultra'; i++) { await p.tap('#tQ'); await sleep(300); cyc.push(await p.evaluate(() => __st.q)); }
  const saved = await p.evaluate(() => localStorage.getItem('sinerally_q3')); await p.reload({ waitUntil: 'load' }); await sleep(4000);
  const after = await p.evaluate(() => ({ q: __st.q, road: __st.rinfo.road, label: document.getElementById('tQ').textContent }));
  ok('GFX choice persists in localStorage across reload', saved === 'Ultra' && after.q === 'Ultra' && after.road.level === 2, { cyc, saved, after });
  await p.evaluate(() => __st.setQ('Low')); await sleep(500); const low = await p.evaluate(() => __st.rinfo);
  ok('runtime switch ULTRA → LOW applies (road HD off, no shadows)', low.road.level === 0 && low.sh === 0 && low.det === 0, low); await p.close();
  const bad = errs.filter(e => !/favicon|AudioContext|autoplay/i.test(e)); ok('no console errors', bad.length === 0, bad.slice(0, 5));
  console.log('\nPERF (SwiftShader software GL, 844x390 @dpr3):'); for (const L of LEVELS) console.log(`  ${L.padEnd(5)} car ${perf[L].car.fps} fps ${perf[L].car.tris} tris ${perf[L].car.calls} calls | air ${perf[L].air.fps} fps ${perf[L].air.tris} tris far ${perf[L].air.far}`);
  require('fs').writeFileSync(SH + 'gfx_perf.json', JSON.stringify({ perf, info }, null, 1));
  await b.close(); const fails = Object.entries(res).filter(([, v]) => !v.pass).map(([k]) => k);
  console.log(`\n${Object.keys(res).length - fails.length}/${Object.keys(res).length} passed` + (fails.length ? ' — FAILED: ' + fails.join(', ') : '')); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
