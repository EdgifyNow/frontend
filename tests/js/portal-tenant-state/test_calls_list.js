// Every call on Voice Activity, so no lead is lost: time, caller, duration
// and how it went - including calls that left no request card - with the
// transcript on click. Real public/js/portal.js in jsdom.

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
const voice = hooks.CHANNEL_ACTIVITY.voice;
const whatsapp = hooks.CHANNEL_ACTIVITY.whatsapp;
const now = new Date().toISOString();

const call = (id, extra) => Object.assign({ id: id, started_at: now, last_activity_at: now, duration_seconds: 103,
  status: "ended", outcome: "Asked: “Do you have parking?”", transfer: null,
  contact: { id: "c" + id, name: null, phone: "+17329100839", is_test: false }, requests: [] }, extra || {});

hooks.state.voiceCaptures = [];
hooks.state.voiceCalls = [
  call("1", { outcome: "Transferred to the team - answered (talked 3 min)", transfer: "answered" }),
  call("2", { outcome: "Transferred to the team - not answered", transfer: "not_answered", contact: { id: "c2", name: "Asha", phone: "+17325550000" } }),
  call("3", { status: "in_progress", outcome: "Call in progress", duration_seconds: 20 }),
  call("4", { outcome: "Placed an order: 2 Garlic Naan", requests: [{ id: "card-4", capture_type: "order", summary: "2 Garlic Naan", status: "new" }] }),
];
box.innerHTML = hooks.channelActivityHtml(voice);
const rows = box.querySelectorAll("[data-call-id]");
assert(rows.length === 4, "every call is listed, even with no request cards on the board");
assert(/\(732\) 910-0839/.test(rows[0].textContent) && /1m 43s/.test(rows[0].textContent), "caller's number and the call's length");
assert(/Picked up/.test(rows[0].textContent), "a transfer someone answered says Picked up");
assert(/Not picked up/.test(rows[1].textContent) && /Asha/.test(rows[1].textContent), "a transfer no one answered says Not picked up");
assert(/Live/.test(rows[2].textContent), "a call under way shows Live");
assert(!box.querySelector("[data-call-id] button"), "no outcome buttons on a call");
assert(!/No voice activity yet/.test(box.textContent) && /every call is listed above/.test(box.textContent), "calls show even when there are no cards");

// Opened: the transcript, and a way to the request card it made.
hooks.state.voiceCallsOpen = "4";
hooks.state.voiceCallsDetail = Object.assign(call("4"), {
  requests: [{ id: "card-4", capture_type: "order", summary: "2 Garlic Naan", status: "new" }],
  transcript: [{ who: "caller", text: "Two garlic naan please", at: now }, { who: "assistant", text: "Got it.", at: now },
               { who: "note", text: "(Transferred to the team - they picked up and talked for 3 min.)", at: now }] });
box.innerHTML = hooks.channelActivityHtml(voice);
assert(/Caller:\s*Two garlic naan please/.test(box.textContent) && /Assistant:\s*Got it\./.test(box.textContent), "the transcript, caller and assistant");
assert(box.querySelector(".eg-call-line.note"), "the transfer note in the transcript");
const open = box.querySelector('[data-channel-drawer="voice"][data-channel-drawer-id="card-4"]');
assert(open && /order card/.test(open.textContent), "opens the order card it made");

// Many calls: the newest few, then "Show all".
hooks.state.voiceCallsOpen = null;
hooks.state.voiceCalls = Array.from({ length: 12 }, (_, i) => call(String(i)));
box.innerHTML = hooks.channelActivityHtml(voice);
assert(box.querySelectorAll("[data-call-id]").length === 8 && box.querySelector("[data-calls-all]"), "the newest 8, then Show all");
hooks.state.voiceCallsAll = true;
box.innerHTML = hooks.channelActivityHtml(voice);
assert(box.querySelectorAll("[data-call-id]").length === 12, "Show all lists every call");

hooks.state.voiceCalls = [];
box.innerHTML = hooks.channelActivityHtml(voice);
assert(/No calls in this period/.test(box.textContent), "no calls in the period");

hooks.state.whatsappCaptures = [];
box.innerHTML = hooks.channelActivityHtml(whatsapp);
assert(!box.querySelector("[data-call-id]") && !/Calls \(/.test(box.textContent), "WhatsApp has no Calls list");

console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
process.exit(failures ? 1 : 0);
