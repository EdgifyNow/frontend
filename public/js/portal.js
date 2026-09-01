(function(){
  var API_BASE = (window.EDGIFY_CONFIG && window.EDGIFY_CONFIG.API_BASE_URL) || "https://api-dev.edgifynow.com";
  var TOKEN_KEY = "eg_portal_token";
  var root = document.getElementById("egApp");
  function AND(){ for (var i=0;i<arguments.length;i++){ if(!arguments[i]) return false; } return true; }

  var state = {
    token: localStorage.getItem(TOKEN_KEY) || null,
    user: null,
    view: "dashboard",
    tab: "leads",
    booting: true,
    error: null,
    loading: false,
    leads: null,
    contacts: null,
    documents: null,
    assistants: null,
    tenants: null,
    selectedAssistantId: null,
    chatLog: [],
    toast: null,
    demoDoc: null,
    demoPolling: false,
    demoChatLog: [],
    demoLeadResult: null,
    tenantDetail: null,
    tenantDetailId: null,
    pendingClientPassword: null
  };

  function esc(s){
    if (s === null || s === undefined) return "";
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  function fmtDate(d){
    if (!d) return "-";
    try { return new Date(d).toLocaleString(); } catch(e){ return d; }
  }
  function slugify(s){
    return String(s || "").toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 60);
  }
  function genPassword(){
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    var out = "";
    for (var i = 0; i < 12; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }
  function isValidEmail(s){
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || "");
  }
  function usPhoneDigits(s){
    var digits = String(s || "").replace(/\D/g, "");
    if (digits.length === 11 && digits.charAt(0) === "1") digits = digits.substring(1);
    return digits;
  }
  function isValidUsPhone(s){
    return usPhoneDigits(s).length === 10;
  }
  function normalizeUsPhone(s){
    var digits = usPhoneDigits(s);
    return digits.length === 10 ? ("+1" + digits) : String(s || "").trim();
  }

  function api(path, opts){
    opts = opts || {};
    var headers = opts.headers || {};
    if (state.token) headers["Authorization"] = "Bearer " + state.token;
    var isForm = AND(typeof FormData !== "undefined", opts.body instanceof FormData);
    if (AND(!isForm, opts.body, typeof opts.body !== "string")) opts.body = JSON.stringify(opts.body);
    if (AND(!isForm, opts.body)) headers["Content-Type"] = "application/json";
    return fetch(API_BASE + path, { method: opts.method || "GET", headers: headers, body: opts.body })
      .then(function(res){
        if (res.status === 401) {
          doLogout();
          var e = new Error("Session expired. Please log in again.");
          throw e;
        }
        return res.text().then(function(txt){
          var data = null;
          try { data = txt ? JSON.parse(txt) : null; } catch(e){ data = null; }
          if (!res.ok) {
            var msg = "Request failed (" + res.status + ")";
            if (data ? data.detail : false) {
              msg = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
            }
            throw new Error(msg);
          }
          return data;
        });
      });
  }

  function showToast(msg, isError){
    state.toast = { msg: msg, isError: !!isError };
    render();
    setTimeout(function(){ state.toast = null; render(); }, 3200);
  }

  function doLogout(){
    state.token = null;
    state.user = null;
    localStorage.removeItem(TOKEN_KEY);
    state.leads = state.contacts = state.documents = state.assistants = state.tenants = null;
    state.view = "dashboard";
    render();
  }

  function doLogin(email, password){
    state.error = null;
    state.loading = true;
    render();
    api("/api/v1/auth/login", { method: "POST", body: { email: email, password: password } })
      .then(function(data){
        state.token = data.access_token;
        localStorage.setItem(TOKEN_KEY, state.token);
        return api("/api/v1/auth/me");
      })
      .then(function(me){
        state.user = me;
        state.loading = false;
        state.view = "dashboard";
        render();
        loadDashboardData();
      })
      .catch(function(err){
        state.loading = false;
        state.error = err.message || "Login failed";
        render();
      });
  }

  function init(){
    if (state.token) {
      api("/api/v1/auth/me").then(function(me){
        state.user = me;
        state.booting = false;
        render();
        loadDashboardData();
      }).catch(function(){
        state.token = null;
        localStorage.removeItem(TOKEN_KEY);
        state.booting = false;
        render();
      });
    } else {
      state.booting = false;
      render();
    }
  }

  function isAdmin(){ return state.user ? state.user.role === "platform_admin" : false; }

  function loadDashboardData(){
    if (isAdmin()) {
      api("/api/v1/admin/tenants").then(function(d){ state.tenants = d; render(); }).catch(function(){});
    } else {
      api("/api/v1/crm/leads").then(function(d){ state.leads = d; render(); }).catch(function(){});
      api("/api/v1/documents").then(function(d){ state.documents = d; render(); }).catch(function(){});
      api("/api/v1/assistants").then(function(d){ state.assistants = d; render(); }).catch(function(){});
    }
  }

  function ensureLeads(cb){
    if (state.leads) { cb(); return; }
    api("/api/v1/crm/leads").then(function(d){ state.leads = d; render(); }).catch(function(err){ showToast(err.message, true); });
  }
  function ensureContacts(cb){
    if (state.contacts) { cb(); return; }
    api("/api/v1/crm/contacts").then(function(d){ state.contacts = d; render(); }).catch(function(err){ showToast(err.message, true); });
  }
  function ensureDocuments(){
    api("/api/v1/documents").then(function(d){ state.documents = d; render(); }).catch(function(err){ showToast(err.message, true); });
  }
  function ensureAssistants(){
    api("/api/v1/assistants").then(function(d){
      state.assistants = d;
      if (!state.selectedAssistantId) { if (d) { if (d.length) { state.selectedAssistantId = d[0].id; } } }
      render();
    }).catch(function(err){ showToast(err.message, true); });
  }
  function ensureTenants(){
    api("/api/v1/admin/tenants").then(function(d){ state.tenants = d; render(); }).catch(function(err){ showToast(err.message, true); });
  }

  function openTenantDetail(id){
    state.view = "tenantDetail";
    state.tenantDetailId = id;
    state.tenantDetail = null;
    render();
    api("/api/v1/admin/tenants/" + id).then(function(d){
      state.tenantDetail = d;
      render();
    }).catch(function(err){ showToast(err.message, true); });
  }

  function setView(v){
    state.view = v;
    if (v === "leads") { ensureLeads(function(){}); ensureContacts(function(){}); }
    if (v === "knowledge") ensureDocuments();
    if (v === "assistant") ensureAssistants();
    if (v === "tenants") ensureTenants();
    if (v === "demo") { ensureAssistants(); ensureDocuments(); }
    render();
  }

  // ---------- RENDER ----------
  function render(){
    if (state.booting) {
      root.innerHTML = '<div class="eg-login-wrap"><div style="color:#fff;font-size:14px">Loading...</div></div>';
      return;
    }
    if (!state.user) { renderLogin(); return; }
    renderShell();
  }

  function renderLogin(){
    var errHtml = state.error ? '<div class="eg-error">' + esc(state.error) + '</div>' : '';
    var asParam = new URLSearchParams(location.search).get('as');
    var subText = asParam === 'admin' ? 'Sign in to your Admin workspace' : (asParam === 'client' ? 'Sign in to your Client workspace' : 'Sign in to your Admin or Client workspace');
    root.innerHTML =
      '<div class="eg-login-wrap"><div class="eg-login-card">' +
      '<div class="eg-login-brand">EdgifyNow</div>' +
      '<div class="eg-login-sub">' + subText + '</div>' +
      errHtml +
      '<form id="egLoginForm">' +
      '<div class="eg-form-row"><label>Email</label><input class="eg-input" type="email" id="egEmail" required autocomplete="username" /></div>' +
      '<div class="eg-form-row"><label>Password</label><input class="eg-input" type="password" id="egPassword" required autocomplete="current-password" /></div>' +
      '<button type="submit" class="eg-btn" id="egLoginBtn" style="width:100%">' + (state.loading ? '<span class="eg-spin"></span>Signing in...' : 'Sign In') + '</button>' +
      '</form>' +
      '<div class="eg-small eg-muted" style="margin-top:16px">API: ' + esc(API_BASE) + '</div>' +
      '</div></div>';
    var form = document.getElementById("egLoginForm");
    if (form) {
      form.addEventListener("submit", function(e){
        e.preventDefault();
        var email = document.getElementById("egEmail").value.trim();
        var pw = document.getElementById("egPassword").value;
        doLogin(email, pw);
      });
    }
  }

  function navItems(){
    if (isAdmin()) {
      return [
        { id: "dashboard", label: "Overview", icon: "◉" },
        { id: "tenants", label: "Clients", icon: "▦" },
        { id: "demo", label: "Instant Demo", icon: "⚡" }
      ];
    }
    return [
      { id: "dashboard", label: "Dashboard", icon: "◉" },
      { id: "leads", label: "Leads & Contacts", icon: "◫" },
      { id: "knowledge", label: "Knowledge", icon: "▤" },
      { id: "assistant", label: "AI Assistant", icon: "◎" },
      { id: "demo", label: "Instant Demo", icon: "⚡" }
    ];
  }

  function renderShell(){
    var items = navItems();
    var navHtml = items.map(function(it){
      var isActive = state.view === it.id || (it.id === "tenants" && state.view === "tenantDetail");
      var cls = "eg-navitem" + (isActive ? " active" : "");
      return '<div class="' + cls + '" data-nav="' + it.id + '">' + it.icon + ' ' + esc(it.label) + '</div>';
    }).join("");

    var roleLabel = isAdmin() ? "Platform Admin" : (state.user.role === "owner" ? "Owner" : "Employee");
    var initials = (state.user.email || "U").substring(0,2).toUpperCase();

    var toastHtml = "";
    if (state.toast) {
      toastHtml = '<div style="position:fixed;bottom:20px;right:20px;z-index:9999;background:' + (state.toast.isError ? '#c24141' : '#168a5b') + ';color:#fff;padding:12px 16px;border-radius:10px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.25)">' + esc(state.toast.msg) + '</div>';
    }

    root.innerHTML =
      '<div class="eg-shell">' +
      '<aside class="eg-sidebar">' +
      '<div class="eg-brand">EdgifyNow <span>' + (isAdmin() ? "Admin" : "Client") + '</span></div>' +
      '<div class="eg-navgroup">' + (isAdmin() ? "Platform" : "Workspace") + '</div>' +
      navHtml +
      '<div class="eg-navitem logout" data-nav="logout">✕ Log out</div>' +
      '</aside>' +
      '<main class="eg-main">' +
      '<div class="eg-topbar">' +
      '<div><div class="eg-h1">' + viewTitle() + '</div><div class="eg-sub">' + viewSub() + '</div></div>' +
      '<div class="eg-user"><div class="eg-avatar">' + esc(initials) + '</div><div><b>' + esc(state.user.email) + '</b><div class="eg-small eg-muted">' + esc(roleLabel) + '</div></div></div>' +
      '</div>' +
      '<div id="egContent"></div>' +
      '</main>' +
      '</div>' + toastHtml;

    document.querySelectorAll("[data-nav]").forEach(function(el){
      el.addEventListener("click", function(){
        var v = el.getAttribute("data-nav");
        if (v === "logout") { doLogout(); return; }
        setView(v);
      });
    });

    renderContent();
  }

  function viewTitle(){
    if (state.view === "dashboard") return isAdmin() ? "Platform Overview" : ("Good day, " + (state.user.email.split("@")[0]));
    if (state.view === "leads") return "Leads & Contacts";
    if (state.view === "knowledge") return "Knowledge Base";
    if (state.view === "assistant") return "AI Assistant";
    if (state.view === "tenants") return "Clients";
    if (state.view === "tenantDetail") return state.tenantDetail ? (state.tenantDetail.name || state.tenantDetail.slug) : "Client details";
    if (state.view === "demo") return "Instant Demo";
    return "";
  }
  function viewSub(){
    if (state.view === "dashboard") return isAdmin() ? "Monitor clients from one place." : "Your AI assistant, CRM and channels in one workspace.";
    if (state.view === "leads") return "Contacts and leads captured from your website and channels.";
    if (state.view === "knowledge") return "Documents powering your AI assistant's answers.";
    if (state.view === "assistant") return "Configure and test your AI assistant.";
    if (state.view === "tenants") return "Manage EdgifyNow client workspaces.";
    if (state.view === "tenantDetail") return "Client account, billing and usage.";
    if (state.view === "demo") return "Upload a document and get a live AI answer, right now.";
    return "";
  }

  function renderContent(){
    var el = document.getElementById("egContent");
    if (!el) return;
    if (state.view === "dashboard") { el.innerHTML = isAdmin() ? adminDashboardHtml() : clientDashboardHtml(); bindDashboard(); return; }
    if (state.view === "leads") { el.innerHTML = leadsHtml(); bindLeads(); return; }
    if (state.view === "knowledge") { el.innerHTML = knowledgeHtml(); bindKnowledge(); return; }
    if (state.view === "assistant") { el.innerHTML = assistantHtml(); bindAssistant(); return; }
    if (state.view === "tenants") { el.innerHTML = tenantsHtml(); bindTenants(); return; }
    if (state.view === "tenantDetail") { el.innerHTML = tenantDetailHtml(); bindTenantDetail(); return; }
    if (state.view === "demo") { el.innerHTML = demoHtml(); bindDemo(); return; }
  }

  // ---- Dashboard ----
  function clientDashboardHtml(){
    var leadsCount = state.leads ? state.leads.length : "-";
    var docsCount = state.documents ? state.documents.length : "-";
    var indexed = state.documents ? state.documents.filter(function(d){return d.status==="indexed";}).length : 0;
    var assistantsCount = state.assistants ? state.assistants.length : "-";
    var activeAssistant = state.assistants ? state.assistants.filter(function(a){return a.is_active;}).length : 0;

    var recentLeads = (state.leads || []).slice(0,5).map(function(l){
      return '<tr><td><b>' + esc(l.title || "Untitled") + '</b><div class="eg-small eg-muted">' + esc(l.service_interest || "") + '</div></td>' +
        '<td><span class="eg-tag">' + esc(l.source) + '</span></td>' +
        '<td>' + statusPill(l.status) + '</td></tr>';
    }).join("");

    return '<div class="eg-hero"><div class="eg-row"><div><h2>Your AI Assistant workspace</h2><p>Website chat, contact form and CRM data flow into this dashboard.</p></div></div></div>' +
      '<div class="eg-grid4">' +
      '<div class="eg-card eg-metric"><div class="eg-label">Leads</div><div class="eg-value">' + leadsCount + '</div></div>' +
      '<div class="eg-card eg-metric"><div class="eg-label">Knowledge documents</div><div class="eg-value">' + docsCount + '</div></div>' +
      '<div class="eg-card eg-metric"><div class="eg-label">Documents indexed</div><div class="eg-value">' + indexed + '</div></div>' +
      '<div class="eg-card eg-metric"><div class="eg-label">Active assistants</div><div class="eg-value">' + activeAssistant + ' / ' + assistantsCount + '</div></div>' +
      '</div>' +
      '<div class="eg-card"><div class="eg-row"><h3>Recent leads</h3><button class="eg-btn secondary" data-goto="leads">View all</button></div>' +
      (recentLeads ? '<table class="eg-table"><thead><tr><th>Lead</th><th>Source</th><th>Status</th></tr></thead><tbody>' + recentLeads + '</tbody></table>' : '<div class="eg-empty">No leads yet.</div>') +
      '</div>';
  }

  // package / ai_usage_allowance / ai_usage_current_period / status are now
  // real fields on GET /api/v1/admin/tenants (confirmed against the current
  // openapi.json - this was placeholder demo data before the backend added
  // these; there is still no updated_at field on this resource, so
  // "Created" can't be swapped for a real last-updated time).
  function statusPillForTenant(t){
    var map = {
      active: "green",
      trial: "amber",
      paused: "",
      churned: "red"
    };
    var cls = "eg-pill" + (map[t.status] ? " " + map[t.status] : "");
    var label = t.status ? (t.status.charAt(0).toUpperCase() + t.status.slice(1)) : (t.is_active ? "Active" : "Inactive");
    return '<span class="' + cls + '">' + esc(label) + '</span>';
  }

  // There is no updated_at field on the tenant resource (checked
  // openapi.json). This column is explicitly demo-only, requested for
  // demo purposes - deterministic per tenant id (not random) so it stays
  // stable across renders, and clearly labelled as demo data in both the
  // column header and the disclosure note below the table so it can't be
  // mistaken for something the API actually returns. Remove this function
  // and column the moment a real updated_at field exists.
  function demoLastUpdatedFor(tenant){
    var id = tenant.id || tenant.slug || "";
    var seed = 0;
    for (var i = 0; i < id.length; i++) seed = (seed + id.charCodeAt(i) * (i + 1)) % 100000;
    var created = tenant.created_at ? new Date(tenant.created_at).getTime() : Date.now();
    var now = Date.now();
    var span = Math.max(now - created, 0);
    var offset = span * ((seed % 1000) / 1000);
    return new Date(created + offset);
  }

  function adminDashboardHtml(){
    var tenants = state.tenants || [];
    var rows = tenants.map(function(t){
      var allowance = t.ai_usage_allowance;
      var used = t.ai_usage_current_period || 0;
      var usageHtml;
      if (allowance) {
        var pct = Math.round((used / allowance) * 100);
        usageHtml = used.toLocaleString() + ' / ' + allowance.toLocaleString() + '<div class="eg-small eg-muted">' + pct + '% used</div>';
      } else {
        usageHtml = used.toLocaleString() + '<div class="eg-small eg-muted">no allowance set</div>';
      }
      var demoUpdatedAt = demoLastUpdatedFor(t);
      return '<tr class="eg-clickrow" data-tenant-id="' + esc(t.id) + '" style="cursor:pointer"><td><b>' + esc(t.name) + '</b><div class="eg-small eg-muted">' + esc(t.slug) + '</div></td>' +
        '<td>' + statusPillForTenant(t) + '</td>' +
        '<td>' + (t.package ? '<span class="eg-tag">' + esc(t.package) + '</span>' : '<span class="eg-small eg-muted">Not set</span>') + '</td>' +
        '<td>' + usageHtml + '</td>' +
        '<td>' + (allowance ? allowance.toLocaleString() + '/mo' : '<span class="eg-small eg-muted">&mdash;</span>') + '</td>' +
        '<td class="eg-small eg-muted">' + fmtDate(t.created_at) + '</td>' +
        '<td class="eg-small eg-muted">' + fmtDate(demoUpdatedAt) + '</td></tr>';
    }).join("");
    return '<div class="eg-grid4">' +
      '<div class="eg-card eg-metric"><div class="eg-label">Total clients</div><div class="eg-value">' + tenants.length + '</div></div>' +
      '<div class="eg-card eg-metric"><div class="eg-label">Active clients</div><div class="eg-value">' + tenants.filter(function(t){return t.is_active;}).length + '</div></div>' +
      '</div>' +
      '<div class="eg-card"><div class="eg-row"><h3>Client health</h3><button class="eg-btn" data-goto="tenants">Manage clients</button></div>' +
      (rows ? '<table class="eg-table"><thead><tr><th>Client</th><th>Status</th><th>Package</th><th>Usage</th><th>Allowance</th><th>Created</th><th>Last Updated</th></tr></thead><tbody>' + rows + '</tbody></table>' : '<div class="eg-empty">No clients yet.</div>') +
      (rows ? '<div class="eg-small eg-muted" style="margin-top:10px">Client / Status / Package / Usage / Allowance / Created are live from GET /api/v1/admin/tenants. “Last Updated” is placeholder demo data only — there is no updated_at field on this resource yet.</div>' : "") +
      '</div>';
  }

  function bindDashboard(){
    document.querySelectorAll("[data-goto]").forEach(function(el){
      el.addEventListener("click", function(){ setView(el.getAttribute("data-goto")); });
    });
    document.querySelectorAll("[data-tenant-id]").forEach(function(row){
      row.addEventListener("click", function(){ openTenantDetail(row.getAttribute("data-tenant-id")); });
    });
  }

  function statusPill(s){
    var cls = "eg-pill";
    if (s === "won" || s === "qualified" || s === "booked") cls += " green";
    else if (s === "new" || s === "contacted") cls += " amber";
    else if (s === "lost") cls += " red";
    return '<span class="' + cls + '">' + esc(s) + '</span>';
  }

  // ---- Leads & Contacts ----
  function leadsHtml(){
    var tabs = '<div class="eg-tabs">' +
      '<div class="eg-tab' + (state.tab === "leads" ? " active" : "") + '" data-tab="leads">Leads</div>' +
      '<div class="eg-tab' + (state.tab === "contacts" ? " active" : "") + '" data-tab="contacts">Contacts</div>' +
      '</div>';

    if (state.tab === "contacts") {
      var contacts = state.contacts;
      if (!contacts) return tabs + '<div class="eg-card"><div class="eg-empty">Loading contacts...</div></div>';
      var crows = contacts.map(function(c){
        var name = ((c.first_name || "") + " " + (c.last_name || "")).trim() || "(no name)";
        return '<tr><td><b>' + esc(name) + '</b></td><td>' + esc(c.email || "-") + '</td><td>' + esc(c.phone || "-") + '</td><td>' + esc(c.company || "-") + '</td><td class="eg-small eg-muted">' + fmtDate(c.created_at) + '</td></tr>';
      }).join("");
      return tabs + '<div class="eg-card">' +
        (crows ? '<table class="eg-table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Company</th><th>Created</th></tr></thead><tbody>' + crows + '</tbody></table>' : '<div class="eg-empty">No contacts yet.</div>') +
        '</div>';
    }

    var leads = state.leads;
    if (!leads) return tabs + '<div class="eg-card"><div class="eg-empty">Loading leads...</div></div>';
    var statusOptions = ["new","contacted","qualified","booked","won","lost"];
    var lrows = leads.map(function(l){
      var opts = statusOptions.map(function(s){
        return '<option value="' + s + '"' + (s === l.status ? " selected" : "") + '>' + s + '</option>';
      }).join("");
      return '<tr><td><b>' + esc(l.title || "Untitled") + '</b><div class="eg-small eg-muted">' + esc(l.service_interest || "") + '</div></td>' +
        '<td><span class="eg-tag">' + esc(l.source) + '</span></td>' +
        '<td>' + esc(l.priority) + '</td>' +
        '<td><select class="eg-select" style="padding:6px 8px;font-size:12px" data-lead-status="' + esc(l.id) + '">' + opts + '</select></td>' +
        '<td class="eg-small eg-muted">' + fmtDate(l.created_at) + '</td></tr>';
    }).join("");
    return tabs + '<div class="eg-card">' +
      (lrows ? '<table class="eg-table"><thead><tr><th>Lead</th><th>Source</th><th>Priority</th><th>Status</th><th>Created</th></tr></thead><tbody>' + lrows + '</tbody></table>' : '<div class="eg-empty">No leads yet.</div>') +
      '</div>';
  }

  function bindLeads(){
    document.querySelectorAll("[data-tab]").forEach(function(el){
      el.addEventListener("click", function(){
        state.tab = el.getAttribute("data-tab");
        if (state.tab === "contacts") ensureContacts(function(){});
        render();
      });
    });
    document.querySelectorAll("[data-lead-status]").forEach(function(el){
      el.addEventListener("change", function(){
        var id = el.getAttribute("data-lead-status");
        var newStatus = el.value;
        api("/api/v1/crm/leads/" + id, { method: "PATCH", body: { status: newStatus } })
          .then(function(updated){
            state.leads = state.leads.map(function(l){ return l.id === updated.id ? updated : l; });
            showToast("Lead status updated");
          })
          .catch(function(err){ showToast(err.message, true); });
      });
    });
  }

  // ---- Knowledge ----
  function knowledgeHtml(){
    var docs = state.documents;
    var body = "";
    if (!docs) body = '<div class="eg-empty">Loading documents...</div>';
    else if (!docs.length) body = '<div class="eg-empty">No documents uploaded yet.</div>';
    else {
      var rows = docs.map(function(d){
        var pillCls = "eg-pill";
        if (d.status === "indexed") pillCls += " green";
        else if (d.status === "processing" || d.status === "pending") pillCls += " amber";
        else if (d.status === "failed") pillCls += " red";
        return '<div class="eg-listitem"><span><b>' + esc(d.filename) + '</b><div class="eg-small eg-muted">' + esc(d.content_type || "") + ' &middot; ' + fmtDate(d.created_at) + '</div></span>' +
          '<span style="display:flex;gap:8px;align-items:center">' +
          '<span class="' + pillCls + '">' + esc(d.status) + '</span>' +
          '<button class="eg-btn ghost" style="padding:6px 10px" data-doc-download="' + esc(d.id) + '">Download</button>' +
          '<button class="eg-btn danger" style="padding:6px 10px" data-doc-delete="' + esc(d.id) + '">Delete</button>' +
          '</span></div>';
      }).join("");
      body = '<div class="eg-list">' + rows + '</div>';
    }
    return '<div class="eg-card">' +
      '<div class="eg-row"><h3>Documents</h3><label class="eg-btn" style="cursor:pointer">Upload document<input type="file" id="egFileInput" accept=".pdf,.doc,.docx" style="display:none" /></label></div>' +
      body +
      '<div id="egUploadStatus" class="eg-small eg-muted" style="margin-top:10px"></div>' +
      '</div>';
  }

  function bindKnowledge(){
    var fileInput = document.getElementById("egFileInput");
    if (fileInput) {
      fileInput.addEventListener("change", function(){
        var file = fileInput.files[0];
        if (!file) return;
        var statusEl = document.getElementById("egUploadStatus");
        if (statusEl) statusEl.textContent = "Uploading " + file.name + "...";
        var fd = new FormData();
        fd.append("file", file);
        api("/api/v1/documents", { method: "POST", body: fd })
          .then(function(){
            showToast("Document uploaded");
            ensureDocuments();
          })
          .catch(function(err){ showToast(err.message, true); if (statusEl) statusEl.textContent = ""; });
      });
    }
    document.querySelectorAll("[data-doc-delete]").forEach(function(el){
      el.addEventListener("click", function(){
        var id = el.getAttribute("data-doc-delete");
        if (!confirm("Delete this document?")) return;
        api("/api/v1/documents/" + id, { method: "DELETE" })
          .then(function(){ showToast("Document deleted"); ensureDocuments(); })
          .catch(function(err){ showToast(err.message, true); });
      });
    });
    document.querySelectorAll("[data-doc-download]").forEach(function(el){
      el.addEventListener("click", function(){
        var id = el.getAttribute("data-doc-download");
        downloadDocument(id, el);
      });
    });
  }

  // Document downloads are authenticated (the API requires the same Bearer
  // token as every other call here), so a plain <a href> / window.open()
  // can't be used - the browser wouldn't send the Authorization header.
  // Fetch the file as a blob with the header attached, then hand the
  // browser a temporary object URL to save.
  function downloadDocument(id, triggerEl){
    var doc = (state.documents || []).filter(function(d){ return d.id === id; })[0];
    var filename = (doc && doc.filename) || "document";
    var originalText = triggerEl ? triggerEl.textContent : null;
    if (triggerEl) { triggerEl.disabled = true; triggerEl.textContent = "Downloading..."; }
    fetch(API_BASE + "/api/v1/documents/" + id + "/download", {
      headers: { "Authorization": "Bearer " + state.token }
    })
      .then(function(res){
        if (res.status === 401) { doLogout(); throw new Error("Session expired. Please log in again."); }
        if (!res.ok) throw new Error("Download failed (" + res.status + ")");
        return res.blob();
      })
      .then(function(blob){
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch(function(err){ showToast(err.message, true); })
      .then(function(){ if (triggerEl) { triggerEl.disabled = false; triggerEl.textContent = originalText; } });
  }

  // ---- Assistant ----
  function assistantHtml(){
    var list = state.assistants;
    if (!list) return '<div class="eg-card"><div class="eg-empty">Loading assistants...</div></div>';
    if (!list.length) return emptyAssistantHtml();
    var current = list.filter(function(a){ return a.id === state.selectedAssistantId; })[0];

    var tabsHtml = list.map(function(a){
      var cls = "eg-tab" + (a.id === state.selectedAssistantId ? " active" : "");
      return '<div class="' + cls + '" data-assistant-select="' + esc(a.id) + '">' + esc(a.name) + '</div>';
    }).join("");

    var configHtml = "";
    if (current) {
      configHtml = '<div class="eg-card">' +
        '<div class="eg-row"><h3>' + esc(current.name) + '</h3><span class="eg-pill' + (current.is_active ? ' green' : '') + '">' + (current.is_active ? "Active" : "Inactive") + '</span></div>' +
        '<div class="eg-form-row"><label>System instructions</label><textarea class="eg-textarea" id="egAssistantPrompt">' + esc(current.system_prompt || "") + '</textarea></div>' +
        '<div style="display:flex;gap:10px"><button class="eg-btn" id="egSaveAssistant">Save changes</button>' +
        '<button class="eg-btn ' + (current.is_active ? 'ghost' : 'secondary') + '" id="egToggleActive">' + (current.is_active ? "Deactivate" : "Activate") + '</button></div>' +
        '</div>';
    }

    var chatMsgs = state.chatLog.map(function(m){
      return '<div class="eg-msg ' + (m.who === "me" ? "me" : "bot") + '">' + esc(m.text) + '</div>';
    }).join("");

    return '<div class="eg-tabs">' + tabsHtml + '</div>' +
      '<div class="eg-grid2">' +
      configHtml +
      '<div class="eg-card eg-chat"><h3>Test this assistant</h3>' +
      '<div class="eg-messages" id="egChatMessages">' + (chatMsgs || '<div class="eg-empty">Ask a question to test the assistant.</div>') + '</div>' +
      '<form class="eg-chatbar" id="egTestChatForm"><input class="eg-input" id="egTestChatInput" placeholder="Ask a question..." autocomplete="off" /><button class="eg-btn" type="submit">Send</button></form>' +
      '</div></div>';
  }

  function emptyAssistantHtml(){
    return '<div class="eg-card"><h3>No AI assistant yet</h3><p class="eg-muted" style="margin:0 0 16px">Create your first AI assistant to start answering questions from your website chat and WhatsApp.</p>' +
      '<div class="eg-form-row"><label>Assistant name</label><input class="eg-input" id="egNewAssistantName" value="Website Assistant" /></div>' +
      '<div class="eg-form-row"><label>Type</label><select class="eg-select" id="egNewAssistantType">' +
      '<option value="customer_website">Customer website</option>' +
      '<option value="whatsapp">WhatsApp</option>' +
      '<option value="internal_employee">Internal employee</option>' +
      '<option value="other">Other</option>' +
      '</select></div>' +
      '<button class="eg-btn" id="egCreateAssistant">Create assistant</button></div>';
  }
  function bindEmptyAssistant(){
    var btn = document.getElementById("egCreateAssistant");
    if (!btn) return;
    btn.addEventListener("click", function(){
      var name = document.getElementById("egNewAssistantName").value.trim() || "Website Assistant";
      var type = document.getElementById("egNewAssistantType").value;
      btn.disabled = true; btn.textContent = "Creating...";
      api("/api/v1/assistants", { method: "POST", body: { name: name, assistant_type: type } })
        .then(function(created){
          showToast("Assistant created");
          state.assistants = null;
          state.selectedAssistantId = null;
          ensureAssistants();
        })
        .catch(function(err){ showToast(err.message, true); btn.disabled = false; btn.textContent = "Create assistant"; });
    });
  }
  function bindAssistant(){
    if (state.assistants) { if (!state.assistants.length) { bindEmptyAssistant(); return; } }
    document.querySelectorAll("[data-assistant-select]").forEach(function(el){
      el.addEventListener("click", function(){
        state.selectedAssistantId = el.getAttribute("data-assistant-select");
        state.chatLog = [];
        render();
      });
    });
    var saveBtn = document.getElementById("egSaveAssistant");
    if (saveBtn) {
      saveBtn.addEventListener("click", function(){
        var prompt = document.getElementById("egAssistantPrompt").value;
        api("/api/v1/assistants/" + state.selectedAssistantId, { method: "PATCH", body: { system_prompt: prompt } })
          .then(function(updated){
            state.assistants = state.assistants.map(function(a){ return a.id === updated.id ? updated : a; });
            showToast("Assistant updated");
            render();
          })
          .catch(function(err){ showToast(err.message, true); });
      });
    }
    var toggleBtn = document.getElementById("egToggleActive");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", function(){
        var current = state.assistants.filter(function(a){ return a.id === state.selectedAssistantId; })[0];
        api("/api/v1/assistants/" + state.selectedAssistantId, { method: "PATCH", body: { is_active: !current.is_active } })
          .then(function(updated){
            state.assistants = state.assistants.map(function(a){ return a.id === updated.id ? updated : a; });
            showToast("Assistant " + (updated.is_active ? "activated" : "deactivated"));
            render();
          })
          .catch(function(err){ showToast(err.message, true); });
      });
    }
    var chatForm = document.getElementById("egTestChatForm");
    if (chatForm) {
      chatForm.addEventListener("submit", function(e){
        e.preventDefault();
        var input = document.getElementById("egTestChatInput");
        var msg = input.value.trim();
        if (!msg) return;
        state.chatLog.push({ who: "me", text: msg });
        input.value = "";
        render();
        api("/api/v1/assistant/chat", { method: "POST", body: { message: msg } })
          .then(function(data){
            state.chatLog.push({ who: "bot", text: data.answer });
            render();
            var box = document.getElementById("egChatMessages");
            if (box) box.scrollTop = box.scrollHeight;
          })
          .catch(function(err){
            state.chatLog.push({ who: "bot", text: "Error: " + err.message });
            render();
          });
      });
    }
  }

  // ---- Tenants (admin) ----
  // Client / business name, slug and owner email/password map to the
  // real POST /api/v1/admin/tenants fields (confirmed against the current
  // openapi.json): contact_name, contact_phone, owner_email, owner_password
  // and tenant_slug are required by the API; tenant_name, website and
  // welcome_message are optional. Slug is auto-filled from the name (still
  // editable) and the password is auto-generated (still editable/regenerable)
  // since the product spec's required-field list only calls out contact
  // name/email/phone - slug and a login password are things the API needs
  // but that an admin shouldn't have to think up by hand.
  function tenantsHtml(){
    if (!state.pendingClientPassword) state.pendingClientPassword = genPassword();
    var tenants = state.tenants;
    var listHtml = "";
    if (!tenants) listHtml = '<div class="eg-empty">Loading clients...</div>';
    else if (!tenants.length) listHtml = '<div class="eg-empty">No clients yet.</div>';
    else {
      var rows = tenants.map(function(t){
        var allowance = t.ai_usage_allowance;
        var used = t.ai_usage_current_period || 0;
        var usageHtml = allowance
          ? used.toLocaleString() + ' / ' + allowance.toLocaleString()
          : used.toLocaleString() + ' <span class="eg-small eg-muted">(no allowance)</span>';
        return '<tr data-tenant-id="' + esc(t.id) + '" style="cursor:pointer">' +
          '<td><b>' + esc(t.name) + '</b><div class="eg-small eg-muted">' + esc(t.slug) + '</div></td>' +
          '<td>' + statusPillForTenant(t) + '</td>' +
          '<td>' + (t.package ? '<span class="eg-tag">' + esc(t.package) + '</span>' : '<span class="eg-small eg-muted">Not set</span>') + '</td>' +
          '<td>' + usageHtml + '</td>' +
          '<td class="eg-small eg-muted">' + fmtDate(t.created_at) + '</td></tr>';
      }).join("");
      listHtml = '<table class="eg-table"><thead><tr><th>Name</th><th>Status</th><th>Package</th><th>Usage / Allowance</th><th>Created</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '<div class="eg-small eg-muted" style="margin-top:10px">Click a row to view or edit full client details.</div>';
    }

    return '<div class="eg-grid2">' +
      '<div class="eg-card"><h3>All clients</h3>' + listHtml + '</div>' +
      '<div class="eg-card"><h3>Add new client</h3>' +
      '<div class="eg-form-row"><label>Contact name</label><input class="eg-input" id="egContactName" placeholder="Full name" /></div>' +
      '<div class="eg-form-row"><label>Contact email</label><input class="eg-input" type="email" id="egOwnerEmail" placeholder="owner@business.com" /></div>' +
      '<div class="eg-form-row"><label>Contact phone (US)</label><input class="eg-input" id="egContactPhone" placeholder="(555) 123-4567" /></div>' +
      '<div class="eg-form-row"><label>Business name <span class="eg-small eg-muted">(optional)</span></label><input class="eg-input" id="egTenantName" /></div>' +
      '<div class="eg-form-row"><label>Website <span class="eg-small eg-muted">(optional)</span></label><input class="eg-input" id="egWebsite" placeholder="https://example.com" /></div>' +
      '<div class="eg-form-row"><label>Welcome message <span class="eg-small eg-muted">(optional)</span></label><input class="eg-input" id="egWelcomeMsg" /></div>' +
      '<div class="eg-form-row"><label>Slug <span class="eg-small eg-muted">(auto-filled from the name above, edit if needed)</span></label><input class="eg-input" id="egTenantSlug" placeholder="e.g. bright-path-tutoring" /></div>' +
      '<div class="eg-form-row"><label>Login password <span class="eg-small eg-muted">(auto-generated - copy this to share with the client)</span></label>' +
      '<div style="display:flex;gap:8px"><input class="eg-input" id="egOwnerPassword" value="' + esc(state.pendingClientPassword) + '" />' +
      '<button type="button" class="eg-btn ghost" id="egRegenPassword" style="white-space:nowrap">Regenerate</button></div></div>' +
      '<button class="eg-btn" id="egCreateTenant" style="width:100%">Create client</button>' +
      '</div></div>';
  }

  function bindTenants(){
    document.querySelectorAll("[data-tenant-id]").forEach(function(row){
      row.addEventListener("click", function(){ openTenantDetail(row.getAttribute("data-tenant-id")); });
    });

    var slugInput = document.getElementById("egTenantSlug");
    var contactNameInput = document.getElementById("egContactName");
    var bizNameInput = document.getElementById("egTenantName");
    var slugTouched = false;
    if (slugInput) slugInput.addEventListener("input", function(){ slugTouched = true; });
    function autoSlug(){
      if (slugTouched || !slugInput) return;
      slugInput.value = slugify((bizNameInput ? bizNameInput.value : "") || (contactNameInput ? contactNameInput.value : ""));
    }
    if (contactNameInput) contactNameInput.addEventListener("input", autoSlug);
    if (bizNameInput) bizNameInput.addEventListener("input", autoSlug);

    var regenBtn = document.getElementById("egRegenPassword");
    if (regenBtn) {
      regenBtn.addEventListener("click", function(){
        var pw = genPassword();
        state.pendingClientPassword = pw;
        var pwInput = document.getElementById("egOwnerPassword");
        if (pwInput) pwInput.value = pw;
      });
    }

    var btn = document.getElementById("egCreateTenant");
    if (!btn) return;
    btn.addEventListener("click", function(){
      var contactName = document.getElementById("egContactName").value.trim();
      var email = document.getElementById("egOwnerEmail").value.trim();
      var phoneRaw = document.getElementById("egContactPhone").value.trim();
      var bizName = document.getElementById("egTenantName").value.trim();
      var website = document.getElementById("egWebsite").value.trim();
      var welcome = document.getElementById("egWelcomeMsg").value.trim();
      var slug = document.getElementById("egTenantSlug").value.trim();
      var password = document.getElementById("egOwnerPassword").value;

      if (!contactName) { showToast("Contact name is required", true); return; }
      if (!isValidEmail(email)) { showToast("Enter a valid contact email", true); return; }
      if (!isValidUsPhone(phoneRaw)) { showToast("Enter a valid 10-digit US phone number", true); return; }
      if (!slug) { showToast("Slug is required", true); return; }
      if (!password) { showToast("Password is required", true); return; }

      var body = {
        contact_name: contactName,
        contact_phone: normalizeUsPhone(phoneRaw),
        owner_email: email,
        owner_password: password,
        tenant_slug: slug,
        tenant_name: bizName || null,
        website: website || null,
        welcome_message: welcome || null
      };

      btn.disabled = true; btn.textContent = "Creating...";
      api("/api/v1/admin/tenants", { method: "POST", body: body })
        .then(function(){
          showToast("Client created");
          state.pendingClientPassword = null;
          ensureTenants();
        })
        .catch(function(err){ showToast(err.message, true); })
        .then(function(){ btn.disabled = false; btn.textContent = "Create client"; });
    });
  }

  // ---- Client details ----
  // Editable fields (status, package, prices, allowance, internal notes) map
  // to PATCH /api/v1/admin/tenants/{id}. ai_usage_current_period, whatsapp_*
  // and voice_* are on the GET response but are NOT in the PATCH schema
  // (confirmed against the current openapi.json) - the backend doesn't
  // support editing WhatsApp/Voice AI settings yet, so those are shown
  // read-only here rather than as broken/no-op controls.
  function tenantDetailHtml(){
    var t = state.tenantDetail;
    if (!t) return '<div class="eg-empty">Loading client...</div>';

    var statuses = ["trial", "active", "paused", "churned"];
    var statusOptions = statuses.map(function(s){
      return '<option value="' + s + '"' + (t.status === s ? ' selected' : '') + '>' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
    }).join("");

    var used = t.ai_usage_current_period || 0;
    var usageHtml = t.ai_usage_allowance
      ? used.toLocaleString() + ' / ' + t.ai_usage_allowance.toLocaleString() + ' (' + Math.round((used / t.ai_usage_allowance) * 100) + '% used)'
      : used.toLocaleString() + ' (no allowance set)';

    var dash = '<span class="eg-small eg-muted">&mdash;</span>';

    return '<button class="eg-btn ghost" id="egBackToTenants" style="margin-bottom:14px">&larr; Back to clients</button>' +
      '<div class="eg-grid2">' +
      '<div class="eg-card">' +
      '<h3>Account</h3>' +
      '<div class="eg-small eg-muted" style="margin-bottom:14px">' + esc(t.slug) + ' &middot; Created ' + fmtDate(t.created_at) + '</div>' +
      '<div class="eg-form-row"><label>Status</label><select class="eg-select" id="egDetailStatus">' + statusOptions + '</select></div>' +
      '<div class="eg-form-row"><label>Package</label><input class="eg-input" id="egDetailPackage" value="' + esc(t.package || "") + '" placeholder="e.g. Growth" /></div>' +
      '<div class="eg-form-row"><label>Negotiated setup price (USD)</label><input class="eg-input" type="number" step="0.01" min="0" id="egDetailSetupPrice" value="' + (t.setup_price_usd === null || t.setup_price_usd === undefined ? "" : t.setup_price_usd) + '" /></div>' +
      '<div class="eg-form-row"><label>Negotiated recurring price (USD/mo)</label><input class="eg-input" type="number" step="0.01" min="0" id="egDetailRecurringPrice" value="' + (t.recurring_price_usd === null || t.recurring_price_usd === undefined ? "" : t.recurring_price_usd) + '" /></div>' +
      '<div class="eg-form-row"><label>Package allowance limit <span class="eg-small eg-muted">(AI interactions / mo)</span></label><input class="eg-input" type="number" step="1" min="0" id="egDetailAllowance" value="' + (t.ai_usage_allowance === null || t.ai_usage_allowance === undefined ? "" : t.ai_usage_allowance) + '" /></div>' +
      '<div class="eg-form-row"><label>Internal comments</label><textarea class="eg-textarea" id="egDetailNotes">' + esc(t.internal_notes || "") + '</textarea></div>' +
      '<button class="eg-btn" id="egSaveTenantDetail">Save changes</button>' +
      '</div>' +
      '<div class="eg-card">' +
      '<h3>Usage &amp; channels</h3>' +
      '<div class="eg-form-row"><label>AI interaction usage (this period)</label><div class="eg-input" style="background:#f7f9fc">' + usageHtml + '</div></div>' +
      '<div class="eg-form-row"><label>WhatsApp</label><div class="eg-input" style="background:#f7f9fc">' + (t.whatsapp_enabled ? 'Enabled &middot; ' + (t.whatsapp_number ? esc(t.whatsapp_number) : 'no number set') : 'Disabled') + '</div></div>' +
      '<div class="eg-form-row"><label>Voice AI</label><div class="eg-input" style="background:#f7f9fc">' + (t.voice_enabled ? 'Enabled &middot; ' + (t.voice_number ? esc(t.voice_number) : 'no number set') : 'Disabled') + '</div></div>' +
      '<div class="eg-small eg-muted">Usage, WhatsApp and Voice AI are read-only here &mdash; PATCH /api/v1/admin/tenants/{id} does not currently accept whatsapp_enabled, whatsapp_number, voice_enabled or voice_number, so there is no way to save changes to them yet. Flagged separately to the backend team.</div>' +
      '<h3 style="margin-top:18px">Contact</h3>' +
      '<div class="eg-form-row"><label>Contact name</label><div class="eg-input" style="background:#f7f9fc">' + (t.contact_name ? esc(t.contact_name) : dash) + '</div></div>' +
      '<div class="eg-form-row"><label>Contact phone</label><div class="eg-input" style="background:#f7f9fc">' + (t.contact_phone ? esc(t.contact_phone) : dash) + '</div></div>' +
      '<div class="eg-form-row"><label>Website</label><div class="eg-input" style="background:#f7f9fc">' + (t.website ? ('<a href="' + esc(t.website) + '" target="_blank" rel="noopener">' + esc(t.website) + '</a>') : dash) + '</div></div>' +
      '</div>' +
      '</div>';
  }

  function bindTenantDetail(){
    var backBtn = document.getElementById("egBackToTenants");
    if (backBtn) backBtn.addEventListener("click", function(){ state.view = "tenants"; render(); });

    var saveBtn = document.getElementById("egSaveTenantDetail");
    if (!saveBtn) return;
    saveBtn.addEventListener("click", function(){
      var setupRaw = document.getElementById("egDetailSetupPrice").value.trim();
      var recurringRaw = document.getElementById("egDetailRecurringPrice").value.trim();
      var allowanceRaw = document.getElementById("egDetailAllowance").value.trim();
      var body = {
        status: document.getElementById("egDetailStatus").value,
        package: document.getElementById("egDetailPackage").value.trim() || null,
        internal_notes: document.getElementById("egDetailNotes").value.trim() || null,
        setup_price_usd: setupRaw === "" ? null : parseFloat(setupRaw),
        recurring_price_usd: recurringRaw === "" ? null : parseFloat(recurringRaw),
        ai_usage_allowance: allowanceRaw === "" ? null : parseInt(allowanceRaw, 10)
      };
      saveBtn.disabled = true; saveBtn.textContent = "Saving...";
      api("/api/v1/admin/tenants/" + state.tenantDetailId, { method: "PATCH", body: body })
        .then(function(updated){
          state.tenantDetail = updated;
          if (state.tenants) state.tenants = state.tenants.map(function(x){ return x.id === updated.id ? updated : x; });
          showToast("Client updated");
          render();
        })
        .catch(function(err){ showToast(err.message, true); })
        .then(function(){ saveBtn.disabled = false; saveBtn.textContent = "Save changes"; });
    });
  }

  // ---- Instant Demo ----
  function demoHtml(){
    var hasAssistant = state.assistants ? state.assistants.length > 0 : false;
    var doc = state.demoDoc;
    var step1Active = !doc;
    var step2Active = doc ? doc.status !== "indexed" : false;
    var step3Active = doc ? doc.status === "indexed" : false;
    var stepperHtml = '<div class="eg-stepper">' +
      '<div class="eg-step' + (step1Active ? " active" : "") + '"><strong>1. Upload document</strong><span class="eg-small eg-muted">PDF / DOCX</span></div>' +
      '<div class="eg-step' + (step2Active ? " active" : "") + '"><strong>2. Indexing</strong><span class="eg-small eg-muted">Extract &rarr; chunk &rarr; embed</span></div>' +
      '<div class="eg-step' + (step3Active ? " active" : "") + '"><strong>3. Ask questions</strong><span class="eg-small eg-muted">Live AI answers</span></div>' +
      '<div class="eg-step"><strong>4. Capture lead</strong><span class="eg-small eg-muted">Show CRM value</span></div>' +
      '</div>';
    var assistantWarning = !hasAssistant ? '<div class="eg-error" style="background:#fff7df;color:#b7791f">No AI assistant exists yet for this account - create one on the AI Assistant tab first, then come back here.</div>' : "";
    var uploadStatusHtml = "";
    if (doc) {
      var statusText = doc.status === "indexed" ? "Indexed successfully - ready to answer questions" :
        (doc.status === "failed" ? "Indexing failed: " + esc(doc.error_message || "unknown error") :
        "Extracting text, chunking, embedding into pgvector...");
      uploadStatusHtml = '<div class="eg-statusbox"><b>' + esc(doc.filename) + '</b><div class="eg-small eg-muted" style="margin-top:4px">' + statusText + '</div></div>';
    }
    var chatMsgs = state.demoChatLog.map(function(m){
      return '<div class="eg-msg ' + (m.who === "me" ? "me" : "bot") + '">' + esc(m.text) + '</div>';
    }).join("");
    var leadResultHtml = state.demoLeadResult ? ('<div class="eg-statusbox"><b>Demo lead captured</b><div class="eg-small eg-muted" style="margin-top:4px">' + esc(state.demoLeadResult) + '</div></div>') : "";
    return stepperHtml + assistantWarning +
      '<div class="eg-grid2">' +
      '<div class="eg-card">' +
      '<h3>Upload a document</h3>' +
      '<label class="eg-dropzone" style="display:block;cursor:pointer"><div style="font-size:30px">&#8679;</div><b>Click to upload a PDF or DOCX</b><div class="eg-small eg-muted" style="margin-top:6px">This creates a real document in your knowledge base</div>' +
      '<input type="file" id="egDemoFile" accept=".pdf,.doc,.docx" style="display:none" /></label>' +
      uploadStatusHtml +
      '</div>' +
      '<div class="eg-card eg-chat">' +
      '<div class="eg-row"><h3 style="margin:0">Live AI preview</h3><span class="eg-pill' + ((doc ? doc.status === "indexed" : false) ? " green" : "") + '">' + (doc ? (doc.status === "indexed" ? "Ready" : "Indexing") : "Waiting for document") + '</span></div>' +
      '<div style="margin:8px 0">' +
      '<span class="eg-qbtn" data-q="What services do you offer?">What services do you offer?</span>' +
      '<span class="eg-qbtn" data-q="What are your hours?">What are your hours?</span>' +
      '<span class="eg-qbtn" data-q="How do I get started?">How do I get started?</span>' +
      '</div>' +
      '<div class="eg-messages" id="egDemoMessages">' + (chatMsgs || '<div class="eg-empty">Upload a document, then ask a real question - this calls the live AI assistant.</div>') + '</div>' +
      '<form class="eg-chatbar" id="egDemoChatForm"><input class="eg-input" id="egDemoChatInput" placeholder="Ask a question..." autocomplete="off" /><button class="eg-btn" type="submit">Ask</button></form>' +
      '</div>' +
      '</div>' +
      '<div class="eg-card" style="margin-top:16px">' +
      '<h3>Capture this as a real lead</h3>' +
      '<div class="eg-grid2" style="grid-template-columns:1fr 1fr">' +
      '<div class="eg-form-row"><label>Name</label><input class="eg-input" id="egDemoLeadName" placeholder="Prospect name" /></div>' +
      '<div class="eg-form-row"><label>Email</label><input class="eg-input" type="email" id="egDemoLeadEmail" placeholder="prospect@example.com" /></div>' +
      '</div>' +
      '<div class="eg-form-row"><label>Interest</label><input class="eg-input" id="egDemoLeadInterest" placeholder="e.g. AI website assistant" /></div>' +
      '<button class="eg-btn" id="egDemoLeadBtn">Capture demo lead</button>' +
      leadResultHtml +
      '</div>';
  }
  function pollDemoDoc(docId, attempt){
    attempt = attempt || 0;
    if (attempt > 20) return;
    api("/api/v1/documents").then(function(list){
      var found = list.filter(function(d){ return d.id === docId; })[0];
      if (!found) return;
      state.demoDoc = found;
      state.documents = list;
      if (state.view === "demo") render();
      if (found.status === "pending" || found.status === "processing") {
        setTimeout(function(){ pollDemoDoc(docId, attempt + 1); }, 2000);
      }
    }).catch(function(){});
  }
  function demoAsk(text){
    state.demoChatLog.push({ who: "me", text: text });
    render();
    api("/api/v1/assistant/chat", { method: "POST", body: { message: text } })
      .then(function(data){
        state.demoChatLog.push({ who: "bot", text: data.answer });
        render();
        var box = document.getElementById("egDemoMessages");
        if (box) box.scrollTop = box.scrollHeight;
      })
      .catch(function(err){
        state.demoChatLog.push({ who: "bot", text: "Error: " + err.message });
        render();
      });
  }
  function bindDemo(){
    var fileInput = document.getElementById("egDemoFile");
    if (fileInput) {
      fileInput.addEventListener("change", function(){
        var file = fileInput.files[0];
        if (!file) return;
        var fd = new FormData();
        fd.append("file", file);
        api("/api/v1/documents", { method: "POST", body: fd })
          .then(function(created){
            state.demoDoc = created;
            render();
            pollDemoDoc(created.id);
          })
          .catch(function(err){ showToast(err.message, true); });
      });
    }
    document.querySelectorAll("[data-q]").forEach(function(el){
      el.addEventListener("click", function(){ demoAsk(el.getAttribute("data-q")); });
    });
    var chatForm = document.getElementById("egDemoChatForm");
    if (chatForm) {
      chatForm.addEventListener("submit", function(e){
        e.preventDefault();
        var input = document.getElementById("egDemoChatInput");
        var msg = input.value.trim();
        if (!msg) return;
        input.value = "";
        demoAsk(msg);
      });
    }
    var leadBtn = document.getElementById("egDemoLeadBtn");
    if (leadBtn) {
      leadBtn.addEventListener("click", function(){
        var name = document.getElementById("egDemoLeadName").value.trim();
        var email = document.getElementById("egDemoLeadEmail").value.trim();
        var interest = document.getElementById("egDemoLeadInterest").value.trim();
        if (AND(!name, !email)) { showToast("Enter at least a name or email", true); return; }
        var parts = name.split(" ");
        var firstName = parts.shift() || "";
        var lastName = parts.join(" ");
        leadBtn.disabled = true; leadBtn.textContent = "Capturing...";
        api("/api/v1/crm/leads", { method: "POST", body: {
          first_name: firstName || null,
          last_name: lastName || null,
          email: email || null,
          service_interest: interest || null,
          source: "manual",
          source_detail: "instant_demo",
          notes: "Captured live during an Instant Demo walkthrough."
        }})
          .then(function(created){
            state.demoLeadResult = (name || email) + (interest ? " - " + interest : "") + " - source: manual (instant demo)";
            showToast("Demo lead captured");
            render();
          })
          .catch(function(err){ showToast(err.message, true); })
          .then(function(){ leadBtn.disabled = false; leadBtn.textContent = "Capture demo lead"; });
      });
    }
  }

  init();
})();
