#!/usr/bin/env bash
# Simulator smoke run + App Store screenshot drafts (BUILD-PLAN §10, §11.1, §11.2).
# Runs on the Codemagic Mac after "Build for simulator" (codemagic.yaml, ios-simulator):
#
#   bash mobile/scripts/screenshots.sh
#
# For every device it creates a fresh simulator, sets the 9:41 status bar, installs the Debug app,
# launches it once plainly (smoke: it must start and stay up), then once per demo screen with
# SIMCTL_CHILD_CN_DEMO_SCREEN=<name>. In Debug builds MainViewController passes that to the page as
# window.CN_DEMO_SCREEN; web-ios/debug.js (debug bundle only) fills the screen with fictional
# ".invalid" examples. It saves a PNG and an alpha-free JPEG of each screen, records one video per
# device, and fails if the app is not running after a launch on a required device.
#
# Each launch runs with `simctl launch --console-pty` (as engine-parity.sh does) and keeps the app's
# console in <screen>.log. A demo screen counts only when debug.js printed "CN_DEMO_READY <screen>";
# otherwise the step fails on a required device (a capture of a half-drawn or covered screen is not
# a pass; debug.js also reports CN_DEMO_FAILED while the sign-in card is still open). debug.js also skips the
# first-run intro and answers the tracking prompt with "denied" in demo runs, so neither covers the
# screenshots; the plain launch (00-launch) keeps the real first-run intro on purpose. A fresh simulator is
# signed out, so the app opens with its sign-in card (a later launch shows it after a short stage): debug.js
# taps "Continue without an account" for the screens that work without one and plants a fictional signed-in
# person (requests never leave the device) for consent, analysis and recovery, which need an account.
#
# The Share Extension over the share sheet (screenshot #3) cannot be captured here; the owner takes it
# during the TestFlight pass (APP-STORE-CONNECT-METADATA §9).
#
# Optional environment:
#   APP_PATH      simulator app   (default build/sim/Build/Products/Debug-iphonesimulator/App.app)
#   CN_SCREENS    demo screens, in order (names must match web-ios/debug.js)
#   OUT_DIR       default build/screenshots      VIDEO_DIR   default build/videos
#   WAIT_SECONDS  wait after each launch before the screenshot (default 6)
#   RUNTIME_ID    simulator runtime (default: the newest iOS runtime installed)
#
# Written for the macOS system bash 3.2 (no associative arrays, no mapfile).
set -euo pipefail

APP_PATH="${APP_PATH:-build/sim/Build/Products/Debug-iphonesimulator/App.app}"
BUNDLE_ID="app.cybernetai"
OUT_DIR="${OUT_DIR:-build/screenshots}"
VIDEO_DIR="${VIDEO_DIR:-build/videos}"
WAIT_SECONDS="${WAIT_SECONDS:-6}"
CN_SCREENS="${CN_SCREENS:-check check-verdict scan-verdict consent analysis recovery learn account}"

# name | required or optional | expected screenshot size (App Store class), empty = no check
DEVICES=(
  "iPhone 17 Pro Max|required|1320x2868"
  "iPhone 17 Pro|required|1206x2622"
  "iPhone 17e|required|"
  "iPhone SE (3rd generation)|optional|"
  "iPad Air 13-inch|optional|"
)

FAILURES=0
NOTES=""

note() { NOTES="${NOTES}
- $1"; echo "$1"; }

report() { # $1 required|optional, $2 message
  if [ "$1" = "required" ]; then FAILURES=$((FAILURES + 1)); note "FAIL: $2"; else note "skipped: $2"; fi
}

[ -d "$APP_PATH" ] || { echo "No simulator app at $APP_PATH (run the 'Build for simulator' step first)."; exit 1; }
mkdir -p "$OUT_DIR" "$VIDEO_DIR"

RUNTIME_ID="${RUNTIME_ID:-$(xcrun simctl list runtimes -j | python3 -c '
import json, sys
runtimes = [r for r in json.load(sys.stdin)["runtimes"]
            if ".iOS-" in r.get("identifier", "") and r.get("isAvailable", False)]
runtimes.sort(key=lambda r: [int(x) for x in r["version"].split(".")])
print(runtimes[-1]["identifier"] if runtimes else "")')}"
[ -n "$RUNTIME_ID" ] || { echo "No iOS simulator runtime installed."; exit 1; }
echo "Runtime: $RUNTIME_ID"

devicetype_id() { # exact name, else the newest type whose name starts with it
  xcrun simctl list devicetypes -j | python3 -c '
import json, sys
want = sys.argv[1]
types = json.load(sys.stdin)["devicetypes"]
exact = [t for t in types if t["name"] == want]
prefix = sorted([t for t in types if t["name"].startswith(want)], key=lambda t: t["name"])
pick = exact or prefix
print(pick[-1]["identifier"] if pick else "")' "$1"
}

app_running() { # $1 udid
  # Simulator apps are ordinary host processes whose path contains the device's UDID, so pgrep
  # answers directly. The launchctl listing is only a fallback: on the Xcode 26 images it
  # intermittently came back without the app while it was running (build #4: CN_DEMO_READY was
  # logged, yet every iPhone 17 Pro Max launch was reported "not running").
  pgrep -f "Devices/$1/data/Containers/Bundle/Application/.*/App\.app/App" >/dev/null 2>&1 && return 0
  xcrun simctl spawn "$1" launchctl list 2>/dev/null | grep -q "UIKitApplication:${BUNDLE_ID}"
}

save_crash_logs() { # $1 slug
  mkdir -p "$OUT_DIR/crash"
  find "$HOME/Library/Logs/DiagnosticReports" -name 'App*' -newer "$APP_PATH" -exec cp {} "$OUT_DIR/crash/" \; 2>/dev/null || true
  echo "Crash logs (if any) copied to $OUT_DIR/crash for $1"
}

stop_console() { # $1 pid of a `simctl launch --console-pty` that is still attached
  kill "$1" 2>/dev/null || true
  wait "$1" 2>/dev/null || true
}

launch_and_capture() { # $1 udid, $2 slug, $3 index, $4 screen ("" = plain launch), $5 required
  local udid="$1" slug="$2" index="$3" screen="$4" required="$5" label file log console_pid waited
  label="${screen:-launch}"
  file="$OUT_DIR/$slug/$(printf '%02d' "$index")-$label.png"
  log="${file%.png}.log"
  : > "$log"
  if [ -n "$screen" ]; then
    SIMCTL_CHILD_CN_DEMO_SCREEN="$screen" xcrun simctl launch --console-pty --terminate-running-process "$udid" "$BUNDLE_ID" > "$log" 2>&1 &
  else
    xcrun simctl launch --console-pty --terminate-running-process "$udid" "$BUNDLE_ID" > "$log" 2>&1 &
  fi
  console_pid=$!
  sleep "$WAIT_SECONDS"
  if [ -n "$screen" ]; then
    waited=0
    until grep -q "CN_DEMO_READY $screen" "$log" 2>/dev/null; do
      if grep -q "CN_DEMO_FAILED $screen" "$log" 2>/dev/null || [ "$waited" -ge 20 ]; then break; fi
      sleep 1
      waited=$((waited + 1))
    done
  fi
  if ! app_running "$udid"; then
    report "$required" "$slug: the app was not running ${WAIT_SECONDS}s after launch ($label)"
    save_crash_logs "$slug"
    stop_console "$console_pid"
    return 0
  fi
  xcrun simctl io "$udid" screenshot --type=png "$file" >/dev/null
  sips -s format jpeg -s formatOptions 92 "$file" --out "${file%.png}.jpg" >/dev/null
  stop_console "$console_pid"
  if [ -n "$screen" ] && ! grep -q "CN_DEMO_READY $screen" "$log"; then
    report "$required" "$slug: demo screen \"$screen\" never reported ready ($(grep -m1 "CN_DEMO_FAILED" "$log" || echo "no CN_DEMO_READY line; see ${log#"$OUT_DIR"/}"))"
  fi
}

shoot_device() { # $1 name, $2 required|optional, $3 expected size
  local name="$1" required="$2" expected="$3" slug type_id udid video_pid index screen size first
  slug=$(echo "$name" | tr -cs 'A-Za-z0-9' '-' | sed 's/-*$//' | tr 'A-Z' 'a-z')
  type_id=$(devicetype_id "$name")
  if [ -z "$type_id" ]; then report "$required" "$name: no simulator device type on this image"; return 0; fi
  udid=$(xcrun simctl create "CN $slug" "$type_id" "$RUNTIME_ID" 2>/dev/null || true)
  if [ -z "$udid" ]; then report "$required" "$name: cannot be created on $RUNTIME_ID"; return 0; fi
  echo "== $name ($udid)"

  xcrun simctl boot "$udid"
  xcrun simctl bootstatus "$udid" -b >/dev/null
  xcrun simctl ui "$udid" appearance dark >/dev/null 2>&1 || true
  xcrun simctl status_bar "$udid" override --time 9:41 --dataNetwork wifi --wifiMode active --wifiBars 3 \
    --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100 >/dev/null 2>&1 || true
  xcrun simctl install "$udid" "$APP_PATH"
  mkdir -p "$OUT_DIR/$slug"

  xcrun simctl io "$udid" recordVideo --codec=h264 --force "$VIDEO_DIR/$slug.mp4" >/dev/null 2>&1 &
  video_pid=$!
  sleep 2

  launch_and_capture "$udid" "$slug" 0 "" "$required"
  index=0
  for screen in $CN_SCREENS; do
    index=$((index + 1))
    launch_and_capture "$udid" "$slug" "$index" "$screen" "$required"
  done

  kill -INT "$video_pid" 2>/dev/null || true
  wait "$video_pid" 2>/dev/null || true

  if [ -n "$expected" ]; then
    first=$(ls "$OUT_DIR/$slug"/*.png 2>/dev/null | head -1 || true)
    if [ -n "$first" ]; then
      size="$(sips -g pixelWidth "$first" | awk '/pixelWidth/ {print $2}')x$(sips -g pixelHeight "$first" | awk '/pixelHeight/ {print $2}')"
      [ "$size" = "$expected" ] || note "WARNING: $name screenshots are $size, App Store class expects $expected"
    fi
  fi

  xcrun simctl shutdown "$udid" >/dev/null 2>&1 || true
  xcrun simctl delete "$udid" >/dev/null 2>&1 || true
}

for entry in "${DEVICES[@]}"; do
  name="${entry%%|*}"
  rest="${entry#*|}"
  required="${rest%%|*}"
  expected="${rest#*|}"
  shoot_device "$name" "$required" "$expected"
done

echo
echo "Screenshots: $OUT_DIR    Videos: $VIDEO_DIR"
[ -n "$NOTES" ] && printf 'Notes:%s\n' "$NOTES"
if [ "$FAILURES" -gt 0 ]; then
  echo "$FAILURES required check(s) failed."
  exit 1
fi
echo "Smoke run passed on every required device."
