// Cancellations & changes on the Activity board: one the assistant already
// made shows as done; one waiting for staff needs action and can be marked
// handled. Real public/js/portal.js in jsdom.

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

const done = Object.assign({ id: "c1", capture_type: "appointment_change", status: "completed",
  summary: "Moved their appointment from Thursday, October 22 at 10:00 AM to Friday, October 23 at 2:00 PM",
  details: { action: "reschedule", done: true } }, base);
win.document.getElementById("egTest").innerHTML = hooks.renderCaptureTile(done, cfg);
let text = win.document.getElementById("egTest").textContent;
assert(/RESCHEDULE/.test(text) && /Done by the assistant/.test(text) && /Friday, October 23/.test(text), "a move the assistant made");
assert(!win.document.querySelector("[data-channel-action]"), "nothing for staff to do");

const waiting = Object.assign({ id: "c2", capture_type: "appointment_change", status: "new",
  summary: "Wants to cancel their booking: \"please cancel my booking\"", details: { action: "cancel", done: false } }, base);
win.document.getElementById("egTest").innerHTML = hooks.renderCaptureTile(waiting, cfg);
text = win.document.getElementById("egTest").textContent;
assert(/CANCELLATION/.test(text) && /Needs you/.test(text), "a request waiting for staff");
const button = win.document.querySelector('[data-channel-action-status="completed"]');
assert(button && /Mark handled/.test(button.textContent), "can be marked handled");
assert(win.document.querySelector(".needs-action"), "stands out as needing action");

console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
process.exit(failures ? 1 : 0);
