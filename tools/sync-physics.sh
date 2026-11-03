#!/bin/sh
# Re-vendor the physics / vehicles / attachments modules into js/phys/ (contract: MODULE_API.md of sinerally-physics).
# Do not edit js/phys/ by hand: local game-side changes live in tools/physics-local.patch (applied below). usage: tools/sync-physics.sh [path-to-sinerally-physics checkout]   (default ../sinerally-physics)
set -e
SRC=${1:-../sinerally-physics}; cd "$(dirname "$0")/.."
rm -rf js/phys && mkdir -p js/phys/host
cp -r "$SRC"/physics "$SRC"/vehicles "$SRC"/attachments js/phys/
cp "$SRC"/host/rig.js "$SRC"/host/bus.js js/phys/host/
cp "$SRC"/MODULE_API.md js/phys/MODULE_API.md
REV=$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo unknown)
echo "vendored from sinerally-physics@$REV on $(date +%F)" > js/phys/VERSION
# LOCAL: hold-the-pedal auto gearbox (climbs to top gear and stays there) + manual gearbox API (s.manual, shiftGear)
patch -p1 --forward < tools/physics-local.patch && echo "+ physics-local.patch (local: auto box climbs to top gear on a held throttle and holds it, no hunting; manual gearbox: s.manual + shiftGear())" >> js/phys/VERSION
echo "physics synced @$REV (+ local patch)"
