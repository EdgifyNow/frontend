// "Needs follow-up": a call that went wrong or ended mid-request, with what
// the caller was doing and what was captured - for any kind of business.
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
const box = win.document.getElementById("egTest");
const cfg = hooks.CHANNEL_ACTIVITY.voice || Object.values(hooks.CHANNEL_ACTIVITY)[0];
const base = { capture_type: "follow_up", status: "new", channel: "voice", created_at: new Date().toISOString(),
  contact: { name: "Asha", phone: "+12015550123" } };

box.innerHTML = hooks.renderCaptureTile(Object.assign({ id: "f1", summary: "Call ended before the order was finished: 2 Malai Kofta",
  details: { ended: "hung_up", request_label: "order", request_summary: "2 Malai Kofta", currency: "$", total: "35.98",
    lines: [{ name: "Malai Kofta", quantity: 2, unit_price: "17.99", line_total: "35.98" }], texted: "sent" } }, base), cfg);
let text = box.textContent;
assert(box.querySelector("[data-follow-up]"), "a follow-up card");
assert(/Call ended mid-request/.test(text) && /2 Malai Kofta/.test(text) && /Was putting together/.test(text), "what they were doing");
assert(/\$35\.98/.test(text), "what was captured, with prices");
assert(/no reply yet/.test(text), "the text sent");
assert(box.querySelector('a[href="tel:+12015550123"]'), "a Call back button");

box.innerHTML = hooks.renderCaptureTile(Object.assign({ id: "f2", summary: "Call ended before the booking was finished: a haircut on Friday",
  details: { ended: "hung_up", request_label: "booking", service: "haircut", texted: "sent", customer_replied: "yes" } }, base), cfg);
text = box.textContent;
assert(/booking/.test(text) && /haircut/.test(text), "a salon booking's details, not only orders");
assert(/Replied YES/.test(text), "a YES reply stands out");

box.innerHTML = hooks.renderCaptureTile(Object.assign({}, base, { id: "f3", summary: "Handed to the team - please call them back",
  details: { ended: "trouble" }, status: "completed" }), cfg);
assert(!box.querySelector("[data-channel-action]"), "nothing to do once handled");

console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
process.exit(failures ? 1 : 0);
