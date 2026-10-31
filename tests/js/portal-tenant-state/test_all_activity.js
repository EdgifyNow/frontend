// One page for every channel's requests (All Activity), and "Keep me signed
// in on this device": no idle sign-out there, but the session still ends
// after a few hours, with a warning first. Real public/js/portal.js in jsdom.

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
const asked = [];
win.fetch = (url) => { asked.push(String(url)); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve("[]") }); };
win.eval(source);
const hooks = win.__portalTestHooks;
const box = win.document.getElementById("egTest");
const all = hooks.CHANNEL_ACTIVITY.all;

// ---- All Activity --------------------------------------------------------
assert(all && all.allChannels, "an All Activity board");
hooks.state.token = "t";
hooks.state.user = { email: "owner@example.com", role: "owner" };
assert(hooks.navItems()[1].id === "all" && hooks.navItems()[1].label === "All Activity", "All Activity near the top of the menu");
hooks.loadChannelCaptures(all);
const listUrl = asked.filter((u) => u.includes("/crm/voice-captures?")).pop() || "";
assert(listUrl && !/channel=/.test(listUrl), "it asks for every channel's requests");

const card = (id, channel, type) => ({ id: id, capture_type: type, status: "new", summary: "Request " + id, details: {},
  channel: channel, created_at: new Date().toISOString(), texts_available: true, contact: { name: "Asha", phone: "+17329100839" } });
hooks.state.allCaptures = [card("a", "voice", "order"), card("b", "whatsapp", "appointment"), card("c", "web_widget", "quote")];
box.innerHTML = hooks.channelActivityHtml(all);
const text = box.textContent;
assert(/Phone call/.test(text) && /WhatsApp/.test(text) && /Website/.test(text), "each card says where it came from");
assert(box.querySelectorAll('[data-channel-drawer="all"]').length === 3, "every card opens its details");

// ---- Keep me signed in ----------------------------------------------------
hooks.state.user = null;
hooks.state.token = null;
hooks.render();
assert(win.document.getElementById("egKeepSignedIn") && /Signs out after 3 hours/.test(win.document.body.textContent),
  "the sign-in screen offers it, and says when it ends");

hooks.state.token = "t";
hooks.state.user = { email: "owner@example.com", role: "owner" };
win.localStorage.setItem("eg_portal_kept_until", String(Date.now() + 2 * 60 * 60 * 1000));
assert(hooks.scheduleKeptSession() === true && hooks.keptTimerCount() === 2, "a kept session: a warning, then the sign-out");
assert(!hooks.hasActiveIdleTimer(), "and no idle sign-out on this device");

win.localStorage.setItem("eg_portal_kept_until", String(Date.now() - 1000));
hooks.scheduleKeptSession();
assert(hooks.state.token === null && !win.localStorage.getItem("eg_portal_kept_until"), "once it's over, the device is signed out");

// ---- The chat box keeps the cursor after a reply ---------------------------
win.localStorage.removeItem("eg_portal_kept_until");
hooks.state.token = "t";
hooks.state.user = { email: "owner@example.com", role: "owner" };
hooks.state.view = "assistant";
hooks.state.assistants = [{ id: "a1", name: "Website", assistant_type: "customer_website", is_active: true, system_prompt: "" }];
hooks.state.selectedAssistantId = "a1";
hooks.render();
let input = win.document.getElementById("egTestChatInput");
assert(!!input, "the AI Assistant chat box is there");
if (input) {
  input.value = "and what about";
  hooks.state.chatLog = [{ who: "me", text: "hours?" }, { who: "bot", text: "9 to 5." }];
  hooks.renderKeepingChatInput("egTestChatInput");
  input = win.document.getElementById("egTestChatInput");
  assert(input.value === "and what about", "what was typed while waiting is kept");
  assert(win.document.activeElement === input, "the cursor is back in the chat box after the reply");
}

console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
process.exit(failures ? 1 : 0);
