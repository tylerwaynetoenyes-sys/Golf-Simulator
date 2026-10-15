#!/bin/bash
# Double-click to get the latest Fairway from GitHub, then play.
exec "$(cd "$(dirname "$0")" && pwd)/launcher/fairway.sh" --update
