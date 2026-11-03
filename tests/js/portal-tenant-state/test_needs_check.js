// "Please check": what the assistant could not settle with the customer (a
// name still not right after spelling it) shows on the order, booking and
// lead card for the team. Real public/js/portal.js in jsdom.

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
const cfg = hooks.CHANNEL_ACTIVITY.voice || Object.values(hooks.CHANNEL_ACTIVITY)[0];
const base = { channel: "voice", created_at: new Date().toISOString(), contact: { first_name: "Asha", phone: "+15125550100" } };
const note = "The name may not be right (heard as \"Vis\") - please check it with the customer.";

function shown(v) {
  win.document.getElementById("egTest").innerHTML = hooks.renderCaptureTile(Object.assign({ id: v.capture_type, status: "new" }, base, v), cfg);
  return win.document.querySelectorAll("[data-needs-check]");
}

let found = shown({ capture_type: "order", needs_review: true, summary: "Order",
  details: { lines: [{ name: "Chicken Biryani", quantity: 1 }], spice_level: "mild", needs_check: note } });
assert(found.length === 1 && /Please check:/.test(found[0].textContent) && /heard as "Vis"/.test(found[0].textContent), "on an order, once");
found = shown({ capture_type: "appointment", details: { requested_date: "2026-11-05", needs_check: note } });
assert(found.length === 1, "on a booking");
found = shown({ capture_type: "lead", summary: "A call about a website", details: { needs_check: note } });
assert(found.length === 1, "on a lead");
found = shown({ capture_type: "order", summary: "Order", details: { lines: [{ name: "Chicken Biryani", quantity: 1 }] } });
assert(found.length === 0, "nothing when there's nothing to check");

console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
process.exit(failures ? 1 : 0);
