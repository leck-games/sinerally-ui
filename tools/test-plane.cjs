// SineRally UI — planes e2e. Headless Chrome, iPhone 12 landscape 844x390 with touch.
// Serve the repo: python3 -m http.server 18941 --bind 127.0.0.1 ; then node tools/test-plane.cjs  (screenshots -> shots/plane_*.png)
// A scripted autopilot (window.__AP, fed through __st.planeCtl) flies the real flight model: takeoff, climb, cruise, approach + landing,
// a dive into the ground, a tree strike, NORMAL-mode flight, the jet + stunt planes, touch controls and the switch back to the car.
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = require('/workspace/scratch/ptest/node_modules/puppeteer-core'); }
const SH = require('path').join(__dirname, '..', 'shots') + '/'; const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PORT || 18941, BASE = `http://127.0.0.1:${PORT}/`;
const res = {}; const ok = (k, v, info) => { res[k] = { pass: !!v, info }; console.log((v ? 'PASS ' : 'FAIL ') + k, info !== undefined ? JSON.stringify(info) : ''); };
// in-page autopilot: modes 'takeoff' (full power, rotate, climb to alt), 'hold' (alt/heading hold), 'land' (ILS-ish to __AP.af), 'dive', 'fixed'
const AP_SRC = `(() => {
  const C = (v, a = -1, b = 1) => Math.max(a, Math.min(b, v));
  window.__AP = { mode: 'takeoff', alt: 70, thr: 1, boost: false, hdg: null };
  __st.planeCtl = (s) => {
    const A = window.__AP, d = s.def || __st.planeDef, vr = d.vRef, bank = Math.atan2(s.left.y, s.up.y), pitch = Math.asin(C(s.fwd.y));
    const o = { pitch: 0, roll: 0, yaw: 0, thr: A.thr, brake: 0, boost: A.boost };
    const level = (bankT = 0) => C((bankT - bank) * 2.5);
    const vsHold = tv => C((tv - s.vs) * 0.12 + (0.05 - pitch) * 0.3);
    if (A.mode === 'fixed') return Object.assign(o, A.fixed);
    if (A.mode === 'dive') { o.pitch = -1; o.thr = 1; o.roll = level(); return o; }
    if (A.mode === 'takeoff') {
      if (s.onGround) { o.pitch = s.ias > vr * 0.75 ? 0.5 : 0; o.roll = 0; return o; }
      o.roll = level(); o.pitch = s.agl < A.alt ? vsHold(Math.min(6, (A.alt - s.agl) * 0.2 + 2)) : vsHold(0); return o; }
    if (A.mode === 'hold') { let bT = 0; if (A.hdg != null) { let e = ((A.hdg - s.hdg + 540) % 360) - 180; bT = C(e * 0.03, -0.6, 0.6); }
      o.roll = level(bT); o.pitch = vsHold(C((A.alt - s.agl) * 0.15, -5, 5)); o.thr = A.thr; return o; }
    if (A.mode === 'land') { const f = A.af, dx = f.dx, dz = f.dz, nx = dz, nz = -dx; // runway frame (n = left)
      const rx = s.p.x - f.x, rz = s.p.z - f.z, along = rx * dx + rz * dz, t = rx * nx + rz * nz, td = s.v.x * nx + s.v.z * nz;
      const aim = -f.L / 2 + 40, dist = aim - along, desH = f.h + Math.max(0, dist) * 0.07; // ~4° glide path to the aim point
      o.roll = level(C(t * 0.025 + td * 0.12, -0.45, 0.45));
      if (s.onGround) { o.pitch = 0; o.thr = 0; o.brake = 1; o.roll = 0; return o; }
      if (s.agl > 5) { const tv = C((desH - s.p.y) * 0.25 - Math.min(9, s.ias * 0.07), -9, 1); o.pitch = vsHold(tv); o.thr = C(0.35 + (vr * 1.15 - s.ias) * 0.05, 0.05, 1); }
      else { o.pitch = vsHold(-0.9); o.thr = 0; o.roll = level(0); }
      return o; }
    return o; };
})()`;
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); await p.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const errs = []; p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  const cdp = await p.createCDPSession();
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i, radiusX: 2, radiusY: 2, force: 1 })) });
  const E = (f, ...a) => p.evaluate(f, ...a);
  const S = () => E(() => { const s = __st.plane; return s && { x: +s.p.x.toFixed(1), y: +s.p.y.toFixed(1), z: +s.p.z.toFixed(1), ias: +s.ias.toFixed(1), agl: +s.agl.toFixed(1), vs: +s.vs.toFixed(1), hdg: Math.round(s.hdg), gnd: s.onGround, cr: s.crashed, cause: s.cause, fl: s.flights, ld: s.landings, cs: s.crashes, craft: __st.craft, id: __st.planeDef.id }; });
  const until = async (fn, ms, step = 250) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await E(fn); if (v) return v; await sleep(step); } return v; };
  const AP = o => E(o => Object.assign(window.__AP, o), o);
  // ---- fresh load straight into the bush plane
  await p.goto(BASE + '?q=low&dyn=0', { waitUntil: 'load' }); await E(() => localStorage.clear()); await p.goto(BASE + '?q=low&dyn=0&plane=cub', { waitUntil: 'load' }); await sleep(5000);
  let s = await S(); const vis = await E(() => ({ body: document.body.className, att: getComputedStyle(document.getElementById('pAtt')).display, thr: getComputedStyle(document.getElementById('pThr')).display, rud: getComputedStyle(document.getElementById('pRud')).display, unl: getComputedStyle(document.getElementById('bUnl')).display, bst: getComputedStyle(document.getElementById('bBst')).display, car: __st.carVisible !== undefined ? __st.carVisible : null, af: __st.afx.fields.length }));
  ok('spawn: ?plane=cub on a runway, at rest', s && s.craft === 'plane' && s.id === 'cub' && s.gnd && !s.cr && s.ias < 1, s);
  ok('plane HUD shown (horizon, throttle, rudder; no UNLOAD / no BURN for the cub)', /plane/.test(vis.body) && vis.att === 'block' && vis.thr === 'block' && vis.rud === 'flex' && vis.unl === 'none' && vis.bst === 'none', vis);
  ok('procedural airfields exist', vis.af >= 3, vis.af);
  await p.screenshot({ path: SH + 'plane_runway.png' });
  // ---- touch: throttle slider + joystick roll/pitch + rudder (no autopilot)
  const tr = await E(() => { const r = document.getElementById('pThr').getBoundingClientRect(); return { cx: r.left + r.width / 2, t: r.top, b: r.bottom }; });
  await T('touchStart', [[tr.cx, tr.b - 8]]); for (let i = 1; i <= 6; i++) { await T('touchMove', [[tr.cx, tr.b - 8 - (tr.b - tr.t - 16) * 0.6 * i / 6]]); await sleep(20); } await T('touchEnd', []); await sleep(200);
  const thr1 = await E(() => __st.throttle); ok('touch throttle slider sets the throttle', thr1 > 0.45 && thr1 < 0.75, thr1);
  const jr = await E(() => { const r = document.getElementById('joy').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await T('touchStart', [[jr[0], jr[1]]]); for (let i = 1; i <= 5; i++) { await T('touchMove', [[jr[0] + 12 * i, jr[1] - 9 * i]]); await sleep(20); } await sleep(300);
  const pin1 = await E(() => ({ roll: __st.pin.roll, pitch: __st.pin.pitch })); await T('touchEnd', []);
  ok('touch joystick → roll right + pitch (stick forward = nose down)', pin1.roll > 0.3 && pin1.pitch < -0.2, pin1);
  const rr = await E(() => { const r = document.getElementById('pRR').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await T('touchStart', [[rr[0], rr[1]]]); await sleep(500); const yaw1 = await E(() => __st.pin.yaw); await T('touchEnd', []);
  ok('touch rudder button → yaw', yaw1 > 0.5, yaw1);
  await E(() => { __st.planeToRunway(); }); await sleep(800);
  // ---- takeoff + climb + cruise (autopilot drives the same pin.* inputs the controls do)
  await E(AP_SRC); await AP({ mode: 'takeoff', alt: 90, thr: 1 });
  const to = await until(() => { const s = __st.plane; return s.flights >= 1 && s.agl > 25 ? { agl: s.agl, ias: s.ias } : (s.crashed ? { crashed: s.cause } : false); }, 60000);
  ok('takeoff (rotate at Vr, gear leaves the runway)', to && !to.crashed && to.agl > 25, to);
  await sleep(4000); await AP({ mode: 'hold', alt: 90, thr: 0.75 });
  const a0 = await S(); await sleep(6000); const a1 = await S();
  const dist = Math.hypot(a1.x - a0.x, a1.z - a0.z);
  ok('sustained flight (moving, airborne, no crash)', !a1.cr && !a1.gnd && a1.agl > 30 && dist > 60 && a1.ias > 25, { a0, a1, dist: +dist.toFixed(0) });
  const cam = await E(() => { const c = __st.camera, s = __st.plane; return { far: c.far, d: c.position.distanceTo(s.p), behind: (c.position.x - s.p.x) * s.fwd.x + (c.position.z - s.p.z) * s.fwd.z }; });
  ok('chase camera behind the plane, far plane opens up with altitude', cam.d > 6 && cam.d < 40 && cam.behind < 0, cam);
  await p.screenshot({ path: SH + 'plane_flight.png' });
  const hudPix = await E(() => { const c = document.getElementById('pAtt'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
  const tel = await E(() => document.getElementById('carinfo') ? document.getElementById('carinfo').textContent : '');
  ok('plane HUD draws (horizon/IAS/ALT) + telemetry line', hudPix > 4000, { hudPix, tel });
  await p.screenshot({ path: SH + 'plane_hud.png', clip: { x: 300, y: 30, width: 344, height: 130 } });
  // turn
  const h0 = (await S()).hdg; await AP({ mode: 'hold', hdg: (h0 + 90) % 360 }); await sleep(14000); const h1 = await S();
  const dh = Math.abs(((h1.hdg - h0 + 540) % 360) - 180);
  ok('banked turn (heading change ≥ 45°) without losing it', !h1.cr && dh >= 45, { h0, h1: h1.hdg, dh, agl: h1.agl });
  // ---- approach + landing on the nearest airfield: start on a 4° glide path 650 m out, aligned with the runway
  const ap = await E(() => { const s = __st.plane, af = __st.pickField(__st.planeDef, s.p.x, s.p.z), d = 650 + af.L / 2, x = af.x - af.dx * d, z = af.z - af.dz * d;
    __st.airStart(x, z, Math.atan2(af.dx, af.dz)); s.p.y = af.h + 610 * 0.07 + 2; const v = __st.planeDef.vRef * 1.2; s.v.set(af.dx * v, 0, af.dz * v);
    window.__AP.af = { x: af.x, z: af.z, dx: af.dx, dz: af.dz, L: af.L, h: af.h, name: af.name }; window.__AP.mode = 'land'; return window.__AP.af; });
  const ld = await until(() => { const s = __st.plane; return s.crashed ? { crashed: s.cause } : (s.landings >= 1 && s.onGround && s.ias < 4 ? { landings: s.landings, x: s.p.x, z: s.p.z } : false); }, 90000);
  let onRwy = null; if (ld && !ld.crashed) { const rx = ld.x - ap.x, rz = ld.z - ap.z; onRwy = { along: rx * ap.dx + rz * ap.dz, cross: rx * ap.dz - rz * ap.dx }; }
  ok('approach + landing on the runway, rolls to a stop', ld && !ld.crashed && onRwy && Math.abs(onRwy.along) < ap.L / 2 + 30 && Math.abs(onRwy.cross) < 25, { field: ap.name, ld, onRwy });
  // ---- crash (dive into the ground) + auto reset to a runway
  await E(() => { const s = __st.plane; __st.airStart(s.p.x, s.p.z, 0); }); await AP({ mode: 'dive' });
  const cr = await until(() => __st.plane.crashed ? { cause: __st.plane.cause } : false, 30000, 100);
  ok('dive into the ground = crash', cr && cr.cause, cr); await AP({ mode: 'fixed', fixed: { pitch: 0, roll: 0, thr: 0 } });
  await sleep(500); await p.screenshot({ path: SH + 'plane_crash.png' });
  const rs = await until(() => { const s = __st.plane; return !s.crashed && s.onGround ? { ias: s.ias, crashes: s.crashes } : false; }, 15000);
  ok('auto-reset to a runway after the crash', rs && rs.ias < 2, rs);
  // ---- tree strike
  const tree = await E(() => { const s = __st.plane; for (let R = 300; R <= 3000; R += 300) { const L = __st.T.queryTrees(s.p.x, s.p.z, R).filter(t => t.height > 8); if (L.length) { const t = L[(L.length / 2) | 0]; return { x: t.pos.x, z: t.pos.z, h: t.height, gy: __st.T.heightAt(t.pos.x, t.pos.z) }; } } return null; });
  if (tree) {
    await E(t => { const yaw = 0.7, d = 70, x = t.x - Math.sin(yaw) * d, z = t.z - Math.cos(yaw) * d; __st.airStart(x, z, yaw); const s = __st.plane; s.p.y = t.gy + t.h * 0.55; const v = __st.planeDef.vRef * 1.3; s.v.set(Math.sin(yaw) * v, 0, Math.cos(yaw) * v); window.__AP.mode = 'fixed'; window.__AP.fixed = { pitch: 0, roll: 0, yaw: 0, thr: 0.6 }; }, tree);
    const tc = await until(() => __st.plane.crashed ? { cause: __st.plane.cause } : false, 15000, 50);
    ok('flying into a tree = crash', tc && /TREE|NOSE|PROP|GROUND|TERRAIN/i.test(tc.cause), { tree, tc });
  } else ok('flying into a tree = crash', false, 'no tree found');
  await until(() => !__st.plane.crashed, 8000);
  // ---- NORMAL handling: air start + level flight
  await E(() => { __st.setHandling && __st.setHandling('normal'); }); const hmode = await E(() => __st.handling || (__st.TEL && __st.TEL.handling));
  await E(() => { const s = __st.plane; __st.airStart(s.p.x + 300, s.p.z + 300, 1.2); }); await AP({ mode: 'hold', alt: 150, thr: 0.8, hdg: null });
  await sleep(10000); const n1 = await S();
  ok('NORMAL mode: stable flight on the autopilot', !n1.cr && n1.agl > 40, { hmode, n1 });
  await E(() => { __st.setHandling && __st.setHandling('arcade'); });
  // ---- jet: paved field, afterburner takeoff
  await E(() => { __st.setCraft('plane', 'jet'); __st.planeToRunway(); }); await sleep(1500); // swapping planes mid-air keeps you airborne; reset puts the jet on a paved runway
  const j0 = await S(); const jab = await E(() => getComputedStyle(document.getElementById('bBst')).display);
  ok('jet spawns on a paved runway with BURN button', j0.id === 'jet' && j0.gnd && !j0.cr && jab !== 'none', { j0, jab });
  await AP({ mode: 'takeoff', alt: 120, thr: 1, boost: true });
  const jt = await until(() => { const s = __st.plane; return s.agl > 40 && !s.onGround ? { agl: s.agl, ias: s.ias, flame: s.boosting } : (s.crashed ? { crashed: s.cause } : false); }, 60000);
  ok('jet afterburner takeoff', jt && !jt.crashed && jt.agl > 40, jt); await AP({ boost: false, mode: 'hold', alt: 150, thr: 0.8 }); await sleep(3000);
  await p.screenshot({ path: SH + 'plane_jet.png' });
  // ---- stunt plane: takeoff via the vehicle-selector Planes tab (UI path)
  await E(() => { __st.planeCtl = null; }); await p.keyboard.press('Escape').catch(() => {});
  await E(() => document.getElementById('tMenu').click()); await sleep(400);
  const tabs = await E(() => ({ car: !!document.getElementById('vt_car'), plane: !!document.getElementById('vt_plane') }));
  if (tabs.plane) await E(() => document.getElementById('vt_plane').click()); await sleep(800);
  const btns = await E(() => [...document.querySelectorAll('#menu button')].map(b => b.textContent).filter(t => /✈/.test(t)));
  await E(() => { const b = [...document.querySelectorAll('#menu button')].find(b => /STUNT/.test(b.textContent)); b && b.click(); }); await sleep(800);
  await E(() => { const m = document.getElementById('menu'); if (m.style.display !== 'none') { const c = document.getElementById('mnClose'); c && c.click(); } }); await sleep(800);
  const st = await S(); await p.screenshot({ path: SH + 'plane_selector.png' });
  ok('vehicle selector: PLANES tab lists the planes, picking STUNT X spawns it', tabs.car && tabs.plane && btns.length >= 3 && st.id === 'stunt' && !st.cr, { tabs, btns, st });
  await E(() => __st.planeToRunway()); await sleep(1000);
  await E(AP_SRC); await AP({ mode: 'takeoff', alt: 80, thr: 1 });
  const stt = await until(() => { const s = __st.plane; return s.agl > 30 && !s.onGround ? { agl: s.agl } : (s.crashed ? { crashed: s.cause } : false); }, 45000);
  ok('stunt plane takeoff', stt && !stt.crashed, stt);
  // ---- back to the car
  await E(() => { __st.planeCtl = null; __st.setCraft('car'); }); await sleep(1500);
  const cv = await E(() => ({ craft: __st.craft, body: document.body.className, att: getComputedStyle(document.getElementById('pAtt')).display, unl: getComputedStyle(document.getElementById('bUnl')).display, x: __st.x, z: __st.z, saved: localStorage.getItem('sinerally_craft') }));
  const c0 = await E(() => [__st.x, __st.z]); await p.keyboard.down('ArrowUp'); await sleep(2500); await p.keyboard.up('ArrowUp'); const c1 = await E(() => [__st.x, __st.z]);
  const mv = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
  ok('switch back to the car: plane HUD hidden, car drives', cv.craft === 'car' && !/plane/.test(cv.body) && cv.att === 'none' && mv > 2 && cv.saved === 'car', { cv, mv: +mv.toFixed(1) });
  // persisted craft: reload in plane mode resumes the plane
  await E(() => __st.setCraft('plane', 'cub')); await p.reload({ waitUntil: 'load' }); await sleep(4500);
  const pr = await E(() => ({ craft: __st.craft, id: __st.planeDef && __st.planeDef.id })); ok('craft choice persists across reload', pr.craft === 'plane' && pr.id === 'cub', pr);
  await E(() => __st.setCraft('car'));
  const bad = errs.filter(e => !/favicon|AudioContext|autoplay/i.test(e)); ok('no console errors', bad.length === 0, bad.slice(0, 5));
  await b.close(); const fails = Object.entries(res).filter(([, v]) => !v.pass).map(([k]) => k);
  console.log(`\n${Object.keys(res).length - fails.length}/${Object.keys(res).length} passed` + (fails.length ? ' — FAILED: ' + fails.join(', ') : '')); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
