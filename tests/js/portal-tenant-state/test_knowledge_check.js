// "Verify my information" on the Knowledge page (status badge, each fact
// found with its quote or missing, customers also asked, the Verify button),
// the admin's read-only copy on Client details, a quote request on the
// activity board, and a service visit's problem and address on its card.
// Real public/js/portal.js in jsdom.

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

function buildPage(answer, role) {
  const dom = new JSDOM(`<!doctype html><html><body><div id="egApp"></div><div id="egTest"></div></body></html>`,
    { url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true });
  const win = dom.window;
  win.EDGIFY_CONFIG = { API_BASE_URL: "http://fake-api", SESSION_IDLE_TIMEOUT_MINUTES: 10 };
  win.__EXPOSE_PORTAL_TEST_HOOKS__ = true;
  const calls = [];
  win.fetch = (url, opts) => {
    calls.push({ url: String(url), opts });
    const reply = answer ? answer(String(url), opts) : { status: 200, body: {} };
    return Promise.resolve({
      ok: reply.status < 400, status: reply.status,
      json: () => Promise.resolve(reply.body), text: () => Promise.resolve(JSON.stringify(reply.body))
    });
  };
  win.eval(source);
  const hooks = win.__portalTestHooks;
  hooks.state.token = "fake-token";
  hooks.state.user = { id: "u1", role: role || "owner", email: "owner@doors.test", tenant_id: "t1" };
  return { win, hooks, calls };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

const CHECKED = {
  status: "basic_missing", checked_at: "2026-10-19T10:00:00Z",
  facts: [
    { fact: "Service area", level: "required", found: true, quote: "We serve all of Austin.", filename: "info.pdf" },
    { fact: "Call-out or diagnostic fee", level: "required", found: false, quote: null, filename: null },
    { fact: "Warranty on parts and labour", level: "recommended", found: false, quote: null, filename: null }
  ],
  customers_also_asked: ["Do you fix sliding gates?"]
};

const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

test("the Knowledge page shows the check and runs it on Verify", async () => {
  const ready = Object.assign({}, CHECKED, { status: "ready" });
  const { win, hooks, calls } = buildPage((url, opts) => (opts && opts.method === "POST") ? { status: 200, body: ready } : { status: 200, body: [] });
  hooks.state.documents = [];
  hooks.state.knowledgeCheck = CHECKED;
  const doc = win.document;
  const mount = () => { doc.getElementById("egTest").innerHTML = hooks.knowledgeHtml(); hooks.bindKnowledge(); };
  mount();
  const badge = doc.querySelector("[data-knowledge-status]");
  assert(badge && badge.textContent === "Basic information missing", "status badge");
  const text = doc.getElementById("egKnowledgeCheck").textContent;
  assert(text.includes("We serve all of Austin.") && text.includes("info.pdf"), "a found fact shows its quote and file");
  assert(text.includes("Not found in your documents"), "a missing fact says so");
  assert(text.includes("Customers also asked") && text.includes("Do you fix sliding gates?"), "unanswered questions listed");

  doc.getElementById("egVerifyKnowledge").click();
  await tick(); await tick();
  assert(calls.some((c) => c.url.endsWith("/api/v1/tenants/me/knowledge-check") && c.opts && c.opts.method === "POST"), "Verify runs the check");
  assert(hooks.state.knowledgeCheck.status === "ready" && !hooks.state.knowledgeChecking, "the new result is kept");
});

test("never checked, and out of date", async () => {
  const { win, hooks } = buildPage();
  hooks.state.documents = [];
  hooks.state.knowledgeCheck = { status: "not_verified", checked_at: null, facts: [{ fact: "Opening hours", level: "required", found: null }], customers_also_asked: [] };
  win.document.getElementById("egTest").innerHTML = hooks.knowledgeHtml();
  assert(win.document.querySelector("[data-knowledge-status]").textContent === "Not verified", "not verified");
  assert(win.document.getElementById("egKnowledgeCheck").textContent.includes("Never checked"), "never checked");
  hooks.state.knowledgeCheck = Object.assign({}, CHECKED, { status: "out_of_date" });
  win.document.getElementById("egTest").innerHTML = hooks.knowledgeHtml();
  assert(win.document.querySelector("[data-knowledge-status]").textContent === "Out of date", "out of date after changes");
});

test("the admin sees it on Client details without a Verify button", async () => {
  const { win, hooks } = buildPage(null, "platform_admin");
  hooks.state.businessTypes = [{ key: "garage_door", label: "Garage door repair" }];
  hooks.state.tenantDetail = { id: "t1", slug: "doors", status: "active", business_type: "garage_door", created_at: "2026-10-19T10:00:00Z" };
  hooks.state.tenantKnowledgeCheck = CHECKED;
  win.document.getElementById("egTest").innerHTML = hooks.tenantDetailHtml();
  assert(win.document.querySelector("[data-knowledge-status]").textContent === "Basic information missing", "status shown to the admin");
  assert(!win.document.getElementById("egVerifyKnowledge"), "read-only for the admin");
});

test("a quote request and a service visit on the board", async () => {
  const { win, hooks } = buildPage();
  const cfg = hooks.CHANNEL_ACTIVITY.voice || Object.values(hooks.CHANNEL_ACTIVITY)[0];
  const base = { channel: "voice", created_at: new Date().toISOString(), contact: { first_name: "Dana", phone: "+15125550100" } };
  const quote = Object.assign({ id: "q1", capture_type: "quote", status: "new", summary: "wants a quote for a new opener", details: { issue: "a new opener" } }, base);
  const quoteHtml = hooks.renderCaptureTile(quote, cfg);
  assert(/QUOTE/.test(quoteHtml) && /Mark handled/.test(quoteHtml), "a quote is its own kind, handled by a call back");

  const visit = Object.assign({ id: "a1", capture_type: "appointment", status: "in_progress", summary: "a garage door repair visit",
    booking_status: "needs_scheduling", booking_issue: "missing_fields",
    details: { issue: "the spring broke", address: "12 Oak Street", requested_date: "2026-10-22" } }, base);
  win.document.getElementById("egTest").innerHTML = hooks.renderCaptureTile(visit, cfg);
  const card = win.document.getElementById("egTest").textContent;
  assert(card.includes("the spring broke") && card.includes("12 Oak Street"), "the problem and the address");
  assert(/No time given/.test(card), "the day is known, only the time is missing");
});

(async () => {
  for (const t of pending) {
    console.log("\n# " + t.name);
    try { await t.fn(); } catch (e) { console.error("FAIL (threw): " + (e && e.stack || e)); failures++; }
  }
  console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
  process.exit(failures ? 1 : 0);
})();
