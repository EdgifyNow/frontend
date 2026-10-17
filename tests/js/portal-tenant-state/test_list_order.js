// Leads & Contacts list the most recently active first: a returning caller
// (whose lead and contact were created long ago, but who just called again)
// comes to the top. Real public/js/portal.js in jsdom, same harness as the
// other suites here.

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

const dom = new JSDOM(`<!doctype html><html><body><div id="egApp"></div></body></html>`,
  { url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true });
const win = dom.window;
win.EDGIFY_CONFIG = { API_BASE_URL: "http://fake-api", SESSION_IDLE_TIMEOUT_MINUTES: 10 };
win.__EXPOSE_PORTAL_TEST_HOOKS__ = true;
win.fetch = () => Promise.reject(new Error("no network in this test"));
win.eval(source);
const hooks = win.__portalTestHooks;

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
hooks.state.contacts = [
  { id: "c-old", first_name: "Returning", created_at: daysAgo(30), last_interaction_at: daysAgo(0) },
  { id: "c-week", first_name: "Last week", created_at: daysAgo(7), last_interaction_at: daysAgo(7) },
  { id: "c-new", first_name: "Never active", created_at: daysAgo(3), last_interaction_at: null }
];
hooks.state.leads = [
  { id: "l-old", contact_id: "c-old", status: "new", source: "voice", created_at: daysAgo(30), last_activity_at: daysAgo(0) },
  { id: "l-week", contact_id: "c-week", status: "new", source: "voice", created_at: daysAgo(7), last_activity_at: daysAgo(7) },
  { id: "l-new", contact_id: "c-new", status: "new", source: "voice", created_at: daysAgo(3), last_activity_at: null }
];

const leads = hooks.filteredLeads({ ignoreDateFilter: true }).map((l) => l.id);
assert(JSON.stringify(leads) === JSON.stringify(["l-old", "l-new", "l-week"]), "leads: latest activity first - got " + leads);

const contacts = hooks.filteredContacts({ ignoreDateFilter: true }).map((c) => c.id);
assert(JSON.stringify(contacts) === JSON.stringify(["c-old", "c-new", "c-week"]), "contacts: latest interaction first - got " + contacts);

console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
process.exit(failures ? 1 : 0);
