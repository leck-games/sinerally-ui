// SineRally UI — redesign + engine editor e2e. iPhone 12 landscape 844x390, touch. usage: node tools/test-redesign.cjs [port]
// Checks: no HUD overlap (car + plane), menu tabs reachable/scrollable, every Engine Sim demo parameter is in the editor and
// changes getConfig(), live preview while driving, per-vehicle persistence (car + plane), layout v1->v2 migration, no console errors.
// Screenshots -> shots/redesign_after_*.png, redesign_menu_*.png, engine_editor_*.png
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = require('/workspace/scratch/ptest/node_modules/puppeteer-core'); }
const SH = require('path').join(__dirname, '..', 'shots') + '/', sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.argv[2] || process.env.PORT || 18941, URL = `http://127.0.0.1:${PORT}/?q=low&dyn=0&wx=clear&tod=0.4`;
let fails = 0; const ok = (k, v, info) => { if (!v) fails++; console.log((v ? 'PASS ' : 'FAIL ') + k, info !== undefined ? JSON.stringify(info).slice(0, 600) : ''); };
const HUD = ['spdgrp', 'compass', 'race', 'mini', 'cans', 'wp', 'corner', 'dbg', 'gauge', 'joy', 'bBst', 'bDrf', 'bGas', 'bBrk', 'bUnl', 'pAtt', 'pThr', 'pRud'];
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); await p.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const errs = []; p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('PAGEERR ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  const E = (f, ...a) => p.evaluate(f, ...a);
  const tap = async sel => { const r = await E(s => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel); if (!r) throw new Error('no ' + sel); await p.touchscreen.tap(r[0], r[1]); await sleep(250); };
  const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await E(fn)) return true; await sleep(150); } return false; };
  // v1 layout from an older build: must migrate (topbtns/tUi dropped, joy kept)
  await p.goto(URL, { waitUntil: 'load' }); await E(() => { localStorage.clear(); localStorage.setItem('srui_layout', JSON.stringify({ v: 1, g: { o: 1, s: 1 }, snap: true, flip: false, el: { topbtns: { o: 0.5 }, tUi: { o: 0.4 }, tSnd: { h: 1 }, joy: { s: 1.2 } } })); });
  await p.reload({ waitUntil: 'load' }); await sleep(4500);
  const lay = await E(() => __st.uied.layout); ok('layout v1 -> v2 migration (old top-bar ids dropped, joy kept)', lay.v === 2 && !lay.el.topbtns && !lay.el.tUi && lay.el.joy && lay.el.joy.s === 1.2, lay);
  await E(() => { __st.uied.reset(); }); await sleep(300);
  // ---- overlap audit
  const audit = () => E(H => { const vis = id => { const e = document.getElementById(id); if (!e) return null; const cs = getComputedStyle(e), r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 2 && r.height > 2 ? r : null; };
    const R = H.map(id => [id, vis(id)]).filter(x => x[1]), bad = [], out = [];
    for (let i = 0; i < R.length; i++) { const [a, r] = R[i]; if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.push(a);
      for (let j = i + 1; j < R.length; j++) { const [c, q] = R[j]; const ox = Math.min(r.right, q.right) - Math.max(r.left, q.left), oy = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top); if (ox > 1 && oy > 1) bad.push(a + '×' + c + ' ' + Math.round(ox) + 'x' + Math.round(oy)); } }
    return { shown: R.map(x => x[0]), bad, out }; }, HUD);
  // force every context element on (race bar + fuel cans + debug) to audit the worst case
  const worst = () => E(() => { document.body.classList.add('racing', 'hascans'); const d = document.getElementById('dbg'); if (!d.textContent) d.textContent = '60 fps · debug'; const c = document.getElementById('cans'); if (!c.textContent) c.textContent = '⛽ 2'; const r = document.getElementById('race'); if (!r.textContent) r.textContent = 'LAP 1/3 · 0:12.3 · CP 2/7'; });
  await p.screenshot({ path: SH + 'redesign_after_car.png' });
  let a = await audit(); ok('car HUD: no overlaps, all on screen', !a.bad.length && !a.out.length, a);
  await worst(); a = await audit(); ok('car HUD worst case (race+fuel+fps): no overlaps', !a.bad.length && !a.out.length, a);
  await E(() => __st.setCraft('plane', 'cub')); await sleep(2500); await p.screenshot({ path: SH + 'redesign_after_plane.png' });
  a = await audit(); ok('plane HUD: no overlaps, all on screen', !a.bad.length && !a.out.length && a.shown.includes('pAtt') && a.shown.includes('pRud'), a);
  await worst(); a = await audit(); ok('plane HUD worst case: no overlaps', !a.bad.length && !a.out.length && !a.shown.includes('race'), a);
  await E(() => __st.setCraft('car')); await sleep(1500); await E(() => document.body.classList.remove('hascans'));
  // ---- quick tray
  await tap('#tQuick'); const tr = await E(() => { const t = document.getElementById('qtray'), r = t.getBoundingClientRect(); return { on: t.classList.contains('on'), in: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, n: t.querySelectorAll('.sb').length, small: [...t.querySelectorAll('.sb')].filter(b => b.getBoundingClientRect().height < 40).length }; });
  await p.screenshot({ path: SH + 'redesign_after_tray.png' });
  ok('⚙ quick tray opens on screen, 8 big buttons', tr.on && tr.in && tr.n === 8 && !tr.small, tr);
  const q0 = await E(() => document.getElementById('tQ').textContent); await tap('#tQ'); const q1 = await E(() => document.getElementById('tQ').textContent);
  ok('tray button works (GFX cycles) and tray stays open', q0 !== q1 && await E(() => document.getElementById('qtray').classList.contains('on')), [q0, q1]);
  await p.touchscreen.tap(420, 200); await sleep(250); ok('tap outside closes the tray', !(await E(() => document.getElementById('qtray').classList.contains('on'))));
  // ---- tabbed menu
  await tap('#tMenu'); ok('☰ opens tabbed menu', await E(() => getComputedStyle(document.getElementById('menu')).display === 'grid'));
  for (const t of ['drive', 'vehicle', 'sound', 'gfx', 'hud', 'world']) {
    await tap(`.mtab[data-tab="${t}"]`); await sleep(300);
    const r = await E(t => { const tab = document.querySelector(`.mtab[data-tab="${t}"]`), tr = tab.getBoundingClientRect(), pane = document.querySelector('.mpane.on'), P = document.getElementById('mPanes');
      const items = [...pane.querySelectorAll('button,select,input')].filter(e => e.offsetParent); P.scrollTop = P.scrollHeight; const last = items[items.length - 1], lr = last && last.getBoundingClientRect(), pr = P.getBoundingClientRect();
      const tiny = items.filter(e => e.tagName === 'BUTTON' && e.getBoundingClientRect().height < 30).map(e => e.id || e.textContent.trim().slice(0, 12));
      return { tab: tab.classList.contains('on'), tabH: Math.round(tr.height), tabIn: tr.bottom <= innerHeight && tr.top >= 0, pane: pane.dataset.pane || pane.id, n: items.length, lastIn: !last || (lr.bottom <= pr.bottom + 1 && lr.top >= pr.top - 1), tiny }; }, t);
    await E(() => { document.getElementById('mPanes').scrollTop = 0; }); await p.screenshot({ path: SH + `redesign_menu_${t}.png` });
    ok(`menu tab ${t}: reachable, ≥40px, has controls, scrolls to last control, no tiny buttons`, r.tab && r.tabH >= 40 && r.tabIn && r.n > 0 && r.lastIn && !r.tiny.length, r);
  }
  await tap('.mtab[data-tab="hud"]'); ok('EDIT HUD LAYOUT lives in the CONTROLS/HUD tab', await E(() => !!document.getElementById('mEditUi') && !!document.getElementById('mEditUi').offsetParent));
  await tap('#mnClose'); ok('close button closes the menu', await E(() => getComputedStyle(document.getElementById('menu')).display === 'none'));
  // ---- engine editor (audio needs a trusted gesture)
  await p.mouse.click(420, 120); await until(() => __st.audio.active === 'enginesim', 10000); await sleep(1000);
  ok('Engine Sim plugin active', await E(() => __st.audio.active === 'enginesim'));
  await tap('#tMenu'); await tap('.mtab[data-tab="sound"]'); await sleep(300); await tap('#sndEdit'); await sleep(800);
  const ed = await E(() => ({ open: __st.editor.open, bench: __st.editor.benching, menu: getComputedStyle(document.getElementById('menu')).display, viz: __st.editor.hasViz }));
  ok('🎛 OPEN ENGINE EDITOR opens the editor in bench mode (menu closed)', ed.open && ed.bench && ed.menu === 'none', ed);
  await sleep(600); ok('engine diagram (demo viz.js) loaded', await E(() => __st.editor.hasViz));
  await E(() => document.querySelectorAll('#sndEd details').forEach(d => d.open = true)); await sleep(200);
  await p.screenshot({ path: SH + 'engine_editor_bench.png' });
  const G = () => E(() => JSON.stringify(__st.audio.instance.getConfig()));
  // demo parameter list (engine-sim/index.html) -> editor control
  const DEMO = ['preset', 'layout', 'cylinders', 'bankAngle', 'crank', 'stroke', 'firingOrder', 'c.vol', 'c.tone', 'c.shape', 'c.runner', 'c.misfire', 'c.rough', 'c.fire', 'c.angle', 'c.pos',
    'displacement', 'idleRpm', 'redline', 'limiter', 'inertia', 'induction', 'pops', 'master', 'exhaustVol', 'mufflerTone', 'runnerReso', 'exhaust', 'crossover', 'intakeVol', 'mechVol', 'inductionVol', 'visualOffset', 'car.mass', 'car.final'];
  const missing = [], nochange = [];
  const change = k => E(k => { const P = document.getElementById('sndEd'); P.querySelectorAll('details').forEach(d => d.open = true);
    if (k === 'preset') { const s = P.querySelector('[data-preset]'); if (!s) return 'missing'; const o = [...s.options].find(o => o.value && o.value !== s.value && o.value !== 'flatV8'); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; }
    if (k === 'firingOrder') { const t = P.querySelector('[data-fo]'); if (!t) return 'missing'; const n = __st.audio.instance.getConfig().cyl.length; t.value = Array.from({ length: n }, (_, i) => n - i).join('-'); t.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; }
    const segs = [...P.querySelectorAll(`[data-seg="${k}"]`)]; if (segs.length) { const b = segs.find(b => !b.classList.contains('sel')); if (!b) return 'nosel'; b.click(); return 'ok'; }
    const e = P.querySelector(`[data-k="${k}"]`); if (!e) return 'missing';
    if (e.tagName === 'SELECT') { const o = [...e.options].find(o => o.value !== e.value && !o.disabled); if (!o) return 'nosel'; e.value = o.value; }
    else { const mn = +e.min, mx = +e.max, st = +e.step || 1, v = +e.value; e.value = String(v + st * 3 <= mx ? v + st * 3 : v - st * 3); }
    e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; }, k);
  for (const k of DEMO) {
    if (k === 'bankAngle') await E(() => __st.audio.instance.setConfig({ layout: 'v', cylinders: 8 })) , await E(() => __st.editor.rerender && __st.editor.rerender());
    if (k === 'c.angle') { await E(() => __st.audio.instance.setConfig({ layout: 'custom' })); await E(() => __st.editor.rerender && __st.editor.rerender()); }
    await sleep(120);
    const before = k === 'visualOffset' ? await E(() => __st.audio.instance.engine.visualOffset) : await G();
    const r = await change(k); await sleep(250);
    const after = k === 'visualOffset' ? await E(() => __st.audio.instance.engine.visualOffset) : await G();
    if (r === 'missing') missing.push(k); else if (before === after) nochange.push(k + '(' + r + ')');
  }
  ok(`every Engine Sim demo parameter present in the editor (${DEMO.length})`, !missing.length, { missing });
  ok('every parameter changes getConfig()/engine', !nochange.length, { nochange });
  const acts = {};
  for (const a of ['deforder', 'recompute', 'nomis', 'cylall']) acts[a] = await E(a => !!document.querySelector(`#sndEd [data-act="${a}"]`), a);
  ok('demo actions present (default order, recompute angles, clear misfires, apply to all)', Object.values(acts).every(Boolean), acts);
  await E(() => __st.audio.instance.setConfig({ cyl: __st.audio.instance.getConfig().cyl.map((c, i) => ({ ...c, misfire: 0.2 })) })); await E(() => __st.editor.rerender());
  await E(() => document.querySelector('#sndEd [data-act="nomis"]').click()); await sleep(200);
  ok('Clear misfires zeroes every cylinder', await E(() => __st.audio.instance.getConfig().cyl.every(c => !c.misfire)));
  await E(() => document.querySelector('#sndEd [data-act="export"]').click()); await sleep(200);
  const ex = await E(() => { try { const j = JSON.parse(document.querySelector('#sndEd textarea').value); return { raw: !!(j.cyl && j.layout), n: j.cyl.length }; } catch (e) { return { err: e.message }; } });
  ok('Export gives raw demo-compatible config JSON', ex.raw, ex);
  await E(() => { window.__dl = 0; const o = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) window.__dl = this.download; else o.call(this); }; });
  await E(() => document.querySelector('#sndEd [data-act="wav"]').click()); await until(() => __st.editor.lastWav > 0, 15000);
  ok('Render 6 s WAV produces a file', await E(() => __st.editor.lastWav > 100000 && /\.wav$/.test(window.__dl)), await E(() => [__st.editor.lastWav, window.__dl]));
  // ---- live preview while driving
  await E(() => document.querySelector('#sndEd [data-seg="preview"][data-val="live"]').click()); await sleep(300);
  const lv = await E(() => ({ live: __st.editor.live, bench: __st.editor.benching, test: __st.audio.test ? __st.audio.test.on : null }));
  const x0 = await E(() => [__st.x, __st.z]); await p.keyboard.down('ArrowUp'); await sleep(1500); await p.keyboard.up('ArrowUp'); const x1 = await E(() => [__st.x, __st.z]);
  const dist = Math.hypot(x1[0] - x0[0], x1[1] - x0[1]);
  await p.screenshot({ path: SH + 'engine_editor_live.png' });
  const lo = await E(() => { const r = document.getElementById('sndEd').getBoundingClientRect(); return ['joy', 'bGas', 'bBrk', 'bBst', 'bDrf', 'gauge'].filter(id => { const q = document.getElementById(id).getBoundingClientRect(); return q.width && Math.min(r.right, q.right) - Math.max(r.left, q.left) > 1 && Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top) > 1; }); });
  ok('LIVE editor panel leaves the touch controls + gauge uncovered', !lo.length, lo);
  ok('LIVE preview: car drives with the editor open, engine follows the car', lv.live && !lv.bench && lv.test !== true && dist > 1, { ...lv, dist });
  const m0 = await E(() => __st.audio.instance.getConfig().master); await E(() => { const e = document.querySelector('#sndEd [data-k="master"]'); e.value = '0.7'; e.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(150);
  ok('slider change applies live while driving', await E(() => Math.abs(__st.audio.instance.getConfig().master - 0.7) < 1e-6), m0);
  await E(() => document.querySelector('#sndEd [data-act="mini"]').click()); await sleep(400);
  const mi = await E(() => { const r = document.getElementById('sndEd').getBoundingClientRect(); return { mini: __st.editor.mini, h: Math.round(r.height), w: Math.round(r.width), top: Math.round(r.top) }; });
  await p.screenshot({ path: SH + 'engine_editor_mini.png' });
  ok('mini strip: compact (≤40px tall) while driving', mi.mini && mi.h <= 40, mi);
  await E(() => document.querySelector('#sndEd [data-act="mini"]').click()); await sleep(300);
  // ---- persistence (car)
  await E(() => document.querySelector('#sndEd [data-act="close"]').click()); await sleep(300);
  const saved = await E(() => { const c = __st.audio.instance.getConfig(); return { master: c.master, layout: c.layout, n: c.cyl.length, veh: __st.veh && (__st.veh.id || __st.veh.type) }; });
  const store = await E(() => JSON.parse(localStorage.getItem('sinerally_sndcfg1') || '{}'));
  ok('per-vehicle config saved to localStorage (incl. light-sync offset)', store.v && store.v.enginesim && Object.keys(store.v.enginesim).length >= 1 && store.vo && 'enginesim' in store.vo, { keys: store.v && store.v.enginesim && Object.keys(store.v.enginesim), vo: store.vo });
  await p.reload({ waitUntil: 'load' }); await sleep(4000); await p.mouse.click(420, 120); await until(() => __st.audio.active === 'enginesim', 10000); await sleep(800);
  const re = await E(() => { const c = __st.audio.instance.getConfig(); return { master: c.master, layout: c.layout, n: c.cyl.length, vo: __st.audio.instance.engine.visualOffset }; });
  ok('car config restored after reload', Math.abs(re.master - saved.master) < 1e-6 && re.layout === saved.layout && re.n === saved.n, { saved, re });
  // ---- persistence (plane)
  await E(() => __st.setCraft('plane', 'cub')); await sleep(2000);
  await tap('#tMenu'); await tap('.mtab[data-tab="sound"]'); await sleep(300); await tap('#sndEdit'); await sleep(800);
  await E(() => document.querySelectorAll('#sndEd details').forEach(d => d.open = true)); await sleep(200);
  await p.screenshot({ path: SH + 'engine_editor_plane.png' });
  await E(() => { const e = document.querySelector('#sndEd [data-k="displacement"]'); e.value = '3.3'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(200);
  await E(() => document.querySelector('#sndEd [data-act="close"]').click()); await sleep(300);
  const pc = await E(() => __st.audio.instance.getConfig().displacement);
  if (process.env.DBG) console.log('DBG', await E(() => [__st.audio.telemetry.vehicle, Object.keys(JSON.parse(localStorage.getItem('sinerally_sndcfg1')).v.enginesim)]));
  await p.reload({ waitUntil: 'load' }); await sleep(4000); await p.mouse.click(420, 120); await until(() => __st.audio.active === 'enginesim', 10000);
  await E(() => __st.setCraft('plane', 'cub')); await sleep(2000);
  if (process.env.DBG) console.log('DBG2', await E(() => [__st.audio.telemetry.vehicle, __st.audio.instance.preset, Object.keys(JSON.parse(localStorage.getItem('sinerally_sndcfg1')).v.enginesim)]));
  const pd = await E(() => __st.audio.instance.getConfig().displacement);
  await E(() => __st.setCraft('car')); await sleep(1500); const cd = await E(() => __st.audio.instance.getConfig().displacement);
  ok('plane config persists per vehicle (and does not leak into the car)', Math.abs(pd - 3.3) < 1e-6 && Math.abs(pc - 3.3) < 1e-6 && Math.abs(cd - 3.3) > 1e-6, { pc, pd, cd });
  const errs2 = errs.filter(e => !/favicon|AudioContext was not allowed/.test(e));
  ok('no console errors', !errs2.length, errs2);
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
