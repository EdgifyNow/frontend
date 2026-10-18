// Business types: the platform admin's list and editor (questions per kind
// of request, required ones locked, add/move/remove, knowledge checklist,
// save as a new version with problems shown inline, history with revert),
// the business type on the new-client form and Client details, and the
// owner's "My questions" editor (reword, turn off optional, add their own).
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
  const dom = new JSDOM(`<!doctype html><html><body><div id="egApp"></div><div id="egTest"></div></body></html>`,
    { url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true });
  const win = dom.window;
  win.EDGIFY_CONFIG = { API_BASE_URL: "http://fake-api", SESSION_IDLE_TIMEOUT_MINUTES: 10 };
  win.__EXPOSE_PORTAL_TEST_HOOKS__ = true;
  const calls = [];
  win.fetch = (url, opts) => {
    calls.push({ url: String(url), opts });
    const reply = answer ? answer(String(url), opts) : { status: 200, body: {} };
    return Promise.resolve({
      ok: reply.status < 400, status: reply.status,
      json: () => Promise.resolve(reply.body), text: () => Promise.resolve(JSON.stringify(reply.body))
    });
  };
  win.eval(source);
  const hooks = win.__portalTestHooks;
  hooks.state.token = "fake-token";
  hooks.state.user = { id: "u1", role: "platform_admin", email: "admin@edgify.test" };
  return { win, hooks, calls };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

const SALON = {
  label: "Salon / Spa",
  requests: [{ type: "appointment", questions: [
    { field: "service", ask: "Which service would you like?", required: true },
    { field: "date", ask: "What day works for you?", required: true },
    { field: "time", ask: "And what time?", required: true },
    { field: "stylist", ask: "Do you have a preferred stylist?", required: false },
    { field: "name", ask: "And what name should I put that under?", required: true }
  ] }],
  defaults: { booking_kind: "appointment", bookings_need_approval: false },
  knowledge_checklist: [{ fact: "Opening hours", level: "required" }]
};
function detail(definition, version) {
  return {
    key: "salon", version: version || 1, definition: JSON.parse(JSON.stringify(definition || SALON)),
    versions: [{ version: version || 1, note: "EdgifyNow default", created_by: null, created_at: "2026-10-19T10:00:00Z" }],
    request_types: { order: "Order", reservation: "Table reservation", catering: "Catering request", appointment: "Appointment", service_visit: "Service visit", quote: "Quote request" },
    required_fields: { appointment: ["date", "time", "name"], quote: ["issue", "name"] },
    max_questions_per_request: 10
  };
}

const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

test("the admin's list shows each type with what it takes, its questions and clients", () => {
  const { hooks } = buildPage();
  hooks.state.businessTypes = [
    { key: "garage_door", label: "Garage door repair", version: 1, updated_at: "2026-10-19T10:00:00Z", requests: ["Service visit", "Quote request"], question_count: 10, client_count: 1 },
    { key: "other", label: "Other", version: 1, updated_at: "2026-10-19T10:00:00Z", requests: ["Appointment"], question_count: 4, client_count: 7 }
  ];
  const html = hooks.businessTypesHtml();
  assert(html.includes("Garage door repair") && html.includes("Service visit, Quote request") && html.includes('data-bt-open="garage_door"'), "each type is listed and opens");
});

test("in the editor, required questions are locked and the rest can be added, moved and removed", async () => {
  const { win, hooks } = buildPage();
  hooks.state.view = "businessTypeEdit";
  hooks.state.btEditKey = "salon";
  hooks.state.btDetail = detail();
  hooks.state.btDraft = JSON.parse(JSON.stringify(SALON));
  const mount = () => { win.document.getElementById("egTest").innerHTML = hooks.businessTypeEditHtml(); hooks.bindBusinessTypeEdit(); };
  mount();
  const del = (i) => win.document.querySelector('[data-bt-del="0:' + i + '"]');
  assert(del(1).disabled && !del(3).disabled, "a required question can't be removed; an optional one can");
  assert(win.document.querySelector('[data-bt-field="0:1"]').hasAttribute("readonly"), "a required question's field is fixed");
  assert(win.document.body.innerHTML.includes("5 / 10 questions"), "shows the count against the limit");

  win.document.querySelector('[data-bt-ask="0:0"]').value = "Which treatment are you booking?";
  win.document.querySelector('[data-bt-add="0"]').click();
  mount();
  assert(hooks.state.btDraft.requests[0].questions.length === 6, "a question was added");
  assert(hooks.state.btDraft.requests[0].questions[0].ask === "Which treatment are you booking?", "what was typed is kept when the list changes");
});

test("saving sends the whole template; a refused edit shows why and keeps the draft", async () => {
  let refuse = true;
  const { win, hooks, calls } = buildPage((url, opts) => (opts && opts.method === "PUT")
    ? (refuse ? { status: 422, body: { detail: "Appointment: a question for 'name' is required" } } : { status: 200, body: detail(SALON, 2) })
    : { status: 200, body: {} });
  hooks.state.view = "businessTypeEdit";
  hooks.state.btEditKey = "salon";
  hooks.state.btDetail = detail();
  hooks.state.btDraft = JSON.parse(JSON.stringify(SALON));
  hooks.render();
  win.document.getElementById("egBtLabel").value = "Beauty salon";
  win.document.getElementById("egBtSave").click();
  await tick(); await tick();
  const put = calls.find((c) => c.opts && c.opts.method === "PUT");
  assert(put && put.url.endsWith("/api/v1/admin/business-types/salon") && JSON.parse(put.opts.body).definition.label === "Beauty salon", "the edited template is sent");
  assert(win.document.body.innerHTML.includes("a question for &#39;name&#39; is required") || win.document.body.innerHTML.includes("a question for 'name' is required"), "the reason is shown on the page");
  assert(hooks.state.btDraft.label === "Beauty salon", "the draft is kept after a refusal");
});

test("the new-client form and Client details carry the business type", async () => {
  const { win, hooks, calls } = buildPage((url) => /\/admin\/tenants$/.test(url) ? { status: 200, body: [] } : { status: 200, body: {} });
  hooks.state.businessTypes = [{ key: "other", label: "Other" }, { key: "garage_door", label: "Garage door repair" }];
  hooks.state.tenants = [];
  win.document.getElementById("egTest").innerHTML = hooks.tenantsHtml();
  hooks.bindTenants();
  assert(win.document.getElementById("egNewClientBusinessType").value === "other", "a new client starts as Other");
  win.document.getElementById("egContactName").value = "Dana";
  win.document.getElementById("egOwnerEmail").value = "dana@doors.example";
  win.document.getElementById("egContactPhone").value = "(415) 555-0148";
  win.document.getElementById("egTenantSlug").value = "doors";
  win.document.getElementById("egNewClientBusinessType").value = "garage_door";
  win.document.getElementById("egCreateTenant").click();
  await tick();
  const post = calls.find((c) => c.opts && c.opts.method === "POST");
  assert(post && JSON.parse(post.opts.body).business_type === "garage_door", "the chosen type is sent");

  hooks.state.tenantDetail = { id: "t1", slug: "doors", status: "active", business_type: "garage_door", created_at: "2026-10-19T10:00:00Z" };
  assert(hooks.tenantDetailHtml().includes('value="garage_door" selected'), "Client details shows the client's type");
});

const PROFILE = {
  business_type: "salon", label: "Salon / Spa", max_questions_per_request: 10,
  requests: [{ type: "appointment", label: "Appointment", questions: [
    { field: "service", ask: "Which service would you like?", template_ask: "Which service would you like?", required: true, enabled: true, reworded: false, source: "template" },
    { field: "date", ask: "What day works for you?", template_ask: "What day works for you?", required: true, enabled: true, reworded: false, source: "template" },
    { field: "stylist", ask: "Do you have a preferred stylist?", template_ask: "Do you have a preferred stylist?", required: false, enabled: true, reworded: false, source: "template" }
  ] }],
  knowledge_checklist: [{ fact: "Opening hours", level: "required", source: "template" }]
};

test("the owner rewords, turns off and adds questions, and saves only their changes", async () => {
  const { win, hooks, calls } = buildPage((url, opts) => ({ status: 200, body: opts && opts.method === "PUT" ? PROFILE : {} }));
  hooks.state.user = { id: "o1", role: "owner", email: "owner@salon.example" };
  hooks.state.view = "questions";
  hooks.state.myQuestions = JSON.parse(JSON.stringify(PROFILE));
  hooks.render();
  const doc = win.document;
  assert(doc.body.innerHTML.includes("Business type: <b>Salon / Spa</b>"), "shows their business type");
  assert(!doc.querySelector('[data-mq-on="0:0"]') && doc.querySelector('[data-mq-on="0:2"]'), "required questions can't be turned off; optional ones can");

  doc.querySelector('[data-mq-ask="0:0"]').value = "Which treatment are you booking?";
  doc.querySelector('[data-mq-on="0:2"]').checked = false;
  doc.querySelector('[data-mq-on="0:2"]').dispatchEvent(new win.Event("change"));
  doc.querySelector('[data-mq-new="0"]').value = "Any allergies to hair products?";
  doc.querySelector('[data-mq-add="0"]').click();
  doc.getElementById("egmqNewFact").value = "Bridal packages";
  doc.getElementById("egmqAddFact").click();
  doc.getElementById("egmqSave").click();
  await tick();

  const put = calls.find((c) => c.opts && c.opts.method === "PUT");
  const custom = put && JSON.parse(put.opts.body).custom;
  assert(put && put.url.endsWith("/api/v1/tenants/me/questions"), "saved to their own questions");
  const change = custom.requests.appointment;
  assert(change.wording.service === "Which treatment are you booking?" && !("date" in change.wording), "only the reworded question is sent as a rewording");
  assert(change.off.length === 1 && change.off[0] === "stylist", "the turned-off question");
  assert(change.added.length === 1 && change.added[0].ask === "Any allergies to hair products?" && /^any_allergies/.test(change.added[0].field), "their own question, with a field made from its words");
  assert(custom.knowledge.length === 1 && custom.knowledge[0].fact === "Bridal packages", "their extra fact");
});

(async () => {
  for (const t of pending) {
    console.log("\n# " + t.name);
    try { await t.fn(); } catch (e) { console.error("FAIL (threw): " + (e && e.stack || e)); failures++; }
  }
  console.log("\n" + (failures ? failures + " FAILED" : "all passed"));
  process.exit(failures ? 1 : 0);
})();
