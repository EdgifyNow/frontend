// Loads the REAL frontend/public/js/portal.js into a jsdom window (same
// approach as tests/js/whatsapp-embedded-signup/test_whatsapp_real.js) and
// drives it via the guarded __portalTestHooks export, to verify two fixes:
//
//   1. doLogout() no longer leaves tenant-scoped caches (voiceSettings and
//      friends) sitting in `state` for the next tenant who logs in, in the
//      same tab, to inherit.
//   1b. A request issued under one tenant's login that only resolves AFTER
//      logout/login as a different tenant cannot write its data into (or
//      log out) the new tenant's live session - see sessionGeneration in
//      api()/doLogout().
//   2. Appointment start_at/end_at - which are tenant wall-clock digits
//      tagged UTC by convention, not real UTC instants - are displayed and
//      edited as those same digits, not re-interpreted through whatever
//      timezone this test happens to run in. Run this file under several
//      different TZ values (see run.sh) to prove that.

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

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

  win.eval(source);

  const hooks = win.__portalTestHooks;
  if (!hooks) throw new Error("__portalTestHooks was not exposed");

  return { win, hooks, fetchCalls, setFetchHandler: (fn) => { fetchHandler = fn; } };
}

const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

// ---- Fix 1: doLogout() resets every cached, tenant-scoped field ----

test("doLogout clears voiceSettings (and every other lazily-cached field), not just the 5 originally hand-picked ones", () => {
  const { hooks } = buildPage();
  const original = JSON.stringify(hooks.state); // captured before anything is set, for the "defaults" comparison below

  hooks.state.token = "fake-token";
  hooks.state.user = { id: "u1", role: "client" };
  hooks.state.leads = [{ id: "l1" }];
  hooks.state.contacts = [{ id: "c1" }];
  hooks.state.tenants = [{ id: "t1" }];
  // The actual bug: these were never cleared by the old doLogout().
  hooks.state.voiceSettings = { welcome_message: "tenant A's message", business_hours: { mon: { open: "09:00", close: "17:00" } } };
  hooks.state.voiceSettingsOpen = true;
  hooks.state.smsSettings = { foo: "bar" };
  hooks.state.smsActivity = [{ id: "s1" }];
  hooks.state.voiceCaptures = [{ id: "v1" }];
  hooks.state.whatsappConnection = { app_id: "APP1" };
  hooks.state.widgetKey = "wk_123";
  hooks.state.integrationConnections = { google_calendar: true };
  hooks.state.tenantSelf = { id: "t1", voice_enabled: true };
  hooks.state.allAppointments = [{ id: "a1" }];
  hooks.state.leadAppointments = [{ id: "a1" }];
  hooks.state.view = "tenantDetail";

  hooks.doLogout();

  assert(hooks.state.token === null, "token cleared");
  assert(hooks.state.user === null, "user cleared");
  assert(hooks.state.leads === null, "leads cleared (pre-existing behavior)");
  assert(hooks.state.voiceSettings === null, "voiceSettings cleared - this is the actual bug fix");
  assert(hooks.state.voiceSettingsOpen === false, "voiceSettingsOpen reset to collapsed");
  assert(hooks.state.smsSettings === null, "smsSettings cleared");
  assert(hooks.state.smsActivity === null, "smsActivity cleared");
  assert(hooks.state.voiceCaptures === null, "voiceCaptures cleared");
  assert(hooks.state.whatsappConnection === null, "whatsappConnection cleared");
  assert(hooks.state.widgetKey === undefined, "widgetKey reset to not-fetched (undefined)");
  assert(hooks.state.integrationConnections === null, "integrationConnections cleared");
  assert(hooks.state.tenantSelf === null, "tenantSelf cleared");
  assert(hooks.state.allAppointments === null, "allAppointments cleared");
  assert(hooks.state.leadAppointments === null, "leadAppointments cleared");
  assert(hooks.state.view === "dashboard", "view reset to dashboard");
  assert(hooks.state.booting === false, "booting left false so the login form shows, not an infinite loading screen");
  assert(JSON.stringify(hooks.state) === original, "post-logout state is byte-for-byte the same as a fresh page load's initial state");
});

test("the next tenant's login, in the same tab, no longer inherits the previous tenant's cached voiceSettings", () => {
  const { hooks } = buildPage();
  // Simulate: logged in as tenant A, opened Voice Settings (now cached).
  hooks.state.token = "token-a";
  hooks.state.voiceSettings = { business_hours: { mon: { open: "09:00", close: "17:00" } } };
  hooks.state.voiceSettingsOpen = true;

  hooks.doLogout();
  // Simulate: logged in as tenant B, in the same tab (no page reload).
  hooks.state.token = "token-b";
  hooks.state.user = { id: "tenant-b-user" };

  assert(hooks.state.voiceSettings === null, "tenant B's panel will see voiceSettings===null and genuinely refetch, instead of silently reusing tenant A's cached (and possibly blank) hours");
});

// ---- Fix 1b: a request issued under tenant A that only resolves AFTER
// logout/login as tenant B must not be allowed to write into tenant B's
// live state. Clearing caches on logout (above) doesn't prevent this on
// its own - an in-flight promise's .then() reads the `state` variable
// fresh when it finally runs, not a snapshot from when the request was
// sent, so without a guard it would write tenant A's data straight into
// whatever state object exists by the time the slow response lands. ----

test("a delayed response from tenant A's session cannot update tenant B's session after logout/login", () => {
  const { win, hooks, setFetchHandler } = buildPage();

  let resolveFetch;
  const pendingFetch = new Promise((resolve) => { resolveFetch = resolve; });
  setFetchHandler(() => pendingFetch);

  // Tenant A is logged in and requests Voice Settings - the request goes
  // out but the server (deliberately) never answers yet.
  hooks.state.token = "token-a";
  hooks.loadVoiceSettings();

  // Before that response arrives, the admin logs out and a different
  // tenant (B) logs in, in the same tab - exactly the scenario from the
  // real incident (a new client tested, then the working tenant's panel
  // went blank).
  hooks.doLogout();
  hooks.state.token = "token-b";
  hooks.state.user = { id: "tenant-b-user", role: "client" };

  // NOW tenant A's slow response finally lands, with tenant A's real
  // (different) business hours.
  resolveFetch({
    status: 200,
    ok: true,
    text: () => Promise.resolve(JSON.stringify({
      welcome_message: "tenant A's message",
      business_hours: { mon: { open: "09:00", close: "17:00" } },
    })),
  });

  // Flush the real microtask chain api() -> res.text() -> JSON.parse ->
  // the stale-generation check -> (should-be-suppressed) .then(d => state.voiceSettings = d).
  return Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve()).then(() => Promise.resolve()).then(() => {
    assert(hooks.state.token === "token-b", "still logged in as tenant B, not logged out by the stale response");
    assert(hooks.state.voiceSettings === null, "tenant A's late response did NOT get written into tenant B's live state - stays null until tenant B's own panel open genuinely refetches");
    assert(win.document.body.innerHTML.indexOf("tenant A's message") === -1, "tenant A's data never reached the rendered page under tenant B's session");
  });
});

test("a delayed 401 from tenant A's now-invalid token does not force-logout tenant B's active session", () => {
  const { hooks, setFetchHandler } = buildPage();

  let resolveFetch;
  const pendingFetch = new Promise((resolve) => { resolveFetch = resolve; });
  setFetchHandler(() => pendingFetch);

  hooks.state.token = "token-a";
  hooks.loadVoiceSettings();

  hooks.doLogout();
  hooks.state.token = "token-b";
  hooks.state.user = { id: "tenant-b-user", role: "client" };

  // Tenant A's token is invalid now (it was logged out) - the server
  // finally gets around to answering with a 401 for that old request.
  resolveFetch({ status: 401, ok: false, text: () => Promise.resolve("") });

  return Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve()).then(() => Promise.resolve()).then(() => {
    assert(hooks.state.token === "token-b", "tenant B's session survives a stale 401 that actually belongs to tenant A's old request");
  });
});

// ---- Fix 2: appointment start_at/end_at render as wall-clock digits, not shifted by the viewer's own timezone ----

test("fmtApptDateTime/fmtApptTime print the stored digits as-is, regardless of the host timezone", () => {
  const { hooks } = buildPage();
  // 2026-10-12T16:00:00Z is "4pm" per the tenant wall-clock convention -
  // under the old fmtDate/fmtTime (no timeZone:"UTC"), this would print
  // differently depending on TZ (e.g. 12pm under America/New_York/EDT).
  const dt = hooks.fmtApptDateTime("2026-10-12T16:00:00Z");
  const t = hooks.fmtApptTime("2026-10-12T16:00:00Z");
  assert(/4:00/.test(dt) && /PM/i.test(dt), "fmtApptDateTime shows 4:00 PM for 16:00Z regardless of TZ env (got: " + dt + ", TZ=" + process.env.TZ + ")");
  assert(/4:00/.test(t) && /PM/i.test(t), "fmtApptTime shows 4:00 PM for 16:00Z regardless of TZ env (got: " + t + ", TZ=" + process.env.TZ + ")");

  const midnight = hooks.fmtApptTime("2026-10-12T00:00:00Z");
  assert(/12:00/.test(midnight) && /AM/i.test(midnight), "midnight wall-clock digits print as 12:00 AM, not shifted into the previous/next day (got: " + midnight + ")");
});

// ---- Fix 2 continued: the appointment edit drawer's prefill and save round-trip ----

function openApptDrawer(hooks, appt) {
  hooks.state.token = "fake-token";
  hooks.state.user = { id: "u1", role: "client", email: "owner@example.com" };
  hooks.state.booting = false;
  hooks.state.allAppointments = [appt];
  hooks.state.appointmentDrawerId = appt.id;
  hooks.render();
}

test("the appointment edit drawer prefills the datetime-local input with the raw wall-clock digits, not a timezone-shifted value", () => {
  const { win, hooks } = buildPage();
  openApptDrawer(hooks, { id: "a1", status: "scheduled", start_at: "2026-10-12T16:00:00Z", end_at: "2026-10-12T16:30:00Z", contact: {} });

  const startInput = win.document.getElementById("egApptDrawerStart");
  const endInput = win.document.getElementById("egApptDrawerEnd");
  assert(startInput.value === "2026-10-12T16:00", "start input shows 16:00 (4pm wall-clock), not shifted by TZ=" + process.env.TZ + " (got: " + startInput.value + ")");
  assert(endInput.value === "2026-10-12T16:30", "end input shows 16:30, not shifted (got: " + endInput.value + ")");
});

test("saving the appointment drawer without touching the time sends no start_at/end_at at all (pure status/notes edit stays exact)", () => {
  const { win, hooks, fetchCalls, setFetchHandler } = buildPage();
  const appt = { id: "a1", status: "scheduled", start_at: "2026-10-12T16:00:00Z", end_at: "2026-10-12T16:30:00Z", notes: null, meeting_url: null, contact: {} };
  openApptDrawer(hooks, appt);

  setFetchHandler(() => Promise.resolve({
    status: 200, ok: true,
    text: () => Promise.resolve(JSON.stringify(Object.assign({}, appt, { status: "confirmed" }))),
  }));

  win.document.getElementById("egApptDrawerStatus").value = "confirmed";
  win.document.getElementById("egApptDrawerSave").dispatchEvent(new win.Event("click"));

  return Promise.resolve().then(() => {
    const call = fetchCalls.filter((c) => String(c.url).indexOf("/crm/appointments/a1") !== -1)[0];
    assert(!!call, "a PATCH call was made");
    const body = JSON.parse(call.opts.body);
    assert(body.status === "confirmed", "status change is sent");
    assert(!("start_at" in body), "start_at is NOT sent when the time wasn't touched (the old new Date(startVal).toISOString() vs new Date(original).toISOString() comparison round-tripped correctly only when browser TZ === tenant TZ - this must hold under every TZ now, got body: " + call.opts.body);
    assert(!("end_at" in body), "end_at is NOT sent when the time wasn't touched (got body: " + call.opts.body + ")");
  });
});

test("changing the appointment time in the drawer sends the new wall-clock digits untouched by the host timezone", () => {
  const { win, hooks, fetchCalls, setFetchHandler } = buildPage();
  const appt = { id: "a1", status: "scheduled", start_at: "2026-10-12T16:00:00Z", end_at: "2026-10-12T16:30:00Z", notes: null, meeting_url: null, contact: {} };
  openApptDrawer(hooks, appt);

  setFetchHandler(() => Promise.resolve({
    status: 200, ok: true,
    text: () => Promise.resolve(JSON.stringify(Object.assign({}, appt, { start_at: "2026-10-12T17:00:00Z" }))),
  }));

  // Admin moves the appointment from 4pm to 5pm tenant-local.
  win.document.getElementById("egApptDrawerStart").value = "2026-10-12T17:00";
  win.document.getElementById("egApptDrawerSave").dispatchEvent(new win.Event("click"));

  return Promise.resolve().then(() => {
    const call = fetchCalls.filter((c) => String(c.url).indexOf("/crm/appointments/a1") !== -1)[0];
    const body = JSON.parse(call.opts.body);
    assert(body.start_at === "2026-10-12T17:00:00Z", "the new start_at sent to the API is exactly 17:00Z - the same wall-clock digits the admin typed, not shifted by host TZ=" + process.env.TZ + " (got: " + body.start_at + ")");
  });
});

let p = Promise.resolve();
for (const t of pending) {
  p = p.then(() => t.fn()).catch((e) => { console.error("FAIL (threw): " + t.name + " - " + e.stack); failures++; });
}
p.then(() => {
  console.log("\n" + (pending.length - failures) + "/" + pending.length + " passed (TZ=" + process.env.TZ + ")");
  process.exit(failures ? 1 : 0);
});
