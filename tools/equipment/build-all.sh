#!/bin/bash
# Rebuild every club head, shaft set and ball and copy the GLBs into
# assets/models. Needs Blender 4.3 and a Python with numpy, scipy,
# scikit-image, Pillow and fontTools (+brotli):
#   PY=/path/to/venv/bin/python BUILD=/tmp/fw-equip tools/equipment/build-all.sh [set ...]
# About two hours on an 8-core Mac (two sets build at once).
set -euo pipefail
cd "$(dirname "$0")/../.."
PY=${PY:-python3}
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
BUILD=${BUILD:-/tmp/fw-equip}
SETS=${*:-tour cavity gi black persimmon hockey}
mkdir -p "$BUILD"

one_set() {
  s=$1
  "$PY" tools/equipment/build.py "$BUILD" "$s" > "$BUILD/$s.build.log" 2>&1
  "$BLENDER" -b --factory-startup --python tools/blender/equipment.py -- "$BUILD/$s" "$BUILD/out/clubs/$s" > "$BUILD/$s.bake.log" 2>&1
  grep -h "tris," "$BUILD/$s.bake.log" | sed "s/^/$s /"
}
export -f one_set
export PY BLENDER BUILD

# shafts and grips (quick)
"$PY" tools/equipment/shafts.py "$BUILD/shafts"
for s in tour cavity gi black persimmon hockey; do
  "$BLENDER" -b --factory-startup --python tools/blender/shafts.py -- "$BUILD/shafts/$s" "$BUILD/out/clubs/$s/shafts.glb" 2>/dev/null | grep KB
done
# balls
"$PY" tools/equipment/build.py "$BUILD" balls
"$BLENDER" -b --factory-startup --python tools/blender/equipment.py -- "$BUILD/balls" "$BUILD/out/balls" 2>/dev/null | grep "tris,"
# heads, two sets at a time
printf '%s\n' $SETS | xargs -P 2 -I{} bash -c 'one_set {}'

mkdir -p assets/models/clubs assets/models/balls
cp -R "$BUILD/out/clubs/." assets/models/clubs/
cp "$BUILD/out/balls/"*.glb assets/models/balls/
du -sh assets/models/clubs assets/models/balls
