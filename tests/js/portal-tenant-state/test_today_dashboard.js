// The owner's day on the dashboard: the tiles, what needs them (in the
// order the server gave), today's plan in 12-hour time, the week, "Ask your
// assistant", and a day that could not load. Real public/js/portal.js in jsdom.
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
const day = {
  date_label: "Monday, November 9", greeting: "Good morning", takes_orders: true,
  overnight: { conversations: 12, calls: 10, orders: 3, bookings: 0, callbacks: 2 },
  tiles: { conversations_today: 27, handled_pct: 96, requests_today: 14, orders_today: 10, bookings_today: 4, orders_total: "612.00",
           waiting: 3, waiting_by_kind: { order: 1, check: 1, callback: 1 }, hours_saved_week: 9.5, conversations_week: 114 },
  attention: [
    { kind: "order", title: "Priya · 1 Chicken Makhni", detail: "Waiting for your approval", at: new Date().toISOString(), link: { capture_id: "c1" } },
    { kind: "check", title: "Vis · a booking", detail: "The name may not be right", at: new Date().toISOString(), link: { capture_id: "c2" } },
    { kind: "callback", title: "(732) 910-0839 · catering", detail: "Call them back", at: null, phone: "+17329100839", link: { capture_id: "c3" } }
  ],
  attention_total: 5,
  plan: [{ time: "13:30", title: "Table for 6 · Rohan", detail: "Scheduled" }],
  week: { busiest_days: [{ day: "Mon", count: 2 }, { day: "Tue", count: 1 }, { day: "Wed", count: 0 }, { day: "Thu", count: 3 },
                         { day: "Fri", count: 9 }, { day: "Sat", count: 12 }, { day: "Sun", count: 5 }],
          peak_hour: 19, most_asked: ["Opening hours", "Catering for groups"], requests: 40, handed_to_team: 3, flagged: 1, done_without_staff_pct: 94 }
};
hooks.state.today = day;
win.document.getElementById("egTest").innerHTML = hooks.clientDashboardHtml();
const box = win.document.getElementById("egTest");
const text = box.textContent;
assert(/12 calls and chats answered while you were closed/.test(text) && /2 call-backs waiting/.test(text), "the overnight line");
assert(/Calls & chats today/.test(text) && /96% handled by your assistant/.test(text), "calls tile");
assert(/\$612\.00 in orders/.test(text) && /9\.5 hrs/.test(text), "orders and time-saved tiles");
const kinds = Array.from(box.querySelectorAll("[data-today-kind]")).map(e => e.getAttribute("data-today-kind"));
assert(kinds.join(",") === "order,check,callback", "attention in the server's order");
assert(/and 2 more in All Activity/.test(text), "the rest counted");
assert(box.querySelector('a[href="tel:+17329100839"]'), "a call-back can be called from the list");
assert(/1:30 PM/.test(text) && /Table for 6/.test(text), "today's plan in 12-hour time");
assert(/Busiest on Sat, around 7:00 PM/.test(text) && /Opening hours/.test(text) && /94% done without staff/.test(text), "the week");
assert(box.querySelector("#egTodayAskForm") && box.querySelectorAll("[data-today-chip]").length === 4, "ask your assistant");

hooks.state.today = null; hooks.state.todayFailed = true;
win.document.getElementById("egTest").innerHTML = hooks.clientDashboardHtml();
assert(/couldn't load right now/.test(win.document.getElementById("egTest").textContent), "a day that couldn't load says so");

console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
process.exit(failures ? 1 : 0);
