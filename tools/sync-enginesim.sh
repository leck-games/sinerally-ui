#!/bin/sh
# Vendor the Engine Sim sound plugin from the leck-games/sinerally-enginesim repo (its single source of truth).
# usage: tools/sync-enginesim.sh [path-to-engine-sim-checkout]   (default ../engine-sim)
# viz.js (engine diagram) is optional and only used by the in-game sound editor.
# Local additions (plane presets aeroFlat4/aeroFlat6/turbine + vehicle map) live in tools/enginesim-local.patch and are re-applied.
set -e
SRC=${1:-../engine-sim}; DIR=$(cd "$(dirname "$0")" && pwd); DST=$DIR/../plugins/enginesim
for f in plugin.js engine-sim.js engine-dsp.js engine-config.js motor.js viz.js; do cp "$SRC/js/$f" "$DST/$f"; done
(cd "$DST" && patch -p1 --forward < "$DIR/enginesim-local.patch") || echo "WARNING: local plane-preset patch did not apply cleanly; re-add aeroFlat4/aeroFlat6/turbine by hand"
echo "vendored from leck-games/sinerally-enginesim@$(git -C "$SRC" rev-parse --short HEAD) on $(date -u +%F) + tools/enginesim-local.patch" > "$DST/VERSION"
cat "$DST/VERSION"
