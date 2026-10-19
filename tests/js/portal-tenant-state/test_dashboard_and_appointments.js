// The dashboard's "New Leads Today" uses the viewer's own calendar day (an
// evening lead in New York is today there, though its UTC date is
// tomorrow), and the Appointments tab lists upcoming ones soonest first,
// then past ones most recent first. Real public/js/portal.js in jsdom.
// Run with TZ=America/New_York.

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

// A lead made just now: in the evening in New York its UTC date is
// already tomorrow; it must still be one of today's.
{
  const { win, hooks } = buildPage();
  const justNow = new Date().toISOString();
  hooks.state.contacts = [{ id: "c1", first_name: "Vishesh" }];
  hooks.state.leads = [{ id: "l1", contact_id: "c1", status: "new", source: "website_chat", title: "Website lead", created_at: justNow }];
  win.document.getElementById("egTest").innerHTML = hooks.clientDashboardHtml();
  const text = win.document.getElementById("egTest").textContent;
  assert(!text.includes("No New Leads Today"), "a lead made just now is in New Leads Today");

  // And the case directly: 11:11 pm in New York is 03:11 UTC the next day.
  const evening = new Date(2026, 9, 18, 23, 11);           // local (New York) wall clock
  assert(evening.toISOString().slice(0, 10) === "2026-10-19", "precondition: UTC date is the next day (TZ=" + process.env.TZ + ")");
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
