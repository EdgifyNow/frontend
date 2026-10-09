# WhatsApp Embedded Signup completion — frontend tests

Loads the real `public/js/portal.js` into a jsdom window and calls its
actual `launchWhatsappEmbeddedSignup`/`completeWhatsappEmbeddedSignup`
functions directly, through a small guarded test hook at the bottom of
that file (`window.__EXPOSE_PORTAL_TEST_HOOKS__`, inert unless a test
harness sets it before the script loads). Not a separately maintained
copy of the logic.

## Running

Needs Node.js + the one dependency here (`jsdom`), or Docker if this
machine has no local Node install:

```powershell
cd frontend\tests\js\whatsapp-embedded-signup
npm ci
node test_whatsapp_real.js
```

Or via Docker, from this directory:

```powershell
docker run --rm -v "${PWD}:/work" -w /work node:20 npm ci
docker run --rm -v "${PWD}/..\..\..:/repo" -w /repo/tests/js/whatsapp-embedded-signup node:20 node test_whatsapp_real.js
```

Expected final line: `ALL TESTS PASSED`. Console lines before that are the
feature's own diagnostic logging firing during the test run (expected
noise, not failures).

`PORTAL_JS_PATH` can override which `portal.js` gets loaded; it defaults
to this repo's own `public/js/portal.js`.
