// When staff can't reach a customer about a request: "Couldn't reach them"
// on the card, the confirmation text's state, and the customer's reply -
// for any kind of request. Real public/js/portal.js in jsdom.

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
const card = (type, details, extra) => Object.assign({ id: "x", capture_type: type, status: "new", details: details || {},
  texts_available: true, contact: { phone: "+17329100839" } }, extra || {});
const state = () => { const el = box.querySelector("[data-confirm-state]"); return el && el.getAttribute("data-confirm-state"); };
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

for (const type of ["order", "appointment", "reservation", "quote", "follow_up"]) {
  box.innerHTML = hooks.confirmLoopHtml(card(type));
  assert(box.querySelector("[data-reach-id]") && /text them/.test(box.textContent), type + ": Couldn't reach them - text them");
}
box.innerHTML = hooks.confirmLoopHtml(card("general_inquiry"));
assert(box.innerHTML === "", "nothing to confirm on a question");

box.innerHTML = hooks.confirmLoopHtml(card("order", { call_attempts: [ago(30)] }));
assert(state() === "unconfirmed", "tried calling, not confirmed yet");
box.innerHTML = hooks.confirmLoopHtml(card("order", { confirm: { status: "sent", sent_at: ago(10) } }));
assert(state() === "waiting", "text sent, waiting");
box.innerHTML = hooks.confirmLoopHtml(card("order", { confirm: { status: "sent", sent_at: ago(240) }, call_attempts: [ago(250)] }));
assert(state() === "ghost", "no reply for hours: possibly not a real request");
box.innerHTML = hooks.confirmLoopHtml(card("appointment", { confirm: { status: "sent", sent_at: ago(5), reply: "yes" } }));
assert(state() === "yes" && !box.querySelector("[data-reach-id]"), "confirmed by text, nothing more to do");
box.innerHTML = hooks.confirmLoopHtml(card("order", { confirm: { status: "sent", sent_at: ago(5), reply: "no" } }));
assert(state() === "no", "replied NO: wants to cancel (staff decide)");
box.innerHTML = hooks.confirmLoopHtml(card("order", { confirm: { status: "sent", sent_at: ago(5), reply: "call_back" } }));
assert(state() === "call_back", "asked to be called back");
box.innerHTML = hooks.confirmLoopHtml(card("order", {}, { texts_available: false }));
assert(/Texts are off/.test(box.textContent) && !/text them/.test(box.textContent), "texts off: call again, no text promised");

console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
process.exit(failures ? 1 : 0);
