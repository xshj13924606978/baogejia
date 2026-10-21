#!/usr/bin/env bash
set -euo pipefail
umask 077
MODE=${1:?mode}
RELEASE=${2:?release}
EXPECTED_SHA=${3:?sha}
EXPECTED_BUILD=${4:?build}
[[ "$RELEASE" =~ ^health-20260928-[0-9]{6}$ ]] || exit 2
[[ "$EXPECTED_SHA" =~ ^[a-f0-9]{64}$ ]] || exit 2
[[ "$EXPECTED_BUILD" =~ ^[A-Za-z0-9_-]+$ ]] || exit 2
BASE=/home/ubuntu/apps/quote-project
APP="$BASE/quote-app"
STAGE="$BASE/quote-app.stage-$RELEASE"
BACKUP="$BASE/quote-app.backup-$RELEASE"
PACKAGE="$BASE/releases/$RELEASE.tgz"
exec 9>"$BASE/.health-release.lock"
flock -n 9 || exit 3
check_current() {
  test -d "$APP" && test ! -L "$APP" && test ! -e "$APP/.git"
  test -f "$APP/server.js" && test -f "$APP/.env.production"
  test "$(sha256sum "$APP/.env.production" | cut -d ' ' -f1)" = 'a5e3ff3f5e7d7692b1c64b2cb4d39fd7221e7a239ba55b5cec61ca39884f91ca'
  test "$(cat "$APP/.next-production/BUILD_ID")" = '7iC9-mjjrYx6bOCaovUaL'
}
if [ "$MODE" = prepare ]; then
  check_current
  test ! -e "$STAGE" && test ! -e "$BACKUP"
  echo "$EXPECTED_SHA  $PACKAGE" | sha256sum -c -
  mkdir "$STAGE"
  tar xzf "$PACKAGE" -C "$STAGE"
  test "$(cat "$STAGE/.next-production/BUILD_ID")" = "$EXPECTED_BUILD"
  test -f "$STAGE/server.js"
  cp -p "$APP/.env.production" "$STAGE/.env.production"
  chmod 600 "$STAGE/.env.production"
  for item in openclaw-env .cache eng.traineddata chi_sim.traineddata; do
    if [ -e "$APP/$item" ]; then cp -a "$APP/$item" "$STAGE/"; fi
  done
  # Preserve old content-addressed chunks for browsers with an already-open page.
  cp -an "$APP/.next-production/static/." "$STAGE/.next-production/static/"
  printf '%s\n' 'Managed production deployment; do not git clone/init/pull here.' > "$STAGE/.deploy-lock"
  chmod 444 "$STAGE/.deploy-lock"
  cmp -s "$APP/.env.production" "$STAGE/.env.production"
  test -f "$STAGE/src/lib/openclaw-cnc/bridge.py"
  test -f "$STAGE/.next-production/worker-script/node/index.js"
  cd "$STAGE"
  node -e "require('bcrypt'); require('module').createRequire(require.resolve('next/package.json'))('sharp'); console.log('NATIVE_MODULES_OK')"
  # Bind only loopback; do not register a second set of scheduled jobs.
  HOSTNAME=127.0.0.1 PORT=5001 NODE_APP_INSTANCE=release-check node --env-file=.env.production server.js > "$BASE/releases/$RELEASE-preflight.log" 2>&1 &
  pid=$!
  cleanup() { kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; }
  trap cleanup EXIT
  healthy=0
  for i in {1..20}; do
    if curl -fsS --max-time 10 http://127.0.0.1:5001/api/health > "$BASE/releases/$RELEASE-health.json"; then healthy=1; break; fi
    kill -0 "$pid" || exit 4
    sleep 2
  done
  test "$healthy" = 1
  for route in login register; do
    test "$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "http://127.0.0.1:5001/$route")" = 200
  done
  test "$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:5001/api/auth/verify-session)" = 401
  test "$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -H 'x-user-token: invalid-release-check' -d '{}' http://127.0.0.1:5001/api/auth/sync-user)" = 401
  echo PREPARE_PASS
elif [ "$MODE" = activate ]; then
  check_current
  test -d "$STAGE" && test ! -L "$STAGE" && test ! -e "$BACKUP"
  test "$(cat "$STAGE/.next-production/BUILD_ID")" = "$EXPECTED_BUILD"
  cmp -s "$APP/.env.production" "$STAGE/.env.production"
  switched=0
  rollback_on_error() {
    code=$?
    trap - EXIT
    if [ "$code" -ne 0 ] && [ -d "$BACKUP" ]; then
      if [ -d "$APP" ]; then mv "$APP" "$BASE/quote-app.failed-$RELEASE"; fi
      mv "$BACKUP" "$APP"
      pm2 restart quote-app
      echo ROLLED_BACK
    fi
    exit "$code"
  }
  trap rollback_on_error EXIT
  # Capture late cache updates immediately before the switch.
  if [ -d "$APP/.cache" ]; then cp -a "$APP/.cache/." "$STAGE/.cache/"; fi
  mv "$APP" "$BACKUP"
  mv "$STAGE" "$APP"
  pm2 restart quote-app
  healthy=0
  for i in {1..20}; do
    if curl -fsS --max-time 10 http://127.0.0.1:5000/api/health > "$BASE/releases/$RELEASE-live-health.json"; then healthy=1; break; fi
    sleep 2
  done
  test "$healthy" = 1
  for route in login register; do
    test "$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "http://127.0.0.1:5000/$route")" = 200
  done
  test "$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:5000/api/auth/verify-session)" = 401
  test "$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -H 'x-user-token: invalid-release-check' -d '{}' http://127.0.0.1:5000/api/auth/sync-user)" = 401
  test "$(cat "$APP/.next-production/BUILD_ID")" = "$EXPECTED_BUILD"
  cmp -s "$APP/.env.production" "$BACKUP/.env.production"
  echo ACTIVATE_PASS
  echo "BACKUP=$BACKUP"
elif [ "$MODE" = rollback ]; then
  test -d "$BACKUP" && test ! -L "$BACKUP"
  test -d "$APP" && test ! -L "$APP"
  test "$(cat "$APP/.next-production/BUILD_ID")" = "$EXPECTED_BUILD"
  test "$(cat "$BACKUP/.next-production/BUILD_ID")" = '7iC9-mjjrYx6bOCaovUaL'
  test ! -e "$BASE/quote-app.failed-$RELEASE"
  mv "$APP" "$BASE/quote-app.failed-$RELEASE"
  mv "$BACKUP" "$APP"
  pm2 restart quote-app
  for i in {1..20}; do
    if curl -fsS --max-time 10 http://127.0.0.1:5000/api/health > /dev/null; then echo ROLLBACK_PASS; exit 0; fi
    sleep 2
  done
  exit 5
else
  exit 2
fi
