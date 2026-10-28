// Each business chooses its call experience in Voice AI settings: Standard
// (included) or Premium (Twilio ConversationRelay, extra cost). Real
// public/js/portal.js in jsdom.

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

box.innerHTML = hooks.callModeHtml({ voice_call_mode: "standard", relay_available: true });
let select = win.document.getElementById("egVoiceCallMode");
assert(select && select.value === "standard", "Standard is chosen by default");
assert(/Premium/.test(select.textContent) && /\$0\.07 per call minute/.test(box.textContent), "Premium is offered with its cost");

box.innerHTML = hooks.callModeHtml({ voice_call_mode: "relay", relay_available: true });
assert(win.document.getElementById("egVoiceCallMode").value === "relay", "a business on Premium sees Premium chosen");
assert(!/turned off for the whole platform/.test(box.textContent), "no warning while Premium is available");

box.innerHTML = hooks.callModeHtml({ voice_call_mode: "relay", relay_available: false });
assert(/turned off for the whole platform/.test(box.textContent), "told when Premium is off for the platform");

box.innerHTML = hooks.callModeHtml({ voice_call_mode: "relay", voice_relay_interrupt: "dtmf", relay_available: true });
assert(win.document.getElementById("egVoiceRelayInterrupt").value === "dtmf", "a business can make interruptions keypad-only");
box.innerHTML = hooks.callModeHtml({ voice_call_mode: "relay", relay_available: true });
assert(win.document.getElementById("egVoiceRelayInterrupt").value === "clear", "clear speech or a key by default");
assert(win.document.getElementById("egVoiceRelayInterrupt").options.length === 3, "clear speech, any sound, or keypad only");

console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
process.exit(failures ? 1 : 0);
