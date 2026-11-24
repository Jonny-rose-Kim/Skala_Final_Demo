#!/bin/sh
# Runs the equipment GLB builder with the pinned Blender (override with BLENDER=/path/to/blender).
BLENDER="${BLENDER:-$HOME/tools/blender-4.5.16-linux-x64/blender}"
if [ ! -x "$BLENDER" ]; then
  echo "Blender not found at $BLENDER (set BLENDER=...). Install Blender 4.5 LTS: https://download.blender.org/release/Blender4.5/" >&2
  exit 1
fi
exec "$BLENDER" --background --factory-startup --python scripts/blender/build_equipment.py -- "$@"
