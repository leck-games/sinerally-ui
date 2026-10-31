// SineRally UI — race-start rings, FUEL-style compass, checkpoint gate orientation. iPhone landscape 844x390, touch.
// usage: node tools/test-race.cjs [port]   Screenshots -> shots/race_ring_{near,far}.png, compass_{car,plane}.png, checkpoints_aligned.png
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = require('/workspace/scratch/ptest/node_modules/puppeteer-core'); }
const SH = require('path').join(__dirname, '..', 'shots') + '/', sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.argv[2] || process.env.PORT || 18941, URL = `http://127.0.0.1:${PORT}/?q=med&dyn=0&wx=clear&tod=0.42&craft=car`;
let fails = 0; const ok = (k, v, info) => { if (!v) fails++; console.log((v ? 'PASS ' : 'FAIL ') + k, info !== undefined ? JSON.stringify(info).slice(0, 700) : ''); };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); await p.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const errs = []; p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('PAGEERR ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  const E = (f, ...a) => p.evaluate(f, ...a);
  const until = async (fn, ms = 8000, arg) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await E(fn, arg)) return true; await sleep(150); } return false; };
  await p.goto(URL, { waitUntil: 'load' }); await E(() => localStorage.clear()); await p.reload({ waitUntil: 'load' }); await sleep(5000);
  // ---- 1. a ring + light pillar at every race start in the world (64 loop tracks; the pool covers the 3x3 track cells around the player)
  const all = await E(() => { const res = [], W = __st.W; for (let i = -4; i < 4; i++) for (let j = -4; j < 4; j++) { const t = __st.nearTrack(i * 3000 + 1500, j * 3000 + 1500), s = __st.trackPoint(t, 0);
      if (Math.abs(s[0]) > W.WORLD || Math.abs(s[1]) > W.WORLD) continue; __st.raceStarts(true, s[0] + 40, s[1] + 40); const r = __st.raceRings.rings.find(q => q.id === t.id);
      res.push({ id: t.id, ok: !!r && Math.hypot(r.x - s[0], r.z - s[1]) < 0.5 && r.visible && r.beam, n: __st.raceRings.rings.length }); }
    __st.raceStarts(true); return res; });
  ok('ring + pillar at every race start (all tracks in the world)', all.length >= 30 && all.every(r => r.ok), { tracks: all.length, bad: all.filter(r => !r.ok), pool: all[0] && all[0].n });
  const nearRings = await E(() => ({ starts: __st.starts, rings: __st.raceRings.rings, scene: !!__st.scene.getObjectByName('raceRings') }));
  ok('nearby race starts all have a ring in the scene', nearRings.scene && nearRings.starts.length >= 4 && nearRings.starts.every(s => nearRings.rings.some(r => r.id === s.id && Math.hypot(r.x - s.x, r.z - s.z) < 0.5)), { n: nearRings.starts.length });
  // ---- 2. drive into the ring -> race starts (as before: GO!), ring hides while racing
  const st = await E(() => { const t = __st.nearTrack(__st.x, __st.z), s = __st.trackPoint(t, 0), q = __st.trackPoint(t, 0.004), o = __st.trackPoint(t, -0.004), a = Math.atan2(q[0] - o[0], q[1] - o[1]);
    __st.teleport(s[0] - Math.sin(a) * 34, s[1] - Math.cos(a) * 34, a); return { id: t.id, s, a }; });
  await sleep(2500);
  const pre = await E(() => ({ race: !!__st.race, bar: document.getElementById('race').textContent }));
  await p.screenshot({ path: SH + 'race_ring_near.png' });
  ok('approaching a start: ring prompt in race bar, not racing yet', !pre.race && /RING/.test(pre.bar), pre);
  await p.keyboard.down('KeyW'); const started = await until(() => !!__st.race, 15000); await p.keyboard.up('KeyW');
  const inR = await E(id => ({ race: __st.race, msg: document.getElementById('msg').textContent, ring: __st.raceRings.rings.find(r => r.id === id) }), st.id);
  ok('driving into the ring starts the race (GO!), its ring hides while racing', started && inR.ring && !inR.ring.visible, inR);
  // ---- 3. compass: only markers inside the camera's horizontal view; flips when the camera turns around
  const far = await E(() => { const t = __st.nearTrack(__st.x, __st.z), s = __st.trackPoint(t, 0), a = 0.9; const x = s[0] - Math.sin(a) * 420, z = s[1] - Math.cos(a) * 420; __st.teleport(x, z, a); return { id: t.id, x, z, a }; });
  await sleep(3500); await p.screenshot({ path: SH + 'race_ring_far.png' });
  const view = () => E(() => { const cam = __st.camera, THREE = __st.scene.position.constructor, v = new THREE(), c = __st.compass, inView = new Set(c.inView.map(m => m.id)), bad = [];
    for (const s of __st.starts) { if (__st.race && __st.curTrack && s.id === __st.curTrack.id) continue; v.set(s.x, cam.position.y, s.z).applyMatrix4(cam.matrixWorldInverse); const ang = Math.atan2(v.x, -v.z) * 180 / Math.PI;
      const half = c.hfov / 2, exp = Math.abs(ang) < half - 1.5, no = Math.abs(ang) > half + 1.5; if ((exp && !inView.has(s.id)) || (no && inView.has(s.id))) bad.push({ id: s.id, ang: +ang.toFixed(1) }); }
    return { heading: Math.round(c.heading), hfov: Math.round(c.hfov), inView: c.inView, shown: c.shown.length, hidden: c.hidden, total: c.total, bad, off: c.off }; });
  const v1 = await view();
  ok('compass: start ahead is shown, everything follows the camera view angle', !v1.off && v1.inView.some(m => m.id === far.id && m.kind === 'race') && !v1.bad.length && v1.hidden > 0, v1);
  await E(f => __st.teleport(f.x, f.z, f.a + Math.PI), far); await sleep(3500);
  const v2 = await view();
  ok('compass: turned around -> that start is hidden (outside view), visibility matches projection', !v2.inView.some(m => m.id === far.id) && !v2.bad.length && Math.abs(((v2.heading - v1.heading + 540) % 360) - 180) > 120, v2);
  await E(f => __st.teleport(f.x, f.z, f.a + 0.6), far); await sleep(3000); const v3 = await view();
  const fade = v3.inView.find(m => m.id === far.id); ok('compass: off-centre marker sits off-centre (soft edge region works)', !v3.bad.length && (!fade || Math.abs(fade.rel) > 10), { fade, hfov: v3.hfov });
  await E(f => __st.teleport(f.x, f.z, f.a), far); await sleep(3000);
  const cb = await E(() => { const r = document.getElementById('compass').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  await p.screenshot({ path: SH + 'compass_car.png' });
  ok('compass strip on screen at the top (844x390)', cb[1] >= 0 && cb[1] < 20 && cb[2] >= 200 && cb[0] > 150 && cb[0] + cb[2] < 700, cb);
  // toggle + HUD layout editor registration
  await E(() => __st.openMenu(true)); await E(() => document.querySelector('.mtab[data-tab="hud"]').click()); await sleep(300);
  const tg = await E(() => { const row = [...document.querySelectorAll('#mHud button')].find(b => b.textContent.trim().toUpperCase() === 'OFF' && b.closest('div') && b.closest('div').parentElement.textContent.includes('COMPASS')); if (!row) return { found: false };
    row.click(); const off = getComputedStyle(document.getElementById('compass')).display === 'none' && !__st.compassOn; __st.setCompass(true); return { found: true, off, on: getComputedStyle(document.getElementById('compass')).display !== 'none' }; });
  await E(() => __st.openMenu(false));
  ok('HUD tab: COMPASS On/Off toggle works', tg.found && tg.off && tg.on, tg);
  const ue = await E(() => { __st.uied.openEd(); const h = [...document.querySelectorAll('[data-uid], .uie-handle, .uieh')].map(e => e.dataset.uid || e.textContent); const has = document.getElementById('compass').classList.contains('uie'); __st.uied.close(); return { has, h: h.filter(x => /COMPASS|compass/.test(x)).length }; });
  const edOpen = await E(() => __st.uied.open); ok('compass registered with the HUD layout editor (editor closes again)', ue.has && !edOpen, ue);
  // ---- plane: compass + pillar visible from the air
  await E(f => { __st.setCraft('plane', 'cub', 'air'); }, far); await sleep(1500);
  await E(f => { const t = __st.nearTrack(f.x, f.z), s = __st.trackPoint(t, 0); __st.airStart(s[0] - Math.sin(f.a) * 1400, s[1] - Math.cos(f.a) * 1400, f.a); __st.throttle = 0.6; }, far); await sleep(3000);
  const vp = Object.assign(await view(), { craft: await E(() => document.body.classList.contains('plane') || __st.craft === 'plane' || !!document.querySelector('#pAtt:not([hidden])')) }); await p.screenshot({ path: SH + 'compass_plane.png' });
  ok('plane: compass works, start ahead shown, projection match', vp.craft && !vp.off && vp.inView.some(m => m.id === far.id) && !vp.bad.length && vp.inView.some(m => m.kind === 'race'), vp);
  await E(() => __st.setCraft('car')); await sleep(1500);
  // ---- 4. checkpoint gates face along the track at every checkpoint of every race (analytic road tangent)
  const cpr = await E(() => { const W = __st.W, res = { n: 0, max: 0, worst: null, maxRoll: 0, offRoad: 0 };
    for (let i = -4; i < 4; i++) for (let j = -4; j < 4; j++) { const t = __st.nearTrack(i * 3000 + 1500, j * 3000 + 1500), s = __st.trackPoint(t, 0); if (Math.abs(s[0]) > W.WORLD || Math.abs(s[1]) > W.WORLD) continue;
      for (const g of __st.gateFrames(t)) { W.pathPoint(t.path, g.i / __st.NCP, false); const tx = W.PP.tx, tz = W.PP.tz, cx = W.PP.x, cz = W.PP.z;
        const lx = g.r[0] - g.l[0], lz = g.r[1] - g.l[1], L = Math.hypot(lx, lz), cos = Math.abs(lx * tx + lz * tz) / L, err = 90 - Math.acos(Math.min(1, cos)) * 180 / Math.PI;
        const mid = [(g.l[0] + g.r[0]) / 2, (g.l[1] + g.r[1]) / 2]; if (Math.hypot(mid[0] - cx, mid[1] - cz) > 1) res.offRoad++;
        res.n++; res.maxRoll = Math.max(res.maxRoll, Math.abs(g.roll) * 57.3); if (err > res.max) { res.max = err; res.worst = { id: t.id, i: g.i, err }; } } }
    res.max = +res.max.toFixed(3); res.maxRoll = +res.maxRoll.toFixed(1); return res; });
  ok('checkpoint gates perpendicular to the road tangent (all races, error < 10°)', cpr.n >= 300 && cpr.max < 10 && cpr.offRoad === 0 && cpr.maxRoll <= 10.1, cpr);
  await E(() => { const t = __st.nearTrack(__st.x, __st.z), N = __st.NCP, th = 2 / N * Math.PI * 2, s = __st.trackPoint(t, th), q = __st.trackPoint(t, th + 0.004), o = __st.trackPoint(t, th - 0.004), a = Math.atan2(q[0] - o[0], q[1] - o[1]);
    __st.teleport(s[0] - Math.sin(a) * 32, s[1] - Math.cos(a) * 32, a); }); await sleep(3000);
  await p.screenshot({ path: SH + 'checkpoints_aligned.png' });
  const live = await E(() => { const g = __st.cps; return g.length; }); ok('live gates built for the current track', live === 8, live);
  ok('no console errors', !errs.length, errs.slice(0, 5));
  await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
