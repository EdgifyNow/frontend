// Text-message chat: its cards say "Text message" on All Activity.
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
win.document.getElementById("egTest").innerHTML = hooks.renderCaptureTile(Object.assign({ id: "t1", status: "new",
  capture_type: "appointment", channel: "sms", details: { requested_date: "2026-11-05" } }, base, { channel: "sms" }), cfg);
assert(/Text message/.test(win.document.getElementById("egTest").textContent), "a text-message card says so");
win.document.getElementById("egTest").innerHTML = hooks.renderCaptureTile(Object.assign({ id: "t2", status: "new",
  capture_type: "appointment", details: { requested_date: "2026-11-05" } }, base), cfg);
assert(/Phone call/.test(win.document.getElementById("egTest").textContent), "a call card still says phone call");

console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
process.exit(failures ? 1 : 0);
