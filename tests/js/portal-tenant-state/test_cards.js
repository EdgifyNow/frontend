// The redesigned Activity cards: an appointment card with one clear state
// (on calendar / awaiting approval / needs scheduling and why), a question
// card that shows what was asked and whether the assistant could answer,
// names or formatted numbers (never "Unknown" or raw digits), no "View"
// button (the card opens with a click or Enter), and a details panel in
// plain words with the card's own actions. Real public/js/portal.js in jsdom.

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

function buildPage() {
  const dom = new JSDOM(`<!doctype html><html><body><div id="egApp"></div><div id="egTest"></div></body></html>`,
    { url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true });
  const win = dom.window;
  win.EDGIFY_CONFIG = { API_BASE_URL: "http://fake-api", SESSION_IDLE_TIMEOUT_MINUTES: 10 };
  win.__EXPOSE_PORTAL_TEST_HOOKS__ = true;
  const calls = [];
  win.fetch = (url, opts) => {
    calls.push({ url: String(url), opts });
    return new Promise(() => {}); // never answers: these tests only check what's sent
  };
  win.eval(source);
  const hooks = win.__portalTestHooks;
  hooks.state.token = "fake-token";
  hooks.state.voiceStatusFilter = "all";
  return { win, hooks, calls };
}

const minutesAgo = (n) => new Date(Date.now() - n * 60000).toISOString();
function capture(overrides) {
  return Object.assign({
    id: "c1", conversation_id: "conv1", lead_id: "l1", channel: "whatsapp",
    contact: { name: null, phone: "17329100839", email: null, is_test: false },
    capture_type: "appointment", summary: "you'd like an appointment on Monday, October 19 at 2:00 PM",
    details: { requested_date: "2026-10-19", requested_time: "14:00" },
    status: "new", review_decision: null, needs_review: false, flags: [], text_status: null,
    booking_status: null, booking_issue: null, appointment_id: null, appointment_start_at: null,
    created_at: minutesAgo(2), updated_at: minutesAgo(2)
  }, overrides || {});
}

const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

test("a booked appointment: name or formatted number, plain time, On calendar, Reschedule/No-show/Done", () => {
  const { hooks } = buildPage();
  hooks.state.voiceCaptures = [capture({ booking_status: "booked", appointment_id: "ap1", appointment_start_at: "2026-10-19T14:00:00Z", details: { service: "haircut" } })];
  const html = hooks.channelActivityHtml(hooks.CHANNEL_ACTIVITY.voice);
  assert(html.includes("(732) 910-0839") && !html.includes("17329100839<"), "a nameless caller is shown as a formatted number");
  assert(!html.includes("Unknown"), "never 'Unknown'");
  assert(html.includes("Mon, Oct 19 · 2:00 PM"), "the time in plain words, the business's own clock");
  assert(!html.includes("2026-10-19 • 14:00"), "no raw stored values");
  assert(html.includes("✓ On calendar"), "says it's on the calendar");
  assert(html.includes(">haircut<"), "the service");
  assert(html.includes("WhatsApp &middot; 2 min ago"), "how it came in and when");
  assert(html.includes(">Reschedule<") && html.includes(">No-show<") && html.includes(">Done<"), "the booked actions");
  assert(!html.includes(">Start<") && !html.includes(">View<"), "no Start, no View");
});

test("a booking that couldn't be made says why, with a Call link", () => {
  const { hooks } = buildPage();
  hooks.state.voiceCaptures = [capture({ booking_status: "needs_scheduling", booking_issue: "no_timezone", contact: { name: "Vishesh", phone: "+17329100839", email: null, is_test: false } })];
  const html = hooks.channelActivityHtml(hooks.CHANNEL_ACTIVITY.voice);
  assert(html.includes("⚠ Needs scheduling") && html.includes("Time zone not set"), "the state and the reason");
  assert(html.includes('href="tel:+17329100839"') && html.includes(">Call<"), "a Call link");
  assert(html.includes("needs-action"), "highlighted as needing action");
  assert(html.includes(">Vishesh<") && html.includes("(732) 910-0839"), "name as heading, number underneath");
});

test("less information: a day with no time, and nothing about when", () => {
  const { hooks } = buildPage();
  hooks.state.voiceCaptures = [
    capture({ id: "d1", booking_status: "needs_scheduling", booking_issue: "missing_fields", details: { requested_date: "2026-10-19" } }),
    capture({ id: "d2", booking_status: "needs_scheduling", booking_issue: "missing_fields", details: {} })
  ];
  const html = hooks.channelActivityHtml(hooks.CHANNEL_ACTIVITY.voice);
  assert(html.includes("Mon, Oct 19 · time not given"), "a day without a time says so");
  assert(html.includes("Day and time not given"), "nothing about when says so");
});

test("a question card shows what was asked, the answer, and flags one the assistant couldn't answer", () => {
  const { hooks } = buildPage();
  hooks.state.voiceCaptures = [
    capture({ id: "q1", capture_type: "general_inquiry", summary: "asked about hours", details: { question: "when do you open?", answer: "We open at 11 AM.", answered: true } }),
    capture({ id: "q2", capture_type: "general_inquiry", summary: "Couldn't answer: is there parking?", details: { question: "is there parking?", answer: "I don't have that...", answered: false } })
  ];
  const html = hooks.channelActivityHtml(hooks.CHANNEL_ACTIVITY.voice);
  assert(html.includes("&ldquo;when do you open?&rdquo;") && html.includes("We open at 11 AM."), "the question and the answer");
  assert(html.includes(">Answered<"), "answered ones say so");
  assert(html.includes("Couldn&rsquo;t answer") && html.includes("add the answer to your knowledge base"), "unanswered ones are flagged with what to do");
  assert(html.includes(">Mark reviewed<"), "Mark reviewed");
});

test("cards open with Enter, and have no View button", () => {
  const { win, hooks, calls } = buildPage();
  const cfg = hooks.CHANNEL_ACTIVITY.voice;
  hooks.state.voiceCaptures = [capture({ id: "k1" })];
  win.document.getElementById("egTest").innerHTML = hooks.channelActivityHtml(cfg);
  hooks.bindChannelActivity(cfg);
  const card = win.document.querySelector('[data-channel-drawer-id="k1"]');
  assert(card.getAttribute("tabindex") === "0" && card.getAttribute("role") === "button", "the card is focusable");
  card.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  assert(calls.some((c) => c.url.endsWith("/api/v1/crm/voice-captures/k1")), "Enter opens its details");
  assert(!win.document.getElementById("egTest").innerHTML.includes(">View<"), "no View button");
});

test("the details panel: number instead of Unknown, plain labels, the card's actions", () => {
  const { hooks } = buildPage();
  const cfg = hooks.CHANNEL_ACTIVITY.whatsapp;
  hooks.state.whatsappDrawerId = "c1";
  hooks.state.whatsappDrawerDetail = Object.assign(capture({ booking_status: "booked", appointment_id: "ap1", appointment_start_at: "2026-10-19T14:00:00Z", details: { requested_date: "2026-10-19", requested_time: "14:00", service: "haircut" } }), { transcript: [] });
  const html = hooks.channelDrawerHtml(cfg);
  assert(html.includes("<h2>(732) 910-0839") && !html.includes("Unknown"), "heading is the formatted number");
  assert(html.includes("<span>Date</span><b>Mon, Oct 19</b>") && html.includes("<span>Time</span><b>2:00 PM</b>"), "plain labels and values");
  assert(!html.includes("requested_date") && !html.includes("requested_time"), "no raw field names");
  assert(html.includes(">Reschedule<") && !html.includes("Save status"), "the card's actions, not a status list");
});

(async () => {
  for (const t of pending) {
    console.log("\n# " + t.name);
    try { await t.fn(); } catch (e) { console.error("FAIL (threw): " + (e && e.stack || e)); failures++; }
  }
  console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
  process.exit(failures ? 1 : 0);
})();
