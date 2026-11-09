// The dashboard shows the owner's day (GET /crm/today, worked out in the
// business's own day on the server), and the Appointments tab lists upcoming
// ones soonest first, then past ones most recent first. Real
// public/js/portal.js in jsdom. Run with TZ=America/New_York.

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
  win.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve("[]") });
  win.eval(source);
  const hooks = win.__portalTestHooks;
  hooks.state.token = "fake-token";
  hooks.state.user = { id: "u1", role: "owner", email: "owner@test", tenant_id: "t1" };
  return { win, hooks };
}

// The day as the server worked it out: shown as it is.
{
  const { win, hooks } = buildPage();
  hooks.state.today = { date_label: "Monday, November 9", greeting: "Good morning", takes_orders: true,
    overnight: {}, tiles: { conversations_today: 3, waiting: 1, waiting_by_kind: { lead: 1 } },
    attention: [{ kind: "lead", title: "New lead · Vishesh", detail: "No reply for 2 days", at: null, link: { lead_id: "l1" } }],
    attention_total: 1, plan: [], week: {} };
  win.document.getElementById("egTest").innerHTML = hooks.clientDashboardHtml();
  const text = win.document.getElementById("egTest").textContent;
  assert(text.includes("New lead · Vishesh"), "a lead waiting for a reply is in Needs your attention");
}

// Appointments: upcoming soonest first, then past most recent first.
{
  const { hooks } = buildPage();
  const now = new Date(2026, 9, 19, 12, 0);                // noon, viewer's clock
  const list = [
    { id: "past-old", start_at: "2026-10-01T10:00:00Z" },
    { id: "next-week", start_at: "2026-10-26T09:00:00Z" },
    { id: "past-recent", start_at: "2026-10-18T15:00:00Z" },
    { id: "this-afternoon", start_at: "2026-10-19T15:00:00Z" },
    { id: "this-morning", start_at: "2026-10-19T09:00:00Z" }
  ];
  const order = hooks.sortAppointments(list, now).map((a) => a.id).join(",");
  assert(order === "this-afternoon,next-week,this-morning,past-recent,past-old", "upcoming soonest first, then past most recent first: " + order);
}

console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
process.exit(failures ? 1 : 0);
