# Playing Fairway

## One click (this Mac)

Double-click **Fairway** on the Desktop.

A Terminal window opens with the Fairway banner, the R10 bridge starts, and
the game opens in your browser. Keep that window open while you play; close
it to stop. If Fairway is already running, the icon just brings the game back
up.

The Desktop icon is built by `launcher/install-mac.sh`. If it's ever missing,
or the Golf-Simulator folder moves, rebuild it from Terminal:

```bash
~/Golf-Simulator/launcher/install-mac.sh
```

The same launchers sit in the Golf-Simulator folder if you prefer them:

| Double-click | What it does |
|---|---|
| `Fairway.command` | Play on this Mac |
| `Fairway on Wi-Fi.command` | Play, and let friends on the same Wi-Fi join (it prints the address to give them) |
| `Update Fairway.command` | Get the latest version from GitHub, then play |

### Why it used to fail

`python -m r10bridge` needs a `python` command, and this Mac doesn't have
one. Apple's built-in `python3` is version 3.9, which is too old for the
bridge. The launcher never relies on the PATH. It uses the bridge's own
environment (`bridge/venv`, built from Homebrew's Python 3.12), and rebuilds
that environment by itself if Homebrew updates or removes Python. If no
Python 3.10+ exists at all, it tells you to run `brew install python@3.12`.

## Updates

GitHub (`tylerwaynetoenyes-sys/Golf-Simulator`) is the source of truth. To
get the newest version, double-click **`Update Fairway.command`**. It pulls
the latest commits and refreshes the bridge's packages, then starts the game.
If you've edited files yourself, it first sets your changes aside with
`git stash` instead of failing.

By hand: `cd ~/Golf-Simulator && git pull`.

## Sharing with friends

**Same Wi-Fi (no install for them).** Double-click `Fairway on Wi-Fi.command`
(or run `launcher/install-mac.sh --wifi` for a Desktop icon). The window shows
an address like `http://192.168.1.88:8765/`. Friends open that in Chrome or
Safari on their laptop, iPad or TV browser. The first time, macOS may ask
whether Python can accept incoming connections: choose **Allow**. Your R10
stays paired to this Mac. Everyone plays on one game through the players and
teams panel, or each friend can play in demo mode on their own screen.

**Their own copy (their own Mac and launch monitor).** Send them this:

1. Install [Homebrew](https://brew.sh), then in Terminal:
   `brew install python@3.12 git`
2. `git clone https://github.com/tylerwaynetoenyes-sys/Golf-Simulator.git ~/Golf-Simulator`
3. `~/Golf-Simulator/launcher/install-mac.sh`
4. Double-click **Fairway** on their Desktop. Updates: `Update Fairway.command`.

Windows friends: install Python 3.12 from python.org, then from the
`Golf-Simulator\bridge` folder run `py -3.12 -m venv venv`,
`venv\Scripts\pip install -r requirements.txt` and
`venv\Scripts\python -m r10bridge --open`.

## If something goes wrong

| You see | Do this |
|---|---|
| "Port 8765 is used by another program" | Another copy is starting or something else uses the port. Close other Fairway windows, or run `FAIRWAY_PORT=8766 ~/Golf-Simulator/launcher/fairway.sh` |
| "Could not install the bridge's packages" | You're offline on the first run. Connect and try again |
| The game opens but the R10 won't pair | Open Help (the **?** button) in the game for the pairing checklist |
| Anything else odd after an update | `~/Golf-Simulator/launcher/fairway.sh --repair` rebuilds the bridge's Python environment |
| "Fairway's folder has moved" | Run `launcher/install-mac.sh` from the folder's new location |

Try it without a launch monitor: `~/Golf-Simulator/launcher/fairway.sh --mock`
simulates an R10 that hits a shot every 12 seconds.
