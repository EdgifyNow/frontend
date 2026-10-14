# Portal tenant-state and appointment-time fixes — frontend tests

Loads the real `public/js/portal.js` into a jsdom window and drives it
through the same guarded test hook the WhatsApp Embedded Signup suite uses
(`window.__EXPOSE_PORTAL_TEST_HOOKS__`, inert unless a test harness sets it
before the script loads). Not a separately maintained copy of the logic.

Covers three fixes:

1. `doLogout()` resetting every tenant-scoped cached field (`voiceSettings`
   and friends), not just the 5 originally hand-picked ones.
2. A request issued under one tenant's login that only resolves *after*
   logout/login as a different tenant cannot write its data into (or log
   out) the new tenant's live session (`sessionGeneration` in `api()`).
3. Appointment `start_at`/`end_at` — tenant wall-clock digits tagged UTC by
   convention, not real UTC instants — rendering and round-tripping through
   the edit drawer correctly regardless of the viewer's own browser
   timezone.

## Running

Needs Node.js + the one dependency here (`jsdom`), or Docker if this
machine has no local Node install:

```powershell
cd frontend\tests\js\portal-tenant-state
npm ci
node test_portal_fixes.js
```

Or via Docker, from this directory:

```powershell
docker run --rm -v "${PWD}:/work" -w /work node:20 npm ci
docker run --rm -v "${PWD}\..\..\..:/repo" -w /repo/tests/js/portal-tenant-state node:20 node test_portal_fixes.js
```

Fix 3 is timezone-sensitive by design — run it under a few different `TZ`
values to confirm it doesn't just happen to pass in whatever zone the
machine running it is in:

```powershell
docker run --rm -e TZ=America/New_York -v "${PWD}\..\..\..:/repo" -w /repo/tests/js/portal-tenant-state node:20 node test_portal_fixes.js
docker run --rm -e TZ=Asia/Kolkata -v "${PWD}\..\..\..:/repo" -w /repo/tests/js/portal-tenant-state node:20 node test_portal_fixes.js
```

Expected final line: `N/N passed (TZ=...)` with no `FAIL` lines above it.

`PORTAL_JS_PATH` can override which `portal.js` gets loaded; it defaults
to this repo's own `public/js/portal.js`.
