#!/bin/bash
# Double-click to play, and let friends on the same Wi-Fi join from their browsers.
exec "$(cd "$(dirname "$0")" && pwd)/launcher/fairway.sh" --lan
