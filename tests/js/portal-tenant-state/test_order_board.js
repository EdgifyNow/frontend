// Restaurant pilot, phase 1, on the Voice Activity board: the order card
// (pickup/delivery and time, one line per item, "heard as" notes, warning
// flags), Approve/Reject on a new order, the Catering requests section, the
// new-order alert, and the caller audience in Voice AI Call Settings.
// Loads the REAL public/js/portal.js into jsdom, same as test_portal_fixes.js.

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
  const dom = new JSDOM(
    `<!doctype html><html><head><title>EdgifyNow Portal</title></head><body><div id="egApp"></div><div id="egTest"></div></body></html>`,
    { url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true }
  );
  const win = dom.window;
  win.EDGIFY_CONFIG = { API_BASE_URL: "http://fake-api", SESSION_IDLE_TIMEOUT_MINUTES: 10 };
  win.__EXPOSE_PORTAL_TEST_HOOKS__ = true;
  const fetchCalls = [];
  let fetchHandler = function () { return Promise.reject(new Error("no fetch handler set for this test")); };
  win.fetch = function (url, opts) { fetchCalls.push({ url: url, opts: opts }); return fetchHandler(url, opts); };
  win.eval(source);
  const hooks = win.__portalTestHooks;
  hooks.state.token = "fake-token";
  return { win, hooks, fetchCalls, setFetchHandler: (fn) => { fetchHandler = fn; } };
}

function jsonResponse(body) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });
}

function minutesAgo(n) { return new Date(Date.now() - n * 60000).toISOString(); }

// needs_review follows status unless a test sets it: a New order waits for
// staff, an approved or rejected one doesn't.
function order(overrides) {
  const o = makeOrder(overrides);
  if (!overrides || overrides.needs_review === undefined) o.needs_review = o.status === "new" && !o.review_decision;
  return o;
}

function makeOrder(overrides) {
  return Object.assign({
    id: "a1b2c3d4-0000-0000-0000-000000000001",
    conversation_id: "c1", external_call_id: "CA1", lead_id: "l1",
    contact: { name: "Asha Rao", phone: "+12015550101", email: null, is_test: false },
    capture_type: "order", summary: "Order: Butter Naan, Malai Kofta",
    details: {
      items: [{ item: "Butter Naan", quantity: 2, notes: "extra butter" }, { item: "Malai Kofta", quantity: 1 }],
      fulfillment: "pickup", order_time: "7 pm", heard_as: { "Butter Naan": "butter none" }
    },
    status: "new", review_decision: null, reviewed_at: null,
    flags: ["callback_number_differs", "first_time_caller"],
    created_at: minutesAgo(2), updated_at: minutesAgo(2)
  }, overrides || {});
}

const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

test("a new order card shows pickup and time, each item, heard-as notes, flags, and Approve/Reject", () => {
  const { hooks } = buildPage();
  const cfg = hooks.CHANNEL_ACTIVITY.voice;
  hooks.state.voiceCaptures = [order()];
  const html = hooks.channelActivityHtml(cfg);

  assert(html.includes("Pickup &middot; 7 pm"), "pickup and the time are on the card");
  assert(html.includes("2 ×") && html.includes("Butter Naan") && html.includes("extra butter"), "each item with its quantity and note");
  assert(html.includes("heard as &ldquo;butter none&rdquo;"), "a corrected dish name shows what was heard");
  assert(html.includes("Callback number differs") && html.includes("First-time caller"), "warning flags are shown");
  assert(html.includes(">Approve<") && html.includes(">Reject<"), "a new order offers Approve and Reject");
  assert(!html.includes(">Start<"), "no Start button any more");
  assert(html.includes("Awaiting approval"), "the new order's status reads Awaiting approval");
  assert(html.includes("ORDER #A1B2C3"), "a short order reference");
});

test("a delivery order shows its address, and a missing pickup/delivery says so", () => {
  const { hooks } = buildPage();
  const cfg = hooks.CHANNEL_ACTIVITY.voice;
  hooks.state.voiceCaptures = [
    order({ id: "d1", details: { item: "Biryani", fulfillment: "delivery", order_time: "as soon as possible", delivery_address: "12 Oak St" } }),
    order({ id: "d2", details: { item: "Samosa" } })
  ];
  const html = hooks.channelActivityHtml(cfg);
  assert(html.includes("Delivery &middot; ASAP") && html.includes("12 Oak St"), "delivery, ASAP, and the address");
  assert(html.includes("Pickup or delivery not given"), "an order without it says to check the transcript");
});

test("an approved order moves on with Ready; a rejected one says Rejected", () => {
  const { hooks } = buildPage();
  const cfg = hooks.CHANNEL_ACTIVITY.voice;
  hooks.state.voiceStatusFilter = "all";
  hooks.state.voiceCaptures = [
    order({ id: "p1", status: "in_progress", review_decision: "approved" }),
    order({ id: "r1", status: "cancelled", review_decision: "rejected" })
  ];
  const html = hooks.channelActivityHtml(cfg);
  assert(html.includes(">Ready<"), "an approved order offers Ready");
  assert(html.includes(">Rejected<"), "a rejected order is labelled Rejected, not just Cancelled");
});

test("catering requests get their own section with Mark handled", () => {
  const { hooks } = buildPage();
  const cfg = hooks.CHANNEL_ACTIVITY.voice;
  hooks.state.voiceCaptures = [order({
    id: "cat1", capture_type: "catering", summary: "Catering request: food for 80 people at a wedding",
    details: { request: "food for 80 people at a wedding", guest_count: 80 }, flags: []
  })];
  const html = hooks.channelActivityHtml(cfg);
  assert(html.includes("Catering requests"), "a Catering requests section");
  assert(html.includes("Mark handled"), "the owner marks it handled after calling back");
  assert(!html.includes(">Approve<"), "catering is not approved like an order");
});

test("rejecting asks first, and only then cancels the order", async () => {
  const { win, hooks, fetchCalls, setFetchHandler } = buildPage();
  const cfg = hooks.CHANNEL_ACTIVITY.voice;
  hooks.state.voiceCaptures = [order()];
  win.document.getElementById("egTest").innerHTML = hooks.channelActivityHtml(cfg);
  hooks.bindChannelActivity(cfg);
  setFetchHandler(() => jsonResponse([]));
  const reject = Array.from(win.document.querySelectorAll("[data-channel-action-status='cancelled']"))[0];

  let asked = "";
  win.confirm = (msg) => { asked = msg; return false; };
  reject.click();
  assert(asked.includes("+12015550101"), "the confirmation reminds staff to call the customer");
  assert(fetchCalls.length === 0, "saying no to the confirmation changes nothing");

  win.confirm = () => true;
  reject.click();
  await new Promise((r) => setTimeout(r, 0));
  const patch = fetchCalls.find((c) => c.opts && c.opts.method === "PATCH");
  assert(patch && JSON.parse(patch.opts.body).status === "cancelled", "confirming sends the order to Cancelled (rejected)");
});

test("a new order arriving on a refresh is highlighted and counted in the tab title; the first load and old orders are not", () => {
  const { win, hooks } = buildPage();
  const cfg = hooks.CHANNEL_ACTIVITY.voice;

  hooks.noteNewArrivals(cfg, [order({ id: "o1" })]);
  assert(hooks.state.unseenArrivals === 0, "the first load alerts for nothing");

  hooks.noteNewArrivals(cfg, [order({ id: "o1" }), order({ id: "o2" }), order({ id: "old", created_at: minutesAgo(60) })]);
  assert(hooks.state.unseenArrivals === 1, "only the newly arrived, recent order counts");
  assert(win.document.title.indexOf("(1) New order") === 0, "the tab title shows it - got: " + win.document.title);

  hooks.state.voiceCaptures = [order({ id: "o2" })];
  assert(hooks.channelActivityHtml(cfg).includes("is-new-arrival"), "its tile is highlighted");

  win.dispatchEvent(new win.Event("focus"));
  assert(hooks.state.unseenArrivals === 0 && win.document.title === "EdgifyNow Portal", "looking at the page clears the count");
});

test("the caller audience and speech words are saved with the voice settings", async () => {
  const { win, hooks, fetchCalls, setFetchHandler } = buildPage();
  hooks.state.voiceSettingsOpen = true;
  hooks.state.voiceSettings = {
    welcome_message: "Hi", is_welcome_message_default: true, human_handoff_number_masked: null,
    transfer_message: "Hold", is_transfer_message_default: true, ring_timeout_seconds: 20,
    no_answer_message: "Sorry", is_no_answer_message_default: true, timezone: "America/New_York",
    business_hours: null, after_hours_message: "Closed", is_after_hours_message_default: true,
    emergency_message: "", is_emergency_message_default: true, voice_audience: "en-IN", voice_speech_hints: "Butter Naan"
  };
  win.document.getElementById("egTest").innerHTML = hooks.voiceSettingsPanelHtml();
  assert(win.document.getElementById("egVoiceAudience").value === "en-IN", "the saved audience is selected");
  hooks.bindVoiceSettingsPanel();
  setFetchHandler(() => jsonResponse(hooks.state.voiceSettings));

  win.document.getElementById("egVoiceAudience").value = "en-GB";
  win.document.getElementById("egVoiceSpeechHints").value = "Butter Naan, Gulab Jamun";
  win.document.getElementById("egVoiceSettingsSave").click();
  await new Promise((r) => setTimeout(r, 0));

  const put = fetchCalls.find((c) => c.opts && c.opts.method === "PUT");
  const body = put && JSON.parse(put.opts.body);
  assert(body && body.voice_audience === "en-GB", "the chosen audience is sent");
  assert(body && body.voice_speech_hints === "Butter Naan, Gulab Jamun", "the speech words are sent");
  assert(body && body.voice_assistant_voice === "en-US", "the assistant's voice is its own setting, US English unless chosen");
  assert(body && body.voice_speech_model === "default", "the phone speech model is off unless chosen");
  assert(body && body.takes_delivery === false, "delivery orders are off unless switched on");
});

test("the assistant's voice and speech recognition are set apart from who calls", async () => {
  const { win, hooks, fetchCalls, setFetchHandler } = buildPage();
  hooks.state.voiceSettingsOpen = true;
  hooks.state.voiceSettings = {
    welcome_message: "Hi", is_welcome_message_default: true, human_handoff_number_masked: null,
    transfer_message: "Hold", is_transfer_message_default: true, ring_timeout_seconds: 20,
    no_answer_message: "Sorry", is_no_answer_message_default: true, timezone: "America/New_York",
    business_hours: null, after_hours_message: "Closed", is_after_hours_message_default: true,
    emergency_message: "", is_emergency_message_default: true, voice_audience: "en-IN",
    voice_assistant_voice: "en-US", voice_speech_model: "default", voice_speech_hints: ""
  };
  win.document.getElementById("egTest").innerHTML = hooks.voiceSettingsPanelHtml();
  hooks.bindVoiceSettingsPanel();
  setFetchHandler(() => jsonResponse(hooks.state.voiceSettings));
  assert(win.document.getElementById("egVoiceAssistantVoice").value === "en-US", "Indian English callers, US English voice");
  win.document.getElementById("egVoiceSpeechModel").value = "phone_call";
  win.document.getElementById("egVoiceSettingsSave").click();
  await new Promise((r) => setTimeout(r, 0));
  const body = JSON.parse(fetchCalls.find((c) => c.opts && c.opts.method === "PUT").opts.body);
  assert(body.voice_audience === "en-IN" && body.voice_assistant_voice === "en-US" && body.voice_speech_model === "phone_call", "each sent on its own");

  hooks.state.voiceSettings.voice_audience = "hi-IN";
  win.document.getElementById("egTest").innerHTML = hooks.voiceSettingsPanelHtml();
  assert(win.document.getElementById("egVoiceAssistantVoice").disabled, "Hindi calls always use the Hindi voice");
});

test("a reservation waiting for staff has its own section, party size, time, and Approve/Reject", () => {
  const { hooks } = buildPage();
  const cfg = hooks.CHANNEL_ACTIVITY.voice;
  hooks.state.voiceCaptures = [order({
    id: "res1", capture_type: "reservation", summary: "you'd like a table for 4 on Saturday, October 17 at 7:00 PM",
    details: { party_size: 4, requested_date: "2026-10-17", requested_time: "19:00" }, flags: []
  })];
  const html = hooks.channelActivityHtml(cfg);
  assert(html.includes(">Reservations <"), "a Reservations section");
  assert(html.includes("Table for 4 &middot; Sat, Oct 17 · 7:00 PM"), "party size and the time asked for - got: " + (html.match(/Table for[^<]*/) || [""])[0]);
  assert(html.includes(">Approve<") && html.includes(">Reject<"), "Approve and Reject");
});

test("a salon booking request waiting for staff gets Approve/Reject; once approved it reads On calendar", () => {
  const { hooks } = buildPage();
  const cfg = hooks.CHANNEL_ACTIVITY.voice;
  hooks.state.voiceStatusFilter = "all";
  const booking = { capture_type: "appointment", summary: "a haircut", details: { service: "haircut", requested_date: "2026-10-20", requested_time: "15:00" }, flags: [] };
  hooks.state.voiceCaptures = [order(Object.assign({ id: "b1" }, booking))];
  let html = hooks.channelActivityHtml(cfg);
  assert(html.includes("APPOINTMENT") && html.includes("Awaiting approval") && html.includes("Tue, Oct 20 · 3:00 PM") && html.includes(">haircut<"), "the service and time");
  assert(html.includes(">Approve<"), "Approve while it waits");

  hooks.state.voiceCaptures = [order(Object.assign({ id: "b1", status: "in_progress", review_decision: "approved", text_status: "sent", booking_status: "booked", appointment_id: "ap1", appointment_start_at: "2026-10-20T15:00:00Z" }, booking))];
  html = hooks.channelActivityHtml(cfg);
  assert(html.includes("✓ On calendar"), "an approved booking reads On calendar");
  assert(html.includes('data-channel-action-status="completed">Done<') && html.includes("data-appt-reschedule=\"ap1\"") && !html.includes('data-channel-action-status="ready"'), "a booking offers Reschedule and Done, no Ready step");
  assert(html.includes("Customer texted"), "the tile says the customer was texted");
});

test("an instantly booked appointment keeps its usual tile", () => {
  const { hooks } = buildPage();
  const cfg = hooks.CHANNEL_ACTIVITY.voice;
  hooks.state.voiceCaptures = [order({ id: "a1", capture_type: "appointment", summary: "a haircut", details: { service: "haircut" }, needs_review: false, flags: [] })];
  const html = hooks.channelActivityHtml(cfg);
  assert(!html.includes("BOOKING REQUEST") && !html.includes(">Approve<"), "no approval step when the business books instantly");
});

test("a text that couldn't be sent says why and who to call", () => {
  const { hooks } = buildPage();
  const cfg = hooks.CHANNEL_ACTIVITY.voice;
  hooks.state.voiceStatusFilter = "all";
  hooks.state.voiceCaptures = [order({ status: "in_progress", review_decision: "approved", text_status: "failed", text_error: "No recorded SMS consent from this contact" })];
  const html = hooks.channelActivityHtml(cfg);
  assert(html.includes("Text not sent: No recorded SMS consent from this contact") && html.includes("call +12015550101"), "the reason and the number to call");
});

test("what callers book and whether staff approve first are saved with the voice settings", async () => {
  const { win, hooks, fetchCalls, setFetchHandler } = buildPage();
  hooks.state.voiceSettingsOpen = true;
  hooks.state.voiceSettings = {
    welcome_message: "Hi", is_welcome_message_default: true, human_handoff_number_masked: null,
    transfer_message: "Hold", is_transfer_message_default: true, ring_timeout_seconds: 20,
    no_answer_message: "Sorry", is_no_answer_message_default: true, timezone: "America/New_York",
    business_hours: null, after_hours_message: "Closed", is_after_hours_message_default: true,
    emergency_message: "", is_emergency_message_default: true, voice_audience: null, voice_speech_hints: "",
    booking_kind: "appointment", bookings_need_approval: false
  };
  win.document.getElementById("egTest").innerHTML = hooks.voiceSettingsPanelHtml();
  hooks.bindVoiceSettingsPanel();
  setFetchHandler(() => jsonResponse(hooks.state.voiceSettings));

  win.document.getElementById("egBookingKind").value = "reservation";
  win.document.getElementById("egBookingsNeedApproval").checked = true;
  win.document.getElementById("egVoiceSettingsSave").click();
  await new Promise((r) => setTimeout(r, 0));

  const body = JSON.parse(fetchCalls.find((c) => c.opts && c.opts.method === "PUT").opts.body);
  assert(body.booking_kind === "reservation", "table reservations is sent");
  assert(body.bookings_need_approval === true, "approve-first is sent");
});

test("with texts turned off, a decided request tells staff to call the customer", () => {
  const { hooks } = buildPage();
  const cfg = hooks.CHANNEL_ACTIVITY.voice;
  hooks.state.voiceStatusFilter = "all";
  hooks.state.voiceCaptures = [
    order({ id: "o1", status: "in_progress", review_decision: "approved", text_status: "off", text_error: "Texts are turned off" }),
    order({ id: "r1", capture_type: "reservation", status: "cancelled", review_decision: "rejected", text_status: "off",
      details: { party_size: 2, requested_date: "2026-10-17", requested_time: "19:00" }, flags: [] })
  ];
  const html = hooks.channelActivityHtml(cfg);
  const calls = html.split("Call the customer: texts are turned off").length - 1;
  assert(calls === 2, "both the order and the reservation say to call - got " + calls);
  assert(html.includes("+12015550101"), "with the number to call");
  assert(!html.includes("Customer texted"), "never claims a text went out");
});

test("customer texts can be switched off in settings, and a platform-wide off is shown", async () => {
  const { win, hooks, fetchCalls, setFetchHandler } = buildPage();
  hooks.state.voiceSettingsOpen = true;
  hooks.state.voiceSettings = {
    welcome_message: "Hi", is_welcome_message_default: true, human_handoff_number_masked: null,
    transfer_message: "Hold", is_transfer_message_default: true, ring_timeout_seconds: 20,
    no_answer_message: "Sorry", is_no_answer_message_default: true, timezone: "America/New_York",
    business_hours: null, after_hours_message: "Closed", is_after_hours_message_default: true,
    emergency_message: "", is_emergency_message_default: true, voice_audience: null, voice_speech_hints: "",
    booking_kind: "appointment", bookings_need_approval: false, customer_texts_enabled: true, texts_available: false
  };
  const panel = hooks.voiceSettingsPanelHtml();
  assert(panel.includes("turned off for the whole platform"), "the owner is told texts are off platform-wide");
  win.document.getElementById("egTest").innerHTML = panel;
  hooks.bindVoiceSettingsPanel();
  setFetchHandler(() => jsonResponse(hooks.state.voiceSettings));

  win.document.getElementById("egCustomerTextsEnabled").checked = false;
  win.document.getElementById("egVoiceSettingsSave").click();
  await new Promise((r) => setTimeout(r, 0));

  const body = JSON.parse(fetchCalls.find((c) => c.opts && c.opts.method === "PUT").opts.body);
  assert(body.customer_texts_enabled === false, "turning customer texts off is sent");
});

(async () => {
  for (const t of pending) {
    console.log("\n# " + t.name);
    try { await t.fn(); } catch (e) { console.error("FAIL (threw): " + (e && e.stack || e)); failures++; }
  }
  console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
  process.exit(failures ? 1 : 0);
})();
