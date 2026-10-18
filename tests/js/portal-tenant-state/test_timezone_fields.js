// The business time zone can be set on the Account page and when a client is
// created (defaulting to America/New_York), and is sent to the API as
// voice_timezone. Real public/js/portal.js in jsdom.

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
  const dom = new JSDOM(`<!doctype html><html><body><div id="egApp"></div><div id="egTest"></div></body></html>`,
    { url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true });
  const win = dom.window;
  win.EDGIFY_CONFIG = { API_BASE_URL: "http://fake-api", SESSION_IDLE_TIMEOUT_MINUTES: 10 };
  win.__EXPOSE_PORTAL_TEST_HOOKS__ = true;
  const calls = [];
  win.fetch = (url, opts) => {
    calls.push({ url, opts });
    // List endpoints (reloaded after saving) answer with a list.
    const isList = (!opts || !opts.method || opts.method === "GET") && /\/admin\/tenants$/.test(String(url));
    const body = isList ? [] : {};
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });
  };
  win.eval(source);
  const hooks = win.__portalTestHooks;
  hooks.state.token = "fake-token";
  return { win, hooks, calls };
}

const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

test("the Account page shows the business time zone, and warns when it isn't set", () => {
  const { hooks } = buildPage();
  hooks.state.tenantSelf = { id: "t1", name: "Step Up Dance", voice_timezone: null };
  let html = hooks.accountHtml();
  assert(html.includes('id="egAcctTimezone"'), "a time zone field on the Account page");
  assert(html.includes("Not set yet"), "an unset time zone is called out");

  hooks.state.tenantSelf = { id: "t1", name: "Step Up Dance", voice_timezone: "America/Chicago" };
  html = hooks.accountHtml();
  assert(html.includes('value="America/Chicago" selected'), "the saved time zone is selected");
  assert(!html.includes("Not set yet"), "no warning once it's set");

  hooks.state.tenantSelf = { id: "t1", name: "Step Up Dance", voice_timezone: "Europe/Berlin" };
  assert(hooks.accountHtml().includes('value="Europe/Berlin" selected'), "a saved zone outside the list is kept, not replaced");
});

test("saving the Account page sends the chosen time zone", async () => {
  const { win, hooks, calls } = buildPage();
  hooks.state.tenantSelf = { id: "t1", name: "Step Up Dance", voice_timezone: null };
  win.document.getElementById("egTest").innerHTML = hooks.accountHtml();
  hooks.bindAccount();
  win.document.getElementById("egAcctTimezone").value = "America/Los_Angeles";
  win.document.getElementById("egAcctSave").click();
  await new Promise((r) => setTimeout(r, 0));
  const patch = calls.find((c) => c.opts && c.opts.method === "PATCH");
  assert(patch && JSON.parse(patch.opts.body).voice_timezone === "America/Los_Angeles", "voice_timezone is sent");
});

test("creating a client defaults to America/New_York and sends the choice", async () => {
  const { win, hooks, calls } = buildPage();
  hooks.state.user = { id: "a1", role: "platform_admin" };
  hooks.state.tenants = [];
  win.document.getElementById("egTest").innerHTML = hooks.tenantsHtml();
  hooks.bindTenants();
  const tz = win.document.getElementById("egNewClientTimezone");
  assert(tz && tz.value === "America/New_York", "the new-client form starts on America/New_York");

  win.document.getElementById("egContactName").value = "Dana Studio";
  win.document.getElementById("egOwnerEmail").value = "owner@dance.example";
  win.document.getElementById("egContactPhone").value = "(415) 555-0148";
  win.document.getElementById("egTenantSlug").value = "dance-studio";
  tz.value = "America/Denver";
  win.document.getElementById("egCreateTenant").click();
  await new Promise((r) => setTimeout(r, 0));
  const post = calls.find((c) => c.opts && c.opts.method === "POST" && String(c.url).includes("/admin/tenants"));
  assert(post && JSON.parse(post.opts.body).voice_timezone === "America/Denver", "the chosen time zone is sent");
});

(async () => {
  for (const t of pending) {
    console.log("\n# " + t.name);
    try { await t.fn(); } catch (e) { console.error("FAIL (threw): " + (e && e.stack || e)); failures++; }
  }
  console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
  process.exit(failures ? 1 : 0);
})();
