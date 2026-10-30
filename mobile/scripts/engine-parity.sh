#!/usr/bin/env bash
# Engine parity in the simulator's WebKit (BUILD-PLAN §10, §11.2).
# Runs on the Codemagic Mac after "Build for simulator" (codemagic.yaml, ios-simulator):
#
#   bash mobile/scripts/engine-parity.sh
#
# The app, the Share Extension and the website all run the same public/cybernet-engine.js. This
# launches the Debug simulator app with CN_ENGINE_SELFTEST=1. In Debug builds MainViewController
# hands that to the page as window.CN_ENGINE_SELFTEST, and web-ios/debug.js (debug bundle only) runs
# every case of mobile/tests/engine-fixtures.json (the Node results) through the engine in WebKit,
# then logs one line "CN_ENGINE_SELFTEST_RESULT {json}". Capacitor prints console lines to the app's
# standard output in Debug builds, which `simctl launch --console-pty` captures.
#
# Fails if the line never appears, if any case differs (band or headline), if the case count is not
# the fixture count, or if the engine version differs from the fixtures' version.
#
# Optional environment:
#   APP_PATH     simulator app (default build/sim/Build/Products/Debug-iphonesimulator/App.app)
#   DEVICE_NAME  simulator device type (default "iPhone 17 Pro")
#   TIMEOUT      seconds to wait for the result (default 120)
#   OUT_DIR      where the console log and result are kept (default build/parity)
#
# Written for the macOS system bash 3.2.
set -euo pipefail

APP_PATH="${APP_PATH:-build/sim/Build/Products/Debug-iphonesimulator/App.app}"
BUNDLE_ID="app.cybernetai"
DEVICE_NAME="${DEVICE_NAME:-iPhone 17 Pro}"
TIMEOUT="${TIMEOUT:-120}"
OUT_DIR="${OUT_DIR:-build/parity}"
FIXTURES="mobile/tests/engine-fixtures.json"

[ -d "$APP_PATH" ] || { echo "No simulator app at $APP_PATH (run the 'Build for simulator' step first)."; exit 1; }
[ -f "$FIXTURES" ] || { echo "Missing $FIXTURES."; exit 1; }
[ -f "$APP_PATH/public/ios/debug.js" ] || { echo "The simulator app has no ios/debug.js: build the web bundle with --debug."; exit 1; }
[ -f "$APP_PATH/public/ios/engine-fixtures.json" ] || { echo "The simulator app has no ios/engine-fixtures.json."; exit 1; }
cmp -s "$APP_PATH/public/cybernet-engine.js" public/cybernet-engine.js || { echo "The app's engine differs from public/cybernet-engine.js."; exit 1; }
mkdir -p "$OUT_DIR"

RUNTIME_ID="$(xcrun simctl list runtimes -j | python3 -c '
import json, sys
runtimes = [r for r in json.load(sys.stdin)["runtimes"]
            if ".iOS-" in r.get("identifier", "") and r.get("isAvailable", False)]
runtimes.sort(key=lambda r: [int(x) for x in r["version"].split(".")])
print(runtimes[-1]["identifier"] if runtimes else "")')"
[ -n "$RUNTIME_ID" ] || { echo "No iOS simulator runtime installed."; exit 1; }

TYPE_ID="$(xcrun simctl list devicetypes -j | python3 -c '
import json, sys
want = sys.argv[1]
types = json.load(sys.stdin)["devicetypes"]
exact = [t for t in types if t["name"] == want]
iphones = sorted([t for t in types if t["name"].startswith("iPhone")], key=lambda t: t["name"])
pick = exact or iphones
print(pick[-1]["identifier"] if pick else "")' "$DEVICE_NAME")"
[ -n "$TYPE_ID" ] || { echo "No iPhone simulator device type on this image."; exit 1; }

UDID="$(xcrun simctl create "CN parity" "$TYPE_ID" "$RUNTIME_ID")"
cleanup() {
  [ -n "${CONSOLE_PID:-}" ] && kill "$CONSOLE_PID" 2>/dev/null || true
  xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true
  xcrun simctl delete "$UDID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Simulator: $DEVICE_NAME on $RUNTIME_ID ($UDID)"
xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID" -b >/dev/null
xcrun simctl install "$UDID" "$APP_PATH"

LOG="$OUT_DIR/console.log"
: > "$LOG"
SIMCTL_CHILD_CN_ENGINE_SELFTEST=1 xcrun simctl launch --console-pty --terminate-running-process "$UDID" "$BUNDLE_ID" > "$LOG" 2>&1 &
CONSOLE_PID=$!

waited=0
until grep -q "CN_ENGINE_SELFTEST_RESULT {" "$LOG" 2>/dev/null; do
  if [ "$waited" -ge "$TIMEOUT" ]; then
    echo "FAILED: no CN_ENGINE_SELFTEST_RESULT line after ${TIMEOUT}s. Last console lines:"
    tail -40 "$LOG" || true
    exit 1
  fi
  sleep 2
  waited=$((waited + 2))
done

grep -m1 -o "CN_ENGINE_SELFTEST_RESULT {.*" "$LOG" | sed 's/^CN_ENGINE_SELFTEST_RESULT //' > "$OUT_DIR/result.json"
python3 - "$OUT_DIR/result.json" "$FIXTURES" <<'PY'
import json, sys
raw = open(sys.argv[1], encoding="utf-8").read().strip()
try:
    result = json.loads(raw)
except ValueError:
    print("FAILED: the result line is not complete JSON:", raw[:400])
    sys.exit(1)
fixtures = json.load(open(sys.argv[2], encoding="utf-8"))
expected = len(fixtures["cases"])
problems = []
if result.get("error"):
    problems.append("self-test error: %s" % result["error"])
if result.get("cases") != expected:
    problems.append("ran %s cases, fixtures have %s" % (result.get("cases"), expected))
if result.get("engineVersion") != fixtures.get("engineVersion"):
    problems.append("engine %s, fixtures %s (run node mobile/tests/make-engine-fixtures.mjs)" % (result.get("engineVersion"), fixtures.get("engineVersion")))
if result.get("diffCount", len(result.get("diffs") or [])) or not result.get("ok"):
    problems.append("%s case(s) differ between Node and WebKit" % result.get("diffCount", "?"))
    for diff in (result.get("diffs") or [])[:10]:
        print("  %s: node %s, webkit %s" % (diff.get("id"), diff.get("node"), diff.get("webkit")))
print("WebKit:", result.get("userAgent", "?"))
if problems:
    for p in problems:
        print("FAILED:", p)
    sys.exit(1)
print("Engine parity: %d/%d cases identical (engine %s)." % (expected, expected, result.get("engineVersion")))
PY
