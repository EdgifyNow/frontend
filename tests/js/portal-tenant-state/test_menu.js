// Restaurant Menu page: shown only to restaurants; read from documents (not
// saved until Save); edit dishes, prices and choices; save; turn menu
// ordering on. And a menu order's card: each line priced, the total.
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
const tick = () => new Promise((r) => setTimeout(r, 0));

function buildPage(answer) {
  const dom = new JSDOM(`<!doctype html><html><body><div id="egApp"></div><div id="egTest"></div></body></html>`,
    { url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true });
  const win = dom.window;
  win.EDGIFY_CONFIG = { API_BASE_URL: "http://fake-api", SESSION_IDLE_TIMEOUT_MINUTES: 10 };
  win.__EXPOSE_PORTAL_TEST_HOOKS__ = true;
  win.confirm = () => true;
  const calls = [];
  win.fetch = (url, opts) => {
    calls.push({ url: String(url), opts });
    const r = (answer && answer(String(url), opts)) || { status: 200, body: [] };
    return Promise.resolve({ ok: r.status < 400, status: r.status, json: () => Promise.resolve(r.body), text: () => Promise.resolve(JSON.stringify(r.body)) });
  };
  win.eval(source);
  const hooks = win.__portalTestHooks;
  hooks.state.token = "fake-token";
  hooks.state.user = { id: "u1", role: "owner", email: "owner@test", tenant_id: "t1" };
  return { win, hooks, calls };
}

const READ = { definition: { currency: "$", items: [
  { id: "a", name: "Garlic Naan", price: "3.50", aliases: ["naan"], groups: [], available: true },
  { id: "b", name: "Chicken Biryani", price: "14.99", aliases: [], available: true, groups: [
    { id: "g", name: "Spice level", selection: "one_required", options: [{ id: "o1", label: "Mild", price_delta: "0" }, { id: "o2", label: "Hot", price_delta: "0" }] }] }
] } };

const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

test("the Menu page is for restaurants only", async () => {
  const { hooks } = buildPage();
  hooks.state.tenantSelf = { business_type: "salon" };
  assert(!hooks.navItems().some((i) => i.id === "menu"), "not for a salon");
  hooks.state.tenantSelf = { business_type: "restaurant" };
  assert(hooks.navItems().some((i) => i.id === "menu"), "shown to a restaurant");
});

test("read from documents, edit, save, turn on", async () => {
  let saved = null;
  const { win, hooks, calls } = buildPage((url, opts) => {
    if (url.endsWith("/menu/import")) return { status: 200, body: READ };
    if (url.endsWith("/menu") && opts && opts.method === "PUT") { saved = JSON.parse(opts.body).definition; return { status: 200, body: { published: false, definition: saved } }; }
    if (url.endsWith("/menu/publish")) return { status: 200, body: { published: true, definition: saved } };
    return null;
  });
  hooks.state.menu = { published: false, definition: { currency: "$", items: [] } };
  hooks.state.menuDraft = { currency: "$", items: [] };
  const doc = win.document;
  const mount = () => { doc.getElementById("egTest").innerHTML = hooks.menuHtml(); hooks.bindMenu(); };
  mount();
  assert(/No dishes yet/.test(doc.getElementById("egTest").textContent), "starts empty");

  doc.getElementById("egMenuImport").click();
  await tick(); await tick();
  assert(calls.some((c) => c.url.endsWith("/menu/import")), "asks the assistant to read the menu");
  assert(!calls.some((c) => c.opts && c.opts.method === "PUT"), "nothing saved by reading");
  mount();
  assert(doc.querySelector('[data-mi-name="1"]').value === "Chicken Biryani", "dishes shown to check");
  assert(doc.querySelector('[data-mg-sel="1:0"]').value === "one_required", "the required choice");

  const price = doc.querySelector('[data-mi-price="0"]');
  price.value = "3.75";
  price.dispatchEvent(new win.Event("input"));
  doc.querySelector('[data-mo-add="1:0"]').click();
  mount();
  const newOption = doc.querySelector('[data-mo-label="1:0:2"]');
  newOption.value = "Medium";
  newOption.dispatchEvent(new win.Event("input"));

  doc.getElementById("egMenuPublish").click();
  await tick();
  assert(/Save your changes first/.test(hooks.state.menuError || ""), "can't turn on with unsaved changes");

  mount();
  doc.getElementById("egMenuSave").click();
  await tick(); await tick();
  assert(saved && saved.items[0].price === "3.75" && saved.items[1].groups[0].options[2].label === "Medium", "saved with the edits");

  mount();
  doc.getElementById("egMenuPublish").click();
  await tick(); await tick();
  assert(hooks.state.menu.published === true, "menu ordering on");
});

test("a menu order's card shows each price and the total", async () => {
  const { win, hooks } = buildPage();
  const cfg = hooks.CHANNEL_ACTIVITY.voice || Object.values(hooks.CHANNEL_ACTIVITY)[0];
  const order = { id: "o1", capture_type: "order", status: "new", needs_review: true, channel: "voice", created_at: new Date().toISOString(),
    contact: { name: "Priya", phone: "+15125550100" }, summary: "an order",
    details: { fulfillment: "pickup", order_time: "7 pm", currency: "$", total: "23.49", lines: [
      { name: "Garlic Naan", quantity: 2, options: [], line_total: "7.00", heard_as: "two naan" },
      { name: "Chicken Biryani", quantity: 1, options: [{ label: "Medium" }, { label: "Raita" }], line_total: "16.49" }] } };
  win.document.getElementById("egTest").innerHTML = hooks.renderCaptureTile(order, cfg);
  const text = win.document.getElementById("egTest").textContent;
  assert(/Garlic Naan/.test(text) && /\$7\.00/.test(text) && /Medium, Raita/.test(text) && /\$16\.49/.test(text), "each line with its price");
  assert(/Total \$23\.49/.test(text) && /before tax/.test(text), "the total");
});

(async () => {
  for (const t of pending) {
    console.log("\n# " + t.name);
    try { await t.fn(); } catch (e) { console.error("FAIL (threw): " + (e && e.stack || e)); failures++; }
  }
  console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
  process.exit(failures ? 1 : 0);
})();
