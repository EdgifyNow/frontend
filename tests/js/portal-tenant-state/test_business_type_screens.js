// Each kind of business sees only what applies to it: settings come from
// what its business type does (capabilities from the API), and only orders
// run Start / Ready / Done - any other request is called back and marked
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
const box = win.document.getElementById("egTest");
const has = (id) => !!box.querySelector("#" + id);

const CAPS = {
  restaurant: { takes_orders: true, same_day_orders: true, reservations: true, bookings: true, catering: true },
  cake_bakery: { takes_orders: true, same_day_orders: false, reservations: false, bookings: false },
  salon: { takes_orders: false, same_day_orders: false, reservations: false, bookings: true },
  doctor_office: { takes_orders: false, same_day_orders: false, reservations: false, bookings: true },
  law_office: { takes_orders: false, same_day_orders: false, reservations: false, bookings: true },
  handyman: { takes_orders: false, same_day_orders: false, reservations: false, bookings: true, quotes: true },
};
for (const [kind, caps] of Object.entries(CAPS)) {
  box.innerHTML = hooks.businessSettingsHtml({ capabilities: caps });
  assert(has("egTakesDelivery") === caps.takes_orders, kind + ": delivery setting only when it takes orders");
  assert(has("egOrderReadyTime") === caps.same_day_orders, kind + ": 'ready in about' only for same-day orders");
  assert(has("egBookingKind") === caps.reservations, kind + ": table reservations only where it takes them");
  assert(has("egBookingsNeedApproval") === caps.bookings, kind + ": booking approval where it books");
}
box.innerHTML = hooks.businessSettingsHtml({});
assert(has("egTakesDelivery") && has("egBookingKind"), "an older API without capabilities shows everything, as before");

const cfg = hooks.CHANNEL_ACTIVITY.voice || Object.values(hooks.CHANNEL_ACTIVITY)[0];
const card = (type) => Object.assign({ id: "c-" + type, capture_type: type, status: "in_progress", channel: "voice",
  created_at: new Date().toISOString(), summary: "you would like someone to call you back", details: {},
  contact: { name: "Asha", phone: "+12015550123" } });
for (const type of ["lead", "quote", "catering"]) {
  box.innerHTML = hooks.renderCaptureTile(card(type), cfg);
  const buttons = Array.from(box.querySelectorAll("button, a")).map((b) => b.textContent.trim());
  assert(buttons.includes("Call back") && buttons.includes("Mark handled"), type + ": Call back and Mark handled");
  assert(!buttons.includes("Ready") && !buttons.includes("Start"), type + ": never the order steps");
}

box.innerHTML = hooks.guidanceRulesHtml({ understood_rules: ["Prices are never said", "Phone numbers are masked"] });
assert(/Prices are never said/.test(box.textContent) && /every reply/.test(box.textContent), "what the guidance switched on, applied to every reply");

console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
process.exit(failures ? 1 : 0);
