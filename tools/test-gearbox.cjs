// Gearbox: (1) Node physics — held throttle 60+ s climbs to top gear and stays there (flat + 6 % / 10 % grades,
// stock and 10000 hp, arcade + normal, every vehicle), braking steps down, 20 hp never hunts; MANUAL: no auto shifts,
// limiter at redline, over-rev guard, R from a stop. (2) Browser — GEARBOX setting persists, a touch swipe on the gas
// pedal shifts while the throttle stays held, X / Z keys shift, AUTO unchanged.
const { execFileSync } = require('child_process'), path = require('path');
const { launch, open, ok, done } = require('./lib-headless.cjs');
const sim = (...a) => execFileSync(process.execPath, [path.join(__dirname, 'gearbox-sim.mjs'), ...a.map(String)], { encoding: 'utf8', maxBuffer: 1e7 }).trim().split('\n').map(l => JSON.parse(l));
(async () => {
  for (const [grade, T] of [[0, 65], [0.06, 65], [0.10, 65]]) {
    const runs = sim(grade, T, '0,10000');
    const bad = runs.filter(r => r.maxG !== r.n || r.downAfterMax || r.endGear !== r.n);
    ok(!bad.length, `grade ${grade * 100}%: ${runs.length} runs (5 vehicles × arcade/normal × stock/10000 hp, ${T} s full throttle) reach top gear and never shift down` + (bad.length ? ' — ' + bad.map(r => `${r.v}/${r.mode}/${r.hp}: max ${r.maxG}/${r.n} down ${r.downAfterMax} end ${r.endGear}`).join('; ') : ` (latest top gear at ${Math.max(...runs.map(r => r.tMax)).toFixed(1)} s)`));
    const brk = runs.filter(r => { const g = r.brakeGears.split(',').map(Number); return !(g.length >= r.n - 1 && g.every((x, i) => i === 0 || x < g[i - 1] || x === -1) && g.includes(1)); });
    ok(!brk.length, `grade ${grade * 100}%: hard braking steps down gear by gear to 1st` + (brk.length ? ' — ' + brk.map(r => r.v + '/' + r.mode + ':' + r.brakeGears).join('; ') : ''));
    if (grade === 0) {
      const slow = runs.filter(r => r.hp === 'stock' && r.t100 > 6.5); ok(!slow.length, '0-100 km/h stock: ' + runs.filter(r => r.hp === 'stock').map(r => `${r.v}/${r.mode[0]} ${r.t100}s`).join(' '));
      const man = runs.filter(r => r.man), mb = man.filter(r => { const m = r.man; return m.gMax !== 1 || m.maxRpm > m.redline + 60 || m.up !== 2 || m.refused !== 1 || !(m.stopGear === 1 ? m.toR === -1 : m.stopGear === -1) || m.toR1 !== 1; });
      ok(!mb.length, `MANUAL (${man.length} runs): no auto upshift on a 6 s held throttle, limiter holds redline (max over ${Math.max(...man.map(r => r.man.maxRpm - r.man.redline))} rpm), shift up works, over-rev downshift refused, stop → 1st/R, R → 1st` + (mb.length ? ' — ' + mb.map(r => r.v + '/' + r.mode + JSON.stringify(r.man)).join('; ') : ''));
    }
  }
  const low = sim(0, 120, '20'), lb = low.filter(r => r.downAfterMax || r.shifts !== r.maxG - 1);
  ok(!lb.length, `20 hp flat 120 s: only upshifts, no hunting (gears reached ${low.map(r => r.v[0] + r.mode[0] + r.maxG).join(' ')})` + (lb.length ? ' — ' + JSON.stringify(lb) : ''));

  // ---- browser
  const h = await launch(); const P = h.page;
  await open(h, 'q=low&dyn=0');
  ok((await P.evaluate(() => __st.gearbox)) === 'Auto' && !(await P.evaluate(() => __st.veh.manual)), 'default GEARBOX = Auto');
  const row = await P.evaluate(() => { document.getElementById('tMenu').onclick(); document.querySelector('#mTabs .mtab[data-tab="hud"]') && document.querySelector('#mTabs .mtab[data-tab="hud"]').click(); const r = [...document.querySelectorAll('#mHud .mrow')].find(r => r.firstChild && r.firstChild.textContent === 'GEARBOX'); if (!r) return null; const b = [...r.querySelectorAll('button')].find(b => b.textContent === 'MANUAL'); b.click(); const out = [...r.querySelectorAll('button')].map(b => b.textContent).join('/'); document.getElementById('mnClose').onclick(); return out; });
  ok(row === 'AUTO/MANUAL', 'CONTROLS & HUD tab has the GEARBOX [Auto | Manual] row: ' + row);
  ok((await P.evaluate(() => localStorage.getItem('sinerally_gearbox'))) === 'Manual', 'choice saved to localStorage (sinerally_gearbox)');
  await open(h, 'q=low&dyn=0');
  ok(await P.evaluate(() => __st.gearbox === 'Manual' && __st.veh.manual === true), 'MANUAL persists across a reload');
  const touch = (type, y) => P.evaluate((type, y) => { const el = document.getElementById('bGas'), r = el.getBoundingClientRect(), x = r.left + r.width / 2 || 700;
    const t = new Touch({ identifier: 7, target: el, clientX: x, clientY: y, pageX: x, pageY: y }); el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t] })); }, type, y);
  const st = () => P.evaluate(() => ({ g: __st.veh.gear, gas: __st.inp.gas, v: Math.hypot(__st.veh.v.x, __st.veh.v.z), rpm: __st.veh.rpm, red: __st.veh.P.redline }));
  await touch('touchstart', 300); await new Promise(r => setTimeout(r, 2500));
  const a = await st(); ok(a.g === 1 && a.gas === 1 && a.v > 3, `touch-hold gas in MANUAL: drives in 1st, no auto upshift (gear ${a.g}, ${a.v.toFixed(1)} m/s, ${a.rpm.toFixed(0)}/${a.red} rpm)`);
  await touch('touchmove', 285); await touch('touchmove', 262); await new Promise(r => setTimeout(r, 120));
  const b = await st(); ok(b.g === 2 && b.gas === 1, `swipe UP on the gas pedal (38 px) → gear ${b.g}, throttle still held (${b.gas})`);
  await new Promise(r => setTimeout(r, 600)); await touch('touchmove', 250); await touch('touchmove', 220);
  const b2 = await st(); ok(b2.g === 3, `second swipe up → gear ${b2.g}`);
  for (let y = 225; y <= 265; y += 5) { await touch('touchmove', y); await new Promise(r => setTimeout(r, 100)); } // ~50 px/s drift
  const b3 = await st(); ok(b3.g === 3 && b3.gas === 1, `slow drift / long move is not a swipe (gear ${b3.g})`);
  await touch('touchmove', 280); await touch('touchmove', 303); const c = await st(); ok(c.g === 2 && c.gas === 1, `swipe DOWN (38 px) → gear ${c.g}, throttle still held`);
  await touch('touchend', 303); await new Promise(r => setTimeout(r, 100)); ok((await st()).gas === 0, 'lifting the finger releases the throttle');
  await P.keyboard.press('KeyX'); const k1 = await st(); await new Promise(r => setTimeout(r, 400)); await P.keyboard.press('KeyZ'); const k2 = await st();
  ok(k1.g === 3 && k2.g === 2, `keys: X → ${k1.g}, Z → ${k2.g}`);
  const fl = await P.evaluate(() => new Promise(res => { __st.manualShift(1); requestAnimationFrame(() => res(document.getElementById('gauge').toDataURL().length)); }));
  ok(fl > 1000, 'HUD gauge redrawn after a manual shift (gear flash)');
  // AUTO again: same pedal swipe does nothing, the box shifts by itself
  await P.evaluate(() => { __st.setGearbox('Auto'); __st.respawn ? __st.respawn() : 0; }); ok((await P.evaluate(() => localStorage.getItem('sinerally_gearbox'))) === 'Auto', 'back to Auto (saved)');
  await P.evaluate(() => { __st.veh.gear = 1; }); await touch('touchstart', 300); await touch('touchmove', 250); const d0 = await st();
  await new Promise(r => setTimeout(r, 6000)); const d = await st(); await touch('touchend', 250);
  ok(d0.g === 1 && d.g >= 2 && !(await P.evaluate(() => __st.veh.manual)), `AUTO: swipe ignored (gear ${d0.g}), auto upshifts on the held pedal → gear ${d.g} at ${d.v.toFixed(1)} m/s`);
  ok(!h.errors.length, 'no console errors ' + h.errors.slice(0, 3).join(' | '));
  await h.close(); done();
})().catch(e => { console.error(e); process.exit(1); });
