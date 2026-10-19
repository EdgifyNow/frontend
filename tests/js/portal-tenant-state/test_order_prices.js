// A restaurant order priced from its uploaded menu: the card shows each line
// with its price and the total for staff; an order without prices shows as
// before. There is no Menu page. Real public/js/portal.js in jsdom.

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
const base = { capture_type: "order", status: "new", needs_review: true, channel: "voice", created_at: new Date().toISOString(),
  contact: { name: "Priya", phone: "+15125550100" }, summary: "you'd like to order 2 garlic naan and a chicken biryani" };

const priced = Object.assign({ id: "o1", details: { fulfillment: "pickup", order_time: "7 pm", spice_level: "medium", currency: "$", total: "21.99",
  lines: [{ name: "Garlic Naan", quantity: 2, unit_price: "3.50", line_total: "7.00" },
          { name: "Chicken Biryani", quantity: 1, unit_price: "14.99", line_total: "14.99" }] } }, base);
win.document.getElementById("egTest").innerHTML = hooks.renderCaptureTile(priced, cfg);
let text = win.document.getElementById("egTest").textContent;
assert(/Garlic Naan/.test(text) && /\$7\.00/.test(text) && /Chicken Biryani/.test(text) && /\$14\.99/.test(text), "each line with its price");
assert(/Total \$21\.99/.test(text) && /before tax/.test(text), "the total for staff");

const unpriced = Object.assign({ id: "o2", details: { fulfillment: "pickup", order_time: "7 pm", currency: "$", total: null,
  lines: [{ name: "Chicken Biryani", quantity: 1, unit_price: null, line_total: null }] } }, base);
win.document.getElementById("egTest").innerHTML = hooks.renderCaptureTile(unpriced, cfg);
text = win.document.getElementById("egTest").textContent;
assert(/Chicken Biryani/.test(text) && !/Total/.test(text), "no price on the menu, no total shown");

hooks.state.tenantSelf = { business_type: "restaurant" };
assert(typeof hooks.menuHtml === "undefined", "there is no Menu page");

console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
process.exit(failures ? 1 : 0);
