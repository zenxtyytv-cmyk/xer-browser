#!/usr/bin/env bash
# Runs every suite. Usage: bash test/run-all.sh   (needs xvfb on Linux; on Windows/macOS run the suites directly)
cd "$(dirname "$0")/.."
ELEC="npx electron"; FLAGS="--no-sandbox --disable-gpu"
RUN="xvfb-run -a"; command -v xvfb-run >/dev/null || RUN=""
fail=0; total=0
run() { name="$1"; shift; total=$((total+1)); out=$(timeout 180 $RUN "$@" 2>&1); code=$?
  p=$(echo "$out" | grep -c '^PASS'); f=$(echo "$out" | grep -c '^FAIL')
  if [ $code -ne 0 ] || [ $f -gt 0 ]; then echo "FAIL  $name  (pass=$p fail=$f exit=$code)"; echo "$out" | grep '^FAIL' | head -5; fail=$((fail+1)); else echo "ok    $name  ($p checks)"; fi; }
run suggest   node test/suggest.js
run gaming    node test/gaming.js
run store     $ELEC test/store.js $FLAGS
run smoke     $ELEC test/smoke.js $FLAGS
run features  $ELEC test/features.js $FLAGS
run reader    $ELEC test/reader.js $FLAGS
run downloads $ELEC test/downloads.js $FLAGS
run pins      $ELEC test/pins.js $FLAGS
run actions   $ELEC test/actions.js $FLAGS
run e2e       node test/e2e.js
run security  node test/security.js
run session   node test/session.js
run groups    node test/groups.js
run taborder  node test/taborder.js
run reorder   node test/reorder.js
run gamemode  node test/gamemode.js
run split     node test/split.js
run splitlive node test/splitlive.js
run readersafe node test/readersafe.js
run readerlive node test/readerlive.js
run plan      node test/plan.js
run planlive  node test/planlive.js

echo; [ $fail -eq 0 ] && echo "ALL $total SUITES PASSED" || echo "$fail of $total SUITES FAILED"
exit $fail
