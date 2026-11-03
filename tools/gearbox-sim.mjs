// Node physics run for the auto / manual gearbox (no browser): full throttle on a flat or graded straight for every vehicle,
// handling mode and power (stock / 20 hp / 10000 hp), then a hard stop. Prints one JSON line per run. Used by tools/test-gearbox.cjs.
// Usage: node tools/gearbox-sim.mjs <grade> <seconds> [hp,hp,...]
import { pathToFileURL } from 'node:url'; import path from 'node:path';
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
const R = p => pathToFileURL(path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', p)).href;
const THREE = await import(R('js/three.module.js')), { createRig } = await import(R('js/phys/host/rig.js')), PWR = await import(R('js/power.js'));
const { listVehicles } = await import(R('js/phys/vehicles/index.js')), PH = await import(R('js/phys/physics/index.js'));
const grade = +(process.argv[2] || 0), T = +(process.argv[3] || 70), HPS = (process.argv[4] || '0,10000').split(',').map(Number);
const world = { heightAt: (x, z) => z * grade, surfaceAt: () => 'asphalt', queryTrees: () => [], waterLevel: -1e9 };
const STEP = 1 / 120;
for (const v of listVehicles()) for (const mode of ['arcade', 'normal']) for (const hp of HPS) {
  const rig = createRig({ THREE, world }); rig.setVehicle(v.id, []); rig.setMode(mode); const s = rig.state; s.assist.stab = s.assist.tc = true;
  if (hp) PWR.apply(s, v, { ...PWR.stockOf(s.P), hp }); else PWR.apply(s, v, null);
  const inp = { gas: 1, brake: 0, steer: 0 }; let maxG = 0, down = 0, tMax = -1, last = s.gear, shifts = 0, t100 = -1;
  for (let i = 0; i < T * 120; i++) { const g0 = inp.gas; inp.gas = PWR.throttle(s, STEP, g0); rig.step(inp, STEP); inp.gas = g0; PWR.tick(s, STEP, 1);
    if (t100 < 0 && Math.hypot(s.v.x, s.v.z) > 27.78) t100 = i / 120;
    if (s.gear !== last) { shifts++; if (s.gear < last && maxG === s.P.gears.length) down++; last = s.gear; }
    if (s.gear > maxG) { maxG = s.gear; tMax = i / 120; } }
  const vEnd = Math.hypot(s.v.x, s.v.z), uphill = s.v.z >= 0;
  const bh = []; let lb = s.gear; inp.gas = 0; inp.brake = 1; // hard stop: the box must step down
  for (let i = 0; i < 20 * 120; i++) { rig.step(inp, STEP); if (s.gear !== lb) { bh.push(s.gear); lb = s.gear; } if (Math.hypot(s.v.x, s.v.z) < 0.5) break; }
  // manual: no auto shifts on a held throttle, limiter at redline, shiftGear up / over-rev guard / R from a stop
  let man = null;
  if (hp === 0) { const r2 = createRig({ THREE, world: { ...world, heightAt: () => 0 } }); r2.setVehicle(v.id, []); r2.setMode(mode); const m = r2.state; PWR.apply(m, v, null); m.manual = true;
    let maxRpm = 0, gMax = 0; for (let i = 0; i < 6 * 120; i++) { r2.step({ gas: 1, brake: 0, steer: 0 }, STEP); if (i > 120) maxRpm = Math.max(maxRpm, m.rpm); gMax = Math.max(gMax, m.gear); }
    const up = PH.shiftGear(m, 1); for (let i = 0; i < 120; i++) r2.step({ gas: 1, brake: 0, steer: 0 }, STEP);
    const g2 = m.gear; PH.shiftGear(m, 1); PH.shiftGear(m, 1); // jump up, then a downshift at speed into 1st must be refused when it over-revs
    let refused = 0; m.gear = 1; m.shift = 0; m.gear = Math.min(m.P.gears.length, 3); for (let i = 0; i < 60; i++) r2.step({ gas: 1, brake: 0, steer: 0 }, STEP);
    const vNow = Math.abs(PH.forwardSpeed ? PH.forwardSpeed(m) : m.v.z); const rpm1 = vNow / m.P.wheelR * m.P.gears[0] * m.P.final * 9.549;
    if (rpm1 > m.P.redline * 1.05) { m.gear = 2; refused = PH.shiftGear(m, -1) === 0 ? 1 : -1; } else refused = 2; // 2 = not applicable
    for (let i = 0; i < 20 * 120 && Math.hypot(m.v.x, m.v.z) > 0.3; i++) r2.step({ gas: 0, brake: 1, steer: 0 }, STEP);
    const stopGear = m.gear; for (let i = 0; i < 30; i++) r2.step({ gas: 0, brake: 0, steer: 0 }, STEP); const toR = PH.shiftGear(m, -1); const toR1 = PH.shiftGear(m, 1);
    man = { gMax, maxRpm: Math.round(maxRpm), redline: m.P.redline, up, g2, refused, stopGear, toR, toR1 }; }
  console.log(JSON.stringify({ v: v.id, mode, hp: hp || 'stock', n: s.P.gears.length, maxG, tMax: +tMax.toFixed(1), downAfterMax: down, endGear: last, shifts, t100: +t100.toFixed(1), speed: +vEnd.toFixed(1), uphill, brakeGears: bh.join(','), man }));
}
