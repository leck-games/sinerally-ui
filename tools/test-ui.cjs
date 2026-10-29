// SineRally UI — layout editor e2e. Headless Chrome, iPhone 12 landscape 844x390 with touch (synthetic CDP touch events).
// Serve the repo: python3 -m http.server 18941 --bind 127.0.0.1 ; then node tools/test-ui.cjs  (screenshots -> shots/ui_*.png)
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = require('/workspace/scratch/ptest/node_modules/puppeteer-core'); }
const SH = require('path').join(__dirname, '..', 'shots') + '/'; const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PORT || 18941, URL = `http://127.0.0.1:${PORT}/?q=med&dyn=0`;
const res = {}; const ok = (k, v, info) => { res[k] = { pass: !!v, info }; console.log((v ? 'PASS ' : 'FAIL ') + k, info !== undefined ? JSON.stringify(info) : ''); };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); await p.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const errs = []; p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  const cdp = await p.createCDPSession();
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i, radiusX: 2, radiusY: 2, force: 1 })) });
  const E = (f, ...a) => p.evaluate(f, ...a);
  const rect = id => E(id => { const r = document.getElementById(id).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; }, id);
  const hrect = id => E(id => { const h = document.querySelector(`.uih[data-id="${id}"]`); if (!h) return null; const r = h.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; }, id);
  async function drag(id, dx, dy, steps = 8) { const h = await hrect(id); await T('touchStart', [[h.cx, h.cy]]); for (let i = 1; i <= steps; i++) { await T('touchMove', [[h.cx + dx * i / steps, h.cy + dy * i / steps]]); await sleep(16); } await T('touchEnd', []); await sleep(120); }
  const tapAt = async (x, y) => { await T('touchStart', [[x, y]]); await sleep(30); await T('touchEnd', []); await sleep(150); };
  const tapSel = async sel => { const r = await E(s => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel); await tapAt(r[0], r[1]); };
  const pos = () => E(() => [__st.x, __st.z]);
  const moved = async ms => { const a = await pos(); await p.keyboard.down('ArrowUp'); await sleep(ms); await p.keyboard.up('ArrowUp'); const c = await pos(); return Math.hypot(c[0] - a[0], c[1] - a[1]); };
  await p.goto(URL, { waitUntil: 'load' }); await E(() => localStorage.clear()); await p.reload({ waitUntil: 'load' }); await sleep(4500);
  const title = await p.title(); const man = await E(() => fetch('manifest.webmanifest').then(r => r.json()));
  ok('title + manifest', title === 'Sine Rally UI' && man.name === 'Sine Rally UI' && /sinerally-ui/.test(man.start_url), { title, name: man.name, start_url: man.start_url });
  const def = {}; for (const id of ['joy', 'bGas', 'bBst', 'bDrf', 'bBrk', 'mini', 'spdgrp', 'topbtns', 'gauge', 'tUi', 'tHand']) def[id] = await rect(id);
  let mv0 = await moved(1500); if (mv0 <= 1) { await sleep(3000); mv0 = await moved(1500); } ok('gameplay runs before edit', mv0 > 1, mv0); // retry once: cold swiftshader start can be slow
  // ---- open via ☰ → EDIT UI (touch taps)
  await tapSel('#tMenu'); await sleep(400); const hasRow = await E(() => !!document.getElementById('mEditUi'));
  await tapSel('#mEditUi'); await sleep(400);
  const st = await E(() => ({ open: __st.uied.open, menu: document.getElementById('menu').style.display, handles: document.querySelectorAll('.uih').length, paused: __st.TEL.paused }));
  ok('☰ EDIT UI opens editor (menu closed, handles)', hasRow && st.open && st.menu === 'none' && st.handles >= 20, st);
  ok('game paused in edit mode', (await moved(1000)) < 0.01);
  await p.screenshot({ path: SH + 'ui_edit_handles.png' });
  // ---- drag joystick by touch: +240,-40 -> snapped to the 8 px grid
  await drag('joy', 240, -40); const j1 = await rect('joy'); const L1 = await E(() => __st.uied.layout);
  ok('touch drag moves joystick (+grid snap)', Math.abs(j1.cx - def.joy.cx - 240) <= 8 && Math.abs(j1.cy - def.joy.cy + 40) <= 8 && Math.abs(j1.l % 8) < 0.6 || Math.abs(j1.l % 8 - 8) < 0.6, { before: def.joy, after: j1, entry: L1.el.joy });
  // edge snap: drag GAS towards the right edge (within 10 px) -> flush to the safe edge
  await drag('bGas', (844 - def.bGas.r) - 6, 0); const g1 = await rect('bGas'); ok('snap to safe-area edge', Math.abs(g1.r - 844) < 0.6, g1);
  // ---- pinch on GAS (select by tap, two-finger spread 60 -> 120 px) => scale ~2
  const gh = await hrect('bGas'); await tapAt(gh.cx, gh.cy); const w0 = (await rect('bGas')).w;
  await T('touchStart', [[gh.cx - 10, gh.cy]]); await T('touchStart', [[gh.cx - 10, gh.cy], [gh.cx - 70, gh.cy]]);
  for (let i = 1; i <= 6; i++) { await T('touchMove', [[gh.cx - 10, gh.cy], [gh.cx - 70 - 60 * i / 6, gh.cy]]); await sleep(16); } await T('touchEnd', []); await sleep(150);
  const g2 = await rect('bGas'), gs = (await E(() => __st.uied.layout)).el.bGas.s;
  ok('pinch resizes (scale ~2.0)', Math.abs(gs - 2) < 0.06 && Math.abs(g2.w / w0 - 2) < 0.1, { s: gs, w0, w: g2.w });
  await tapSel('#uiedP [data-a="minus"]'); await tapSel('#uiedP [data-a="minus"]');
  ok('- button', Math.abs((await E(() => __st.uied.layout)).el.bGas.s - 1.8) < 0.01, (await E(() => __st.uied.layout)).el.bGas.s);
  for (let i = 0; i < 10; i++) await tapSel('#uiedP [data-a="plus"]');
  ok('+ button clamps at 2.5', (await E(() => __st.uied.layout)).el.bGas.s === 2.5);
  for (let i = 0; i < 9; i++) await tapSel('#uiedP [data-a="minus"]');
  // ---- per-element opacity + hide (ARC/NRM), global opacity/scale
  await E(() => { const s = document.querySelector('#uiedP [data-o]'); s.value = 0.5; s.dispatchEvent(new Event('input', { bubbles: true })); });
  ok('per-element opacity', (await E(() => getComputedStyle(document.getElementById('bGas')).opacity)) === '0.5');
  await tapSel('#uiedP .ue-chip[data-sel="tHand"]'); await tapSel('#uiedP [data-a="hide"]');
  const hid = await E(() => ({ e: __st.uied.layout.el.tHand, editVis: getComputedStyle(document.getElementById('tHand')).display }));
  await tapSel('#uiedP .ue-chip[data-sel="tUi"]'); const essNoHide = await E(() => !document.querySelector('#uiedP [data-a="hide"]'));
  ok('hide toggle (ghosted while editing) + UI MODE not hideable', hid.e.h === 1 && hid.editVis !== 'none' && essNoHide, hid);
  await E(() => { const s = document.querySelector('#uiedP [data-g="o"]'); s.value = 0.8; s.dispatchEvent(new Event('input', { bubbles: true })); const t = document.querySelector('#uiedP [data-g="s"]'); t.value = 1.1; t.dispatchEvent(new Event('input', { bubbles: true })); });
  const gl = await E(() => ({ g: __st.uied.layout.g, op: getComputedStyle(document.getElementById('mini')).opacity, sc: getComputedStyle(document.getElementById('mini')).scale }));
  ok('global opacity + scale', gl.g.o === 0.8 && gl.g.s === 1.1 && Math.abs(gl.op - 0.8) < 0.01 && gl.sc === '1.1', gl);
  await E(() => { const t = document.querySelector('#uiedP [data-g="s"]'); t.value = 1; t.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.screenshot({ path: SH + 'ui_edit_custom.png' });
  // ---- Done -> game resumes with the custom layout
  await tapSel('#uiedP [data-a="done"]'); await sleep(300);
  const play = await E(() => ({ open: __st.uied.open, tHand: getComputedStyle(document.getElementById('tHand')).display, handles: getComputedStyle(document.getElementById('uiedL')).display }));
  ok('DONE closes, hidden element hidden in play', !play.open && play.tHand === 'none' && play.handles === 'none', play);
  ok('gameplay resumes after edit', (await moved(1500)) > 1);
  // joystick works at its new place (synthetic touch at knob centre + 40 px right -> steer right)
  const jr = await rect('joy'); await T('touchStart', [[jr.cx, jr.cy]]); await T('touchMove', [[jr.cx + 45, jr.cy]]); await sleep(200);
  const steer = await E(() => ({ inp: __st.inp.steer })); await T('touchEnd', []);
  ok('joystick steers at its new position', Math.abs(steer.inp) > 0.2, steer);
  await sleep(1500); await p.screenshot({ path: SH + 'ui_custom_play.png' });
  // ---- persistence after reload
  const before = await E(() => __st.uied.exportJson());
  await p.reload({ waitUntil: 'load' }); await sleep(4000);
  const after = await E(() => __st.uied.exportJson()), j2 = await rect('joy'), th = await E(() => getComputedStyle(document.getElementById('tHand')).display);
  ok('layout persists after reload', before === after && Math.abs(j2.cx - j1.cx) < 1 && Math.abs(j2.cy - j1.cy) < 1 && th === 'none', { j1: [j1.cx, j1.cy], j2: [j2.cx, j2.cy], th });
  ok('stored versioned', await E(() => JSON.parse(localStorage.getItem('srui_layout')).v === 1));
  // ---- UI modes respect custom hidden flags + positions
  const modes = {}; for (const m of ['minimal', 'none', 'full']) { await E(m => __st.setUi(m), m); await sleep(200); modes[m] = await E(() => ({ tHand: getComputedStyle(document.getElementById('tHand')).display, joyOp: getComputedStyle(document.getElementById('joy')).opacity, joyL: document.getElementById('joy').getBoundingClientRect().left, mini: getComputedStyle(document.getElementById('mini')).display })); }
  ok('FULL/MINIMAL/NONE keep custom flags', modes.minimal.tHand === 'none' && modes.none.tHand === 'none' && modes.full.tHand === 'none' && modes.none.joyOp === '0' && modes.none.mini === 'none' && Math.abs(modes.minimal.joyL - j2.l) < 1 && Math.abs(modes.full.joyL - j2.l) < 1, modes);
  // ---- orientation / size change: anchored offsets kept
  const Lj = await E(() => __st.uied.layout.el.joy); await p.setViewport({ width: 667, height: 375, isMobile: true, hasTouch: true }); await sleep(600);
  const j3 = await rect('joy'); const exp = Lj.x[0] === 'r' ? 667 + Lj.x[1] - j3.r : Lj.x[0] === 'l' ? Lj.x[1] - j3.l : 667 / 2 + Lj.x[1] - j3.cx;
  ok('resize keeps anchor offset', Math.abs(exp) < 1 && j3.r <= 667, { anchor: Lj.x, rect: j3 });
  await p.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }); await sleep(600);
  // ---- key U opens, export/import, slots, mirror, presets, reset
  await p.keyboard.press('KeyU'); await sleep(300); ok('U key opens editor', await E(() => __st.uied.open));
  await tapSel('#uiedP [data-a="export"]'); const exp1 = await E(() => document.getElementById('ueJson').value);
  ok('export JSON', (() => { try { const j = JSON.parse(exp1); return j.v === 1 && j.el.joy && j.el.joy.x; } catch (e) { return false; } })(), exp1.length);
  await tapSel('#uiedP [data-save="1"]'); await tapSel('#uiedP [data-a="reset"]');
  const rs = await E(() => ({ n: Object.keys(__st.uied.layout.el).length, joyStyle: document.getElementById('joy').style.left }));
  const jd = await rect('joy');
  ok('reset to default', rs.n === 0 && rs.joyStyle === '' && Math.abs(jd.cx - def.joy.cx) < 1 && Math.abs(jd.cy - def.joy.cy) < 1, { rs, jd: [jd.cx, jd.cy], def: [def.joy.cx, def.joy.cy] });
  await tapSel('#uiedP [data-load="1"]'); ok('slot 1 save/load', (await E(() => __st.uied.exportJson())) === exp1);
  await tapSel('#uiedP [data-a="reset"]'); await E(s => { document.getElementById('ueJson').value = s; }, exp1); await tapSel('#uiedP [data-a="import"]');
  ok('import JSON', (await E(() => __st.uied.exportJson())) === exp1);
  await E(() => { document.getElementById('ueJson').value = '{"v":99,"el":{}}'; }); await tapSel('#uiedP [data-a="import"]');
  const bad = await E(() => document.getElementById('ueMsg').textContent); ok('bad import rejected', /failed/.test(bad) && (await E(() => __st.uied.exportJson())) === exp1, bad);
  await tapSel('#uiedP [data-a="reset"]');
  await tapSel('#uiedP [data-a="mirror"]'); const mr = {}; for (const id of ['joy', 'bGas', 'bBst', 'mini', 'spdgrp', 'topbtns']) mr[id] = await rect(id);
  const mirOk = Object.entries(mr).every(([id, r]) => Math.abs((844 - r.cx) - def[id].cx) < 2 && Math.abs(r.cy - def[id].cy) < 2);
  ok('mirror swaps sides', mirOk && mr.bGas.cx < 422 && mr.joy.cx > 422 && mr.bBst.cx > 422, Object.fromEntries(Object.entries(mr).map(([k, r]) => [k, [Math.round(r.cx), Math.round(def[k].cx)]])));
  await tapSel('#uiedP [data-a="mirror"]'); const back = await rect('bGas'); ok('mirror twice = original', Math.abs(back.cx - def.bGas.cx) < 2 && Math.abs(back.cy - def.bGas.cy) < 2);
  await tapSel('#uiedP [data-p="clean"]'); const cl = await E(() => __st.uied.layout);
  ok('CLEAN preset', cl.el.tReset.h === 1 && cl.el.cans.h === 1 && cl.g.o === 0.9);
  await tapSel('#uiedP [data-p="lefty"]'); const lr = { gas: await rect('bGas'), joy: await rect('joy'), bst: await rect('bBst') };
  ok('LEFT-HANDED preset', lr.gas.cx < 422 && lr.joy.cx > 422 && lr.bst.cx > 422 && (await E(() => __st.uied.layout.flip)), Object.fromEntries(Object.entries(lr).map(([k, r]) => [k, Math.round(r.cx)])));
  await p.screenshot({ path: SH + 'ui_lefthanded_edit.png' });
  await p.keyboard.press('KeyU'); await sleep(300); ok('U closes editor', !(await E(() => __st.uied.open)));
  // left-handed in play: drive a bit with the (now right side) joystick + left GAS
  const gr = await rect('bGas'); await T('touchStart', [[gr.cx, gr.cy]]); await sleep(1500); await T('touchEnd', []);
  ok('left-handed: GAS button on the left drives', (await E(() => Math.hypot(__st.veh.v.x, __st.veh.v.z))) > 1);
  await sleep(800); await p.screenshot({ path: SH + 'ui_lefthanded_play.png' });
  await E(() => __st.setUi('minimal')); await sleep(400); await p.screenshot({ path: SH + 'ui_lefthanded_minimal.png' }); await E(() => __st.setUi('full'));
  // plane HUD in the editor: flight HUD / throttle / rudder get handles when flying, drag persists
  await E(() => __st.setCraft('plane', 'cub', 'runway')); await sleep(1200);
  await p.keyboard.press('KeyU'); await sleep(400);
  const ph = await E(() => ['pAtt', 'pThr', 'pRud'].map(id => { const h = document.querySelector(`.uih[data-id="${id}"]`); return h ? h.textContent.trim().slice(0, 20) : null; }));
  ok('plane HUD elements have editor handles', ph.every(Boolean), ph);
  const t0 = await rect('pThr'); await drag('pThr', -120, -40); await sleep(150); const t1 = await rect('pThr');
  await p.screenshot({ path: SH + 'ui_edit_plane.png' });
  await p.keyboard.press('KeyU'); await sleep(300);
  const sv = await E(() => JSON.parse(localStorage.getItem('srui_layout')).el.pThr);
  ok('plane throttle draggable + saved', Math.abs(t1.cx - t0.cx + 120) < 10 && Math.abs(t1.cy - t0.cy + 40) < 10 && sv && sv.x !== undefined, { t0: [t0.cx, t0.cy], t1: [t1.cx, t1.cy], sv });
  await E(() => __st.setCraft('car')); await sleep(800);
  ok('plane HUD hidden again in car', await E(() => getComputedStyle(document.getElementById('pAtt')).display === 'none' && getComputedStyle(document.getElementById('pThr')).display === 'none'));
  ok('no console errors', errs.length === 0, errs.slice(0, 5));
  const n = Object.values(res).filter(r => r.pass).length; console.log(`\n${n}/${Object.keys(res).length} passed`);
  await b.close(); process.exit(n === Object.keys(res).length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
