// Leads & Contacts made easy to follow: the explainer, a Leads count per
// contact, the contact drawer (edit details, the person's leads, merge the
// same person recorded twice), and the lead drawer's way to its contact.
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

function buildPage(answer) {
  const dom = new JSDOM(`<!doctype html><html><body><div id="egApp"></div></body></html>`,
    { url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true });
  const win = dom.window;
  win.EDGIFY_CONFIG = { API_BASE_URL: "http://fake-api", SESSION_IDLE_TIMEOUT_MINUTES: 10 };
  win.__EXPOSE_PORTAL_TEST_HOOKS__ = true;
  const calls = [];
  win.fetch = (url, opts) => {
    calls.push({ url: String(url), opts });
    const reply = answer ? answer(String(url), opts) : null;
    const r = reply || { status: 200, body: [] };
    return Promise.resolve({
      ok: r.status < 400, status: r.status,
      json: () => Promise.resolve(r.body), text: () => Promise.resolve(JSON.stringify(r.body))
    });
  };
  win.eval(source);
  const hooks = win.__portalTestHooks;
  hooks.state.token = "fake-token";
  hooks.state.user = { id: "u1", role: "owner", email: "owner@test", tenant_id: "t1" };
  return { win, hooks, calls };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

const KEEP = { id: "c1", first_name: "Vishesh", last_name: null, phone: "+15125550100", email: null, created_at: "2026-10-12T10:00:00Z" };
const DUP = { id: "c2", first_name: "visheshWebE", last_name: null, phone: null, email: "vk@example.com", created_at: "2026-10-18T10:00:00Z" };
const LEADS = [
  { id: "l1", contact_id: "c1", status: "new", source: "website_chat", title: "Website appointment", created_at: "2026-10-12T10:00:00Z" },
  { id: "l2", contact_id: "c2", status: "new", source: "website_chat", title: "Website lead", created_at: "2026-10-18T10:00:00Z" }
];

function seed(hooks) {
  hooks.state.view = "leads";
  hooks.state.contacts = [Object.assign({}, KEEP), Object.assign({}, DUP)];
  hooks.state.leads = LEADS.map((l) => Object.assign({}, l));
}

const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

test("the page explains contact vs lead, and counts each person's leads", async () => {
  const { win, hooks } = buildPage();
  seed(hooks);
  hooks.state.tab = "contacts";
  hooks.render();
  const doc = win.document;
  const explainer = doc.getElementById("egLeadsExplainer");
  assert(explainer && /Contact.*the person/.test(explainer.textContent) && /Lead.*one enquiry/.test(explainer.textContent), "explainer shown");
  const header = Array.from(doc.querySelectorAll("th")).map((th) => th.textContent);
  assert(header.includes("Leads"), "a Leads column");
});

test("the contact drawer edits details and lists the person's leads", async () => {
  const { win, hooks, calls } = buildPage((url, opts) => opts && opts.method === "PATCH"
    ? { status: 200, body: Object.assign({}, KEEP, { last_name: "Kumar" }) } : null);
  seed(hooks);
  hooks.state.contactDrawerId = "c1";
  hooks.render();
  const doc = win.document;
  assert(doc.querySelector('[data-contact-lead="l1"]') && !doc.querySelector('[data-contact-lead="l2"]'), "only this person's leads");
  doc.getElementById("egContactLast").value = "Kumar";
  doc.getElementById("egContactSave").click();
  await tick(); await tick();
  const patch = calls.find((c) => c.opts && c.opts.method === "PATCH");
  assert(patch && patch.url.endsWith("/api/v1/crm/contacts/c1") && JSON.parse(patch.opts.body).last_name === "Kumar", "saved");
  assert(hooks.state.contacts.find((c) => c.id === "c1").last_name === "Kumar", "the list shows the saved details");

  doc.querySelector('[data-contact-lead="l1"]').click();
  assert(hooks.state.leadDrawerId === "l1" && !hooks.state.contactDrawerId, "a lead opens its own drawer");
});

test("merging the same person recorded twice", async () => {
  const { win, hooks, calls } = buildPage((url, opts) => opts && opts.method === "POST" && /\/merge$/.test(url)
    ? { status: 200, body: Object.assign({}, KEEP, { email: "vk@example.com" }) } : null);
  seed(hooks);
  hooks.state.contactDrawerId = "c1";
  hooks.render();
  const doc = win.document;
  const search = doc.getElementById("egMergeSearch");
  search.value = "webe";
  search.dispatchEvent(new win.Event("input"));
  assert(doc.querySelector('[data-merge-pick="c2"]') && !doc.querySelector('[data-merge-pick="c1"]'), "finds the other record, never itself");
  doc.querySelector('[data-merge-pick="c2"]').click();
  assert(/Merge visheshWebE/.test(doc.getElementById("egMergeConfirm").textContent), "asks to confirm, naming both");
  doc.getElementById("egMergeDo").click();
  await tick(); await tick();

  const post = calls.find((c) => c.opts && c.opts.method === "POST");
  assert(post && post.url.endsWith("/api/v1/crm/contacts/c2/merge") && JSON.parse(post.opts.body).into_contact_id === "c1", "merges the other into this one");
  assert(!hooks.state.contacts.some((c) => c.id === "c2"), "the duplicate is gone from the list");
  assert(hooks.state.leads.every((l) => l.contact_id === "c1"), "its lead now belongs to the person kept");
});

test("the lead drawer leads to its contact", async () => {
  const { win, hooks } = buildPage();
  seed(hooks);
  hooks.state.leadDrawerId = "l2";
  hooks.state.leadAppointments = [];
  hooks.render();
  win.document.getElementById("egLeadOpenContact").click();
  assert(hooks.state.contactDrawerId === "c2" && !hooks.state.leadDrawerId, "Open contact switches to the contact drawer");
});

(async () => {
  for (const t of pending) {
    console.log("\n# " + t.name);
    try { await t.fn(); } catch (e) { console.error("FAIL (threw): " + (e && e.stack || e)); failures++; }
  }
  console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
  process.exit(failures ? 1 : 0);
})();
