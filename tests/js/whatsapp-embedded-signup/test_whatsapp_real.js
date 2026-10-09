// Loads the REAL frontend/public/js/portal.js into a jsdom window and
// drives its actual launchWhatsappEmbeddedSignup/completeWhatsappEmbeddedSignup
// functions via the guarded __portalTestHooks export (see the bottom of
// portal.js) - not a separately maintained copy of the logic.

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

// Defaults to the real file's actual location relative to this test
// (frontend/tests/js/whatsapp-embedded-signup/ -> frontend/public/js/portal.js),
// so this runs correctly from a plain checkout with no env var or Docker
// volume mount needed; PORTAL_JS_PATH remains available to override (e.g.
// a differently-laid-out CI checkout, or the Docker-mounted path used
// during development of this suite).
const PORTAL_JS_PATH = process.env.PORTAL_JS_PATH || path.join(__dirname, "..", "..", "..", "public", "js", "portal.js");
const source = fs.readFileSync(PORTAL_JS_PATH, "utf8");

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error("FAIL: " + msg); failures++; }
  else { console.log("pass: " + msg); }
}

function buildPage() {
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="egApp"></div></body></html>`,
    { url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true }
  );
  const win = dom.window;
  win.EDGIFY_CONFIG = { API_BASE_URL: "http://fake-api", SESSION_IDLE_TIMEOUT_MINUTES: 10 };
  win.__EXPOSE_PORTAL_TEST_HOOKS__ = true;

  const fetchCalls = [];
  let fetchHandler = function () { return Promise.reject(new Error("no fetch handler set for this test")); };
  win.fetch = function (url, opts) {
    fetchCalls.push({ url: url, opts: opts });
    return fetchHandler(url, opts);
  };

  win.eval(source); // executes the real portal.js inside this window, including init()

  const hooks = win.__portalTestHooks;
  if (!hooks) throw new Error("__portalTestHooks was not exposed - portal.js test hook missing or guard not set before eval");

  hooks.state.token = "fake-token";
  hooks.state.whatsappConnection = { app_id: "APP1", config_id: "CFG1" };
  hooks.state.whatsappSignupInProgress = false;
  hooks.state.whatsappConnecting = false;
  // init() already ran (inside win.eval above) before state.token existed,
  // so it correctly decided there was no session and never started the
  // idle timer - simulate what a real login actually does next, so tests
  // start from a realistic "logged in, idle timer running" state.
  hooks.resetIdleTimer();

  win.FB = { login: function (cb, opts) { win.__fbLoginCall = { cb: cb, opts: opts }; } };

  function dispatchMessage(data, origin) {
    const ev = new win.MessageEvent("message", { data: data, origin: origin });
    win.dispatchEvent(ev);
  }

  function jsonResponse(status, body) {
    return Promise.resolve({
      status: status,
      ok: status >= 200 && status < 300,
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  }

  return { win, hooks, fetchCalls, dispatchMessage, jsonResponse, setFetchHandler: (fn) => { fetchHandler = fn; } };
}

function fbSuccess(code) { return { authResponse: { code: code } }; }

function lastToast(win) { return win.__portalTestHooks.state.toast; }
function clearToast(win) { win.__portalTestHooks.state.toast = null; }

const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

// ---- existing coverage, now against the real functions ----

test("coexistence FINISH, no phone_number_id -> backend called with is_coexistence=true, phone_number_id=null", async () => {
  const p = buildPage();
  let completeBody = null;
  p.setFetchHandler((url, opts) => {
    if (String(url).indexOf("/embedded-signup/complete") !== -1) {
      completeBody = JSON.parse(opts.body);
      return p.jsonResponse(200, { connected: true });
    }
    if (String(url).indexOf("/whatsapp/status") !== -1) return p.jsonResponse(200, { connected: true, phone_number: "+1555" });
    return p.jsonResponse(404, {});
  });
  p.hooks.launchWhatsappEmbeddedSignup();
  p.dispatchMessage(JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", data: { waba_id: "W1" } }), "https://www.facebook.com");
  win_cb(p)(fbSuccess("code-1"));
  await flush();
  assert(completeBody && completeBody.waba_id === "W1", "waba_id forwarded to the real backend call");
  assert(completeBody.phone_number_id === null, "phone_number_id correctly null (coexistence omits it)");
  assert(completeBody.is_coexistence === true, "is_coexistence=true for the coexistence FINISH event");
});

test("ordinary FINISH still works, is_coexistence=false, phone_number_id passed through", async () => {
  const p = buildPage();
  let completeBody = null;
  p.setFetchHandler((url, opts) => {
    if (String(url).indexOf("/embedded-signup/complete") !== -1) { completeBody = JSON.parse(opts.body); return p.jsonResponse(200, { connected: true }); }
    if (String(url).indexOf("/whatsapp/status") !== -1) return p.jsonResponse(200, { connected: true });
    return p.jsonResponse(404, {});
  });
  p.hooks.launchWhatsappEmbeddedSignup();
  p.dispatchMessage(JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { waba_id: "W7", phone_number_id: "P7" } }), "https://web.facebook.com");
  win_cb(p)(fbSuccess("code-7"));
  await flush();
  assert(completeBody.is_coexistence === false, "is_coexistence=false for ordinary FINISH");
  assert(completeBody.phone_number_id === "P7", "phone_number_id passed through when Meta does provide it");
});

test("undocumented FINISH_* event name is rejected by the allowlist", async () => {
  const p = buildPage();
  let called = false;
  p.setFetchHandler((url) => { called = true; return p.jsonResponse(200, { connected: true }); });
  p.hooks.launchWhatsappEmbeddedSignup();
  p.dispatchMessage(JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH_SOME_FUTURE_FLOW", data: { waba_id: "W11" } }), "https://www.facebook.com");
  win_cb(p)(fbSuccess("code-11"));
  // Real constant is 1500ms (WHATSAPP_SIGNUP_SESSION_INFO_WAIT_MS in the
  // actual file, not test-scaled) - an undocumented event name means
  // sessionInfo never gets set, so this runs out the real wait window.
  await sleep(1600);
  assert(!called, "an undocumented FINISH_* name never reaches the backend (allowlist, not prefix match)");
  assert(lastToast(p.win) && /cancelled or didn't complete/.test(lastToast(p.win).msg), "falls through to the normal cancellation path");
});

// ---- new, per this round's corrections ----

test("CANCEL with no SDK callback ever firing still terminates the attempt", async () => {
  const p = buildPage();
  let called = false;
  p.setFetchHandler(() => { called = true; return p.jsonResponse(200, { connected: true }); });
  p.hooks.launchWhatsappEmbeddedSignup();
  assert(p.hooks.state.whatsappSignupInProgress === true, "in-progress flag set after launch");
  p.dispatchMessage(JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "CANCEL" }), "https://www.facebook.com");
  // Deliberately never invoke win.__fbLoginCall.cb - simulates FB.login's
  // callback never firing on this cancel path at all.
  await sleep(10);
  assert(!called, "backend never called");
  assert(p.hooks.state.whatsappSignupInProgress === false, "in-progress flag cleared by CANCEL alone, with no SDK callback");
  assert(lastToast(p.win) && lastToast(p.win).isError, "cancellation toast shown");
});

test("SDK callback arrives AFTER a CANCEL already settled the attempt - must not submit or toast again", async () => {
  const p = buildPage();
  let callCount = 0;
  p.setFetchHandler(() => { callCount++; return p.jsonResponse(200, { connected: true }); });
  p.hooks.launchWhatsappEmbeddedSignup();
  p.dispatchMessage(JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "CANCEL" }), "https://www.facebook.com");
  await sleep(5);
  const toastAfterCancel = lastToast(p.win);
  clearToast(p.win);
  // Now the SDK callback finally fires, late, with a real code.
  win_cb(p)(fbSuccess("late-code"));
  await sleep(20);
  assert(callCount === 0, "a late SDK callback after CANCEL never calls the backend");
  assert(lastToast(p.win) === null, "no second toast from the late callback");
  assert(toastAfterCancel && toastAfterCancel.isError, "the original cancellation toast did fire, exactly once, before the late callback");
});

test("POST success followed by status GET failure - never shows Connected, connecting cleared, real error shown", async () => {
  const p = buildPage();
  let statusCalled = false;
  p.setFetchHandler((url) => {
    if (String(url).indexOf("/embedded-signup/complete") !== -1) return p.jsonResponse(200, { connected: true });
    if (String(url).indexOf("/whatsapp/status") !== -1) { statusCalled = true; return p.jsonResponse(500, { detail: "status lookup failed" }); }
    return p.jsonResponse(404, {});
  });
  p.hooks.launchWhatsappEmbeddedSignup();
  p.dispatchMessage(JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", data: { waba_id: "W-FAIL" } }), "https://www.facebook.com");
  win_cb(p)(fbSuccess("code-fail"));
  await flush();
  assert(statusCalled, "the follow-up status GET was actually attempted");
  assert(p.hooks.state.whatsappConnecting === false, "connecting flag cleared after the GET fails");
  assert(!(lastToast(p.win).msg === "WhatsApp connected"), "never shows the success message when the status GET fails");
  assert(lastToast(p.win).isError && /status lookup failed/.test(lastToast(p.win).msg), "the real status-fetch error is surfaced");
});

test("POST success followed by status connected:false - never shows Connected, handled explicitly", async () => {
  const p = buildPage();
  p.setFetchHandler((url) => {
    if (String(url).indexOf("/embedded-signup/complete") !== -1) return p.jsonResponse(200, { connected: true });
    if (String(url).indexOf("/whatsapp/status") !== -1) return p.jsonResponse(200, { connected: false });
    return p.jsonResponse(404, {});
  });
  p.hooks.launchWhatsappEmbeddedSignup();
  p.dispatchMessage(JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", data: { waba_id: "W-NC" } }), "https://www.facebook.com");
  win_cb(p)(fbSuccess("code-nc"));
  await flush();
  assert(p.hooks.state.whatsappConnecting === false, "connecting flag cleared");
  assert(lastToast(p.win).msg !== "WhatsApp connected", "does not claim success when the status read says connected:false");
  assert(lastToast(p.win).isError === true, "connected:false is surfaced as a problem, not silently accepted");
});

test("connecting stays true through the follow-up GET (not cleared right after the POST)", async () => {
  const p = buildPage();
  let resolveStatus;
  p.setFetchHandler((url) => {
    if (String(url).indexOf("/embedded-signup/complete") !== -1) return p.jsonResponse(200, { connected: true });
    if (String(url).indexOf("/whatsapp/status") !== -1) return new Promise((res) => { resolveStatus = res; });
    return p.jsonResponse(404, {});
  });
  p.hooks.launchWhatsappEmbeddedSignup();
  p.dispatchMessage(JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", data: { waba_id: "W-SLOW" } }), "https://www.facebook.com");
  win_cb(p)(fbSuccess("code-slow"));
  await sleep(15); // POST has resolved by now, status GET is still pending
  assert(p.hooks.state.whatsappConnecting === true, "still connecting while the status GET is in flight - POST success alone never clears it");
  resolveStatus({ status: 200, ok: true, text: () => Promise.resolve(JSON.stringify({ connected: true })) });
  await flush();
  assert(p.hooks.state.whatsappConnecting === false, "connecting cleared only once the status GET actually resolves");
});

test("duplicate-launch prevention still holds on the real function", async () => {
  const p = buildPage();
  p.setFetchHandler(() => p.jsonResponse(200, { connected: true }));
  p.hooks.launchWhatsappEmbeddedSignup();
  const firstCb = p.win.__fbLoginCall;
  p.hooks.launchWhatsappEmbeddedSignup();
  p.hooks.launchWhatsappEmbeddedSignup();
  assert(p.win.__fbLoginCall === firstCb, "FB.login is never invoked a second time while a signup is already in progress");
});

// ---- new, per the committing-review round ----

test("SDK callback fires BEFORE the completion message arrives - real poll recovers it", async () => {
  const p = buildPage();
  let completeBody = null;
  p.setFetchHandler((url, opts) => {
    if (String(url).indexOf("/embedded-signup/complete") !== -1) { completeBody = JSON.parse(opts.body); return p.jsonResponse(200, { connected: true }); }
    if (String(url).indexOf("/whatsapp/status") !== -1) return p.jsonResponse(200, { connected: true });
    return p.jsonResponse(404, {});
  });
  p.hooks.launchWhatsappEmbeddedSignup();
  win_cb(p)(fbSuccess("code-race")); // callback fires first - no message yet, so the real poll loop starts
  await sleep(10);
  assert(completeBody === null, "backend not called yet right after the callback - correctly waiting on the real poll loop");
  // Now the message arrives mid-wait, well inside the real 1500ms window.
  p.dispatchMessage(JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", data: { waba_id: "W-RACE" } }), "https://www.facebook.com");
  await sleep(150); // comfortably past one 100ms poll tick
  assert(completeBody && completeBody.waba_id === "W-RACE", "the real poll loop picks up the late message and completes the signup");
  assert(completeBody.is_coexistence === true, "is_coexistence correctly read from the late message's event name");
});

test("launching again while the backend POST/status GET is still pending is blocked", async () => {
  const p = buildPage();
  let completeCalls = 0;
  let resolveStatus;
  p.setFetchHandler((url) => {
    if (String(url).indexOf("/embedded-signup/complete") !== -1) { completeCalls++; return p.jsonResponse(200, { connected: true }); }
    if (String(url).indexOf("/whatsapp/status") !== -1) return new Promise((res) => { resolveStatus = res; });
    return p.jsonResponse(404, {});
  });
  p.hooks.launchWhatsappEmbeddedSignup();
  p.dispatchMessage(JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", data: { waba_id: "W-PENDING" } }), "https://www.facebook.com");
  win_cb(p)(fbSuccess("code-pending"));
  await sleep(15); // the Meta popup phase is over (whatsappSignupInProgress already false); the status GET is still in flight
  assert(p.hooks.state.whatsappSignupInProgress === false, "popup-phase flag already cleared by this point");
  assert(p.hooks.state.whatsappConnecting === true, "still connecting - the backend confirmation is still in flight");
  const fbCallBeforeSecondAttempt = p.win.__fbLoginCall;
  p.hooks.launchWhatsappEmbeddedSignup(); // a second click here, before the first attempt's backend call has resolved
  assert(p.win.__fbLoginCall === fbCallBeforeSecondAttempt, "FB.login is not invoked again - whatsappConnecting alone blocks a second launch");
  assert(completeCalls === 1, "the backend completion endpoint was never called a second time either");
  resolveStatus({ status: 200, ok: true, text: () => Promise.resolve(JSON.stringify({ connected: true })) });
  await flush();
});

test("idle timer resumes deterministically after a successful completion", async () => {
  const p = buildPage();
  p.setFetchHandler(() => p.jsonResponse(200, { connected: true }));
  assert(p.hooks.hasActiveIdleTimer(), "idle timer running before launch (sanity check on the harness itself)");
  p.hooks.launchWhatsappEmbeddedSignup();
  assert(!p.hooks.hasActiveIdleTimer(), "idle timer stopped once the popup launches");
  p.dispatchMessage(JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", data: { waba_id: "W-IDLE-OK" } }), "https://www.facebook.com");
  win_cb(p)(fbSuccess("code-idle-ok"));
  await flush();
  assert(p.hooks.hasActiveIdleTimer(), "idle timer resumed right after a successful completion, not left stopped");
});

test("idle timer resumes deterministically after a backend failure", async () => {
  const p = buildPage();
  p.setFetchHandler((url) => {
    if (String(url).indexOf("/embedded-signup/complete") !== -1) return p.jsonResponse(502, { detail: "Meta rejected the exchange" });
    return p.jsonResponse(404, {});
  });
  p.hooks.launchWhatsappEmbeddedSignup();
  assert(!p.hooks.hasActiveIdleTimer(), "idle timer stopped once the popup launches");
  p.dispatchMessage(JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", data: { waba_id: "W-IDLE-FAIL" } }), "https://www.facebook.com");
  win_cb(p)(fbSuccess("code-idle-fail"));
  await flush();
  assert(p.hooks.hasActiveIdleTimer(), "idle timer resumed right after a backend failure, not left stopped");
  assert(lastToast(p.win).isError && /Meta rejected the exchange/.test(lastToast(p.win).msg), "the real backend error is still what's shown");
});

// ---- plumbing ----

function win_cb(p) {
  if (!p.win.__fbLoginCall) throw new Error("FB.login was never called - launchWhatsappEmbeddedSignup likely returned early");
  return p.win.__fbLoginCall.cb;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function flush() { await sleep(0); await sleep(0); await sleep(0); }

(async () => {
  for (const t of pending) {
    try {
      await t.fn();
    } catch (e) {
      failures++;
      console.error("FAIL (exception): " + t.name + " -> " + (e && e.stack || e));
    }
  }
  console.log(failures ? ("\n" + failures + " TEST(S) FAILED") : "\nALL TESTS PASSED");
  // Force exit: the real portal.js sets a real 10-minute idle-timer
  // setTimeout (and jsdom's own pretendToBeVisual keeps timers alive too),
  // so the process would otherwise hang well past when the tests actually
  // finished instead of exiting naturally.
  process.exit(failures ? 1 : 0);
})();
