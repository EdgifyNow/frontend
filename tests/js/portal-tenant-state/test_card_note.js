// A note the customer asked to add ("the agenda is AI services") shows on
// the booking card. Real public/js/portal.js in jsdom.

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
win.document.getElementById("egTest").innerHTML = hooks.renderCaptureTile(Object.assign({ id: "n1", status: "new",
  capture_type: "appointment", details: { requested_date: "2026-11-06", notes: "I want to talk about AI Services as agenda" } }, base), cfg);
var note = win.document.querySelector("[data-card-note]");
assert(note && /Note:/.test(note.textContent) && /AI Services as agenda/.test(note.textContent), "the agenda shows on the card");
win.document.getElementById("egTest").innerHTML = hooks.renderCaptureTile(Object.assign({ id: "n2", status: "new",
  capture_type: "appointment", details: { requested_date: "2026-11-06" } }, base), cfg);
assert(!win.document.querySelector("[data-card-note]"), "no note line without a note");

console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
process.exit(failures ? 1 : 0);
