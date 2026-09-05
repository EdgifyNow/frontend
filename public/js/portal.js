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
    tenantUsageSummary: null,
    pendingClientPassword: null,
    overviewSearch: "",
    overviewDateFilter: "month",
    overviewPage: 1,
    overviewKebabId: null,
    leadDrawerId: null,
    leadAppointments: null,
    apiKeys: null,
    newApiKeyReveal: null,
    leadPage: 1,
    contactPage: 1,
    knowledgePage: 1,
    tenantsPage: 1,
    leadSearch: "",
    leadDateFilter: "quarter",
    leadStatusFilter: "all",
    leadSourceFilter: "all",
    contactSearch: "",
    contactDateFilter: "quarter"
  };

  function esc(s){
    if (s === null || s === undefined) return "";
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  function fmtDate(d){
    if (!d) return "-";
    try { return new Date(d).toLocaleString(); } catch(e){ return d; }
  }
  function fmtTime(d){
    if (!d) return "-";
    try { return new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch(e){ return d; }
  }
  function contactName(c){
    if (!c) return "Unknown contact";
    var name = ((c.first_name || "") + " " + (c.last_name || "")).trim();
    return name || "Unknown contact";
  }
  function sourceLabel(s){
    var map = { website_form: "Website form", website_chat: "Website chat", whatsapp: "WhatsApp", voice: "Voice", manual: "Manual" };
    return map[s] || s;
  }
  function contactMapFromState(){
    var map = {};
    (state.contacts || []).forEach(function(c){ map[c.id] = c; });
    return map;
  }
  function joinedLeads(){
    var cmap = contactMapFromState();
    return (state.leads || []).map(function(l){
      var copy = {};
      for (var k in l) copy[k] = l[k];
      copy.contact = cmap[l.contact_id] || null;
      return copy;
    });
  }
  function selOpts(options, current){
    return options.map(function(o){
      var val = typeof o === "string" ? o : o.value;
      var label = typeof o === "string" ? o : o.label;
      return '<option value="' + esc(val) + '"' + (val === current ? " selected" : "") + '>' + esc(label) + '</option>';
    }).join("");
  }
  // Re-render (render()) always replaces #egApp's innerHTML wholesale, which
  // would drop focus/cursor position out of a live-filtered search box on
  // every keystroke. This restores focus (by element id) and cursor
  // position after such a re-render, so typing into a search input feels
  // normal instead of losing focus after each character.
  function preserveFocus(fn){
    var active = document.activeElement;
    var id = active && active.id;
    var selStart = active && typeof active.selectionStart === "number" ? active.selectionStart : null;
    fn();
    if (id) {
      var el = document.getElementById(id);
      if (el) {
        el.focus();
        if (selStart !== null && el.setSelectionRange) el.setSelectionRange(selStart, selStart);
      }
    }
  }
  function csvEscape(v){
    return '"' + String(v === null || v === undefined ? "" : v).replace(/"/g, '""') + '"';
  }
  function downloadCsv(filename, header, rows){
    var lines = [header.map(csvEscape).join(",")];
    rows.forEach(function(r){ lines.push(r.map(csvEscape).join(",")); });
    var blob = new Blob([lines.join("\n")], { type: "text/csv" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  // Shared client-side pagination for any listing built from an array
  // already fully loaded (leads/contacts/documents/clients) - no backend
  // paging endpoint needed for these list sizes.
  var EG_PAGE_SIZE = 10;
  function paginate(items, page, pageSize){
    pageSize = pageSize || EG_PAGE_SIZE;
    var totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    var clampedPage = Math.min(Math.max(page, 1), totalPages);
    var start = (clampedPage - 1) * pageSize;
    return { pageItems: items.slice(start, start + pageSize), page: clampedPage, totalPages: totalPages, total: items.length };
  }
  function pagerHtml(idPrefix, pageInfo, noun){
    if (!pageInfo.total) return "";
    return '<div class="eg-row" style="margin-top:12px">' +
      '<div class="eg-small eg-muted">Showing ' + pageInfo.pageItems.length + ' of ' + pageInfo.total + ' ' + esc(noun) + '</div>' +
      '<div style="display:flex;gap:6px;align-items:center">' +
      '<button class="eg-btn ghost" style="padding:6px 10px" id="' + idPrefix + 'Prev"' + (pageInfo.page <= 1 ? " disabled" : "") + '>&lsaquo;</button>' +
      '<span class="eg-pill">' + pageInfo.page + ' / ' + pageInfo.totalPages + '</span>' +
      '<button class="eg-btn ghost" style="padding:6px 10px" id="' + idPrefix + 'Next"' + (pageInfo.page >= pageInfo.totalPages ? " disabled" : "") + '>&rsaquo;</button>' +
      '</div></div>';
  }
  function bindPager(idPrefix, stateKey){
    var prev = document.getElementById(idPrefix + "Prev");
    if (prev) prev.addEventListener("click", function(){ state[stateKey] -= 1; render(); });
    var next = document.getElementById(idPrefix + "Next");
    if (next) next.addEventListener("click", function(){ state[stateKey] += 1; render(); });
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
      api("/api/v1/crm/contacts").then(function(d){ state.contacts = d; render(); }).catch(function(){});
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
  function ensureApiKeys(){
    api("/api/v1/integrations/api-keys").then(function(d){ state.apiKeys = d; render(); }).catch(function(err){ showToast(err.message, true); });
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
    state.tenantUsageSummary = null;
    render();
    api("/api/v1/admin/tenants/" + id).then(function(d){
      state.tenantDetail = d;
      render();
    }).catch(function(err){ showToast(err.message, true); });
    // Per-channel AI-interaction/lead breakdown - see channelSummaryHtml()
    // below. Now a real backend endpoint (added after this was first
    // wired up). A failure here still fails silently (no toast) since it's
    // secondary to the main tenant load.
    api("/api/v1/admin/tenants/" + id + "/usage-summary").then(function(d){
      state.tenantUsageSummary = d;
      render();
    }).catch(function(){ state.tenantUsageSummary = null; });
  }

  // Journey C ("client can review it"): appointments are only fetchable
  // per-lead (GET /api/v1/crm/leads/{id}/appointments - no global list
  // endpoint exists), so they're loaded here alongside the lead drawer
  // rather than as their own portal view.
  function openLeadDrawer(id){
    state.leadDrawerId = id;
    state.leadAppointments = null;
    render();
    api("/api/v1/crm/leads/" + id + "/appointments").then(function(d){
      state.leadAppointments = d;
      render();
    }).catch(function(){ state.leadAppointments = []; });
  }

  function setView(v){
    state.view = v;
    if (v === "leads") { ensureLeads(function(){}); ensureContacts(function(){}); }
    if (v === "knowledge") ensureDocuments();
    if (v === "assistant") ensureAssistants();
    if (v === "tenants") ensureTenants();
    if (v === "demo") { ensureAssistants(); ensureDocuments(); }
    if (v === "integrations") ensureApiKeys();
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
    // Instant Demo is intentionally admin-only (tracker item #14: "only
    // Admin account should have it") - a client demonstrating their own
    // assistant already has the real thing (AI Assistant tab); Instant Demo
    // exists so an EdgifyNow admin can show a prospect a live result without
    // that prospect needing their own account yet.
    return [
      { id: "dashboard", label: "Dashboard", icon: "◉" },
      { id: "leads", label: "Leads & Contacts", icon: "◫" },
      { id: "knowledge", label: "Knowledge", icon: "▤" },
      { id: "assistant", label: "AI Assistant", icon: "◎" },
      { id: "integrations", label: "Integrations", icon: "⚿" }
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
      '</div>' + toastHtml + leadDrawerHtml();

    document.querySelectorAll("[data-nav]").forEach(function(el){
      el.addEventListener("click", function(){
        var v = el.getAttribute("data-nav");
        if (v === "logout") { doLogout(); return; }
        setView(v);
      });
    });
    bindDrawer();

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
    if (state.view === "integrations") return "Integrations";
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
    if (state.view === "integrations") return "Generate a widget key to embed your assistant on your website.";
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
    if (state.view === "integrations") { el.innerHTML = integrationsHtml(); bindIntegrations(); return; }
  }

  // ---- Dashboard ----
  // "CRM daily view" per the client dashboard mockup: raw lead visibility,
  // no scoring/workflow logic. Built entirely from GET /api/v1/crm/leads +
  // GET /api/v1/crm/contacts (joined client-side on contact_id) - both
  // already fetched by loadDashboardData(). Date/status filtering and
  // sorting happen here in the frontend, same as the mockup's api-note said.
  function clientDashboardHtml(){
    if (!state.leads || !state.contacts) {
      return '<div class="eg-hero"><h2>CRM daily view</h2><p>Simple raw lead visibility - no overdue scoring, no extra workflow logic.</p></div>' +
        '<div class="eg-card"><div class="eg-empty">Loading...</div></div>';
    }

    var rows = joinedLeads();
    var now = new Date();
    var monthCount = rows.filter(function(r){
      var d = new Date(r.created_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    var newCount = rows.filter(function(r){ return r.status === "new"; }).length;
    var qualifiedCount = rows.filter(function(r){ return r.status === "qualified"; }).length;
    var wonCount = rows.filter(function(r){ return r.status === "won"; }).length;

    var todayKey = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    var todayRows = rows.filter(function(r){ return (r.created_at || "").slice(0, 10) === todayKey; })
      .sort(function(a, b){ return new Date(b.created_at) - new Date(a.created_at); });
    var todayHtml = todayRows.map(function(r){
      return '<tr class="eg-clickrow" style="cursor:pointer" data-lead-drawer="' + esc(r.id) + '">' +
        '<td><b>' + esc(contactName(r.contact)) + '</b></td>' +
        '<td>' + esc(r.service_interest || r.title || "-") + '</td>' +
        '<td><span class="eg-tag">' + esc(sourceLabel(r.source)) + '</span></td>' +
        '<td>' + fmtTime(r.created_at) + '</td>' +
        '<td>' + statusPill(r.status) + '</td></tr>';
    }).join("");

    var weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    var openStatuses = ["new", "contacted", "qualified", "booked"];
    var weekRows = rows.filter(function(r){
      if (openStatuses.indexOf(r.status) === -1) return false;
      var activity = new Date(r.last_activity_at || r.created_at);
      return activity >= weekStart;
    }).sort(function(a, b){
      return new Date(b.last_activity_at || b.created_at) - new Date(a.last_activity_at || a.created_at);
    });
    var weekHtml = weekRows.map(function(r){
      return '<tr class="eg-clickrow" style="cursor:pointer" data-lead-drawer="' + esc(r.id) + '">' +
        '<td><b>' + esc(contactName(r.contact)) + '</b></td>' +
        '<td>' + esc(r.service_interest || r.title || "-") + '</td>' +
        '<td><span class="eg-tag">' + esc(sourceLabel(r.source)) + '</span></td>' +
        '<td>' + statusPill(r.status) + '</td>' +
        '<td class="eg-small eg-muted">' + fmtDate(r.last_activity_at || r.created_at) + '</td></tr>';
    }).join("");

    return '<div class="eg-hero"><h2>CRM daily view</h2><p>Simple raw lead visibility - no overdue scoring, no extra workflow logic.</p></div>' +
      '<div class="eg-grid4">' +
      '<div class="eg-card eg-metric"><div class="eg-label">Leads This Month</div><div class="eg-value">' + monthCount + '</div></div>' +
      '<div class="eg-card eg-metric"><div class="eg-label">New</div><div class="eg-value">' + newCount + '</div></div>' +
      '<div class="eg-card eg-metric"><div class="eg-label">Qualified</div><div class="eg-value">' + qualifiedCount + '</div></div>' +
      '<div class="eg-card eg-metric"><div class="eg-label">Won</div><div class="eg-value">' + wonCount + '</div></div>' +
      '</div>' +
      '<div class="eg-grid2">' +
      '<div class="eg-card"><h3>New leads today</h3><p class="eg-small eg-muted" style="margin-top:-8px">Created today, newest first.</p>' +
      (todayHtml ? '<table class="eg-table"><thead><tr><th>Lead</th><th>Interest</th><th>Source</th><th>Time</th><th>Status</th></tr></thead><tbody>' + todayHtml + '</tbody></table>' : '<div class="eg-empty">No leads today.</div>') +
      '</div>' +
      '<div class="eg-card"><h3>This week&rsquo;s attention</h3><p class="eg-small eg-muted" style="margin-top:-8px">Open leads with activity this week, newest activity first.</p>' +
      (weekHtml ? '<table class="eg-table"><thead><tr><th>Lead</th><th>Interest</th><th>Source</th><th>Status</th><th>Last activity</th></tr></thead><tbody>' + weekHtml + '</tbody></table>' : '<div class="eg-empty">Nothing needs attention this week.</div>') +
      '</div>' +
      '</div>';
  }

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

  var EG_OVERVIEW_PAGE_SIZE = 10;

  function overviewFilteredTenants(){
    var q = (state.overviewSearch || "").toLowerCase().trim();
    var tenants = state.tenants || [];
    if (!q) return tenants;
    return tenants.filter(function(t){
      var text = [t.name, t.slug].filter(Boolean).join(" ").toLowerCase();
      return text.indexOf(q) !== -1;
    });
  }

  // 5 summary cards, search, an Actions column (View + a kebab menu with
  // Activate/Deactivate), and pagination - all computed from tenants
  // already loaded via GET /api/v1/admin/tenants, no new endpoint needed.
  // The date filter dropdown is present for the target layout but
  // deliberately doesn't recompute these numbers per period: every card
  // here is a current snapshot (total/active/trial counts, current MRR,
  // the backend's own "current period" usage total) - there's no
  // historical/per-period breakdown endpoint to filter against, so
  // pretending to recompute "last month" would just be fabricated numbers.
  function adminDashboardHtml(){
    var allTenants = state.tenants || [];
    var mrr = allTenants.filter(function(t){ return t.is_active; })
      .reduce(function(sum, t){ return sum + (t.recurring_price_usd || 0); }, 0);
    var trialCount = allTenants.filter(function(t){ return t.status === "trial"; }).length;
    var aiUsageTotal = allTenants.reduce(function(sum, t){ return sum + (t.ai_usage_current_period || 0); }, 0);

    var filtered = overviewFilteredTenants();
    var totalPages = Math.max(1, Math.ceil(filtered.length / EG_OVERVIEW_PAGE_SIZE));
    if (state.overviewPage > totalPages) state.overviewPage = totalPages;
    if (state.overviewPage < 1) state.overviewPage = 1;
    var pageStart = (state.overviewPage - 1) * EG_OVERVIEW_PAGE_SIZE;
    var pageTenants = filtered.slice(pageStart, pageStart + EG_OVERVIEW_PAGE_SIZE);

    var rows = pageTenants.map(function(t){
      var allowance = t.ai_usage_allowance;
      var used = t.ai_usage_current_period || 0;
      var usageHtml;
      if (allowance) {
        var pct = Math.round((used / allowance) * 100);
        usageHtml = used.toLocaleString() + ' / ' + allowance.toLocaleString() + '<div class="eg-small eg-muted">' + pct + '% used</div>';
      } else {
        usageHtml = used.toLocaleString() + '<div class="eg-small eg-muted">no allowance set</div>';
      }
      var kebabMenu = state.overviewKebabId === t.id
        ? '<div class="eg-kebab-menu"><div class="eg-kebab-item" data-toggle-active="' + esc(t.id) + '">' + (t.is_active ? "Deactivate" : "Activate") + '</div></div>'
        : "";
      return '<tr class="eg-clickrow" data-tenant-id="' + esc(t.id) + '" style="cursor:pointer"><td><b>' + esc(t.name) + '</b><div class="eg-small eg-muted">' + esc(t.slug) + '</div></td>' +
        '<td>' + statusPillForTenant(t) + '</td>' +
        '<td>' + (t.package ? '<span class="eg-tag">' + esc(t.package) + '</span>' : '<span class="eg-small eg-muted">Not set</span>') + '</td>' +
        '<td>' + usageHtml + '</td>' +
        '<td>' + (allowance ? allowance.toLocaleString() + '/mo' : '<span class="eg-small eg-muted">&mdash;</span>') + '</td>' +
        '<td class="eg-small eg-muted">' + fmtDate(t.created_at) + '</td>' +
        '<td class="eg-small eg-muted">' + fmtDate(t.updated_at) + '</td>' +
        '<td style="white-space:nowrap"><button class="eg-btn ghost" style="padding:6px 12px">View</button> ' +
        '<span style="position:relative;display:inline-block"><button class="eg-btn ghost" style="padding:6px 9px" data-kebab="' + esc(t.id) + '">&#8942;</button>' + kebabMenu + '</span></td></tr>';
    }).join("");

    var pagerHtml = '<div class="eg-row" style="margin-top:12px">' +
      '<div class="eg-small eg-muted">Showing ' + pageTenants.length + ' of ' + filtered.length + ' clients</div>' +
      '<div style="display:flex;gap:6px;align-items:center">' +
      '<button class="eg-btn ghost" style="padding:6px 10px" id="egOverviewPrev"' + (state.overviewPage <= 1 ? " disabled" : "") + '>&lsaquo;</button>' +
      '<span class="eg-pill">' + state.overviewPage + '</span>' +
      '<button class="eg-btn ghost" style="padding:6px 10px" id="egOverviewNext"' + (state.overviewPage >= totalPages ? " disabled" : "") + '>&rsaquo;</button>' +
      '</div></div>';

    return '<div class="eg-row" style="margin-bottom:14px">' +
      '<div></div>' +
      '<select class="eg-select" id="egOverviewDateFilter" style="width:auto">' +
      selOpts([{value:"month",label:"This Month"},{value:"last_month",label:"Last Month"},{value:"quarter",label:"This Quarter"},{value:"all",label:"All Time"}], state.overviewDateFilter) +
      '</select></div>' +
      '<div class="eg-grid4" style="grid-template-columns:repeat(5,1fr)">' +
      '<div class="eg-card eg-metric"><div class="eg-label">Total Clients</div><div class="eg-value">' + allTenants.length + '</div><div class="eg-small eg-muted">All registered clients</div></div>' +
      '<div class="eg-card eg-metric"><div class="eg-label">Active Clients</div><div class="eg-value">' + allTenants.filter(function(t){return t.is_active;}).length + '</div><div class="eg-small eg-muted">Currently active</div></div>' +
      '<div class="eg-card eg-metric"><div class="eg-label">Monthly Recurring Revenue</div><div class="eg-value">$' + mrr.toLocaleString() + '</div><div class="eg-small eg-muted">Sum of monthly package fees</div></div>' +
      '<div class="eg-card eg-metric"><div class="eg-label">Trial Clients</div><div class="eg-value">' + trialCount + '</div><div class="eg-small eg-muted">In trial status</div></div>' +
      '<div class="eg-card eg-metric"><div class="eg-label">AI Usage This Period</div><div class="eg-value">' + aiUsageTotal.toLocaleString() + '</div><div class="eg-small eg-muted">Total AI interactions</div></div>' +
      '</div>' +
      '<div class="eg-card"><div class="eg-row"><div><h3 style="margin-bottom:2px">Client health</h3><div class="eg-small eg-muted">Overview of all clients and their current status, package and usage.</div></div>' +
      '<div style="display:flex;gap:10px"><input class="eg-input" id="egOverviewSearch" placeholder="Search clients..." value="' + esc(state.overviewSearch) + '" style="width:220px" /><button class="eg-btn" data-goto="tenants">Manage clients</button></div></div>' +
      (rows ? '<table class="eg-table"><thead><tr><th>Client</th><th>Status</th><th>Package</th><th>Usage</th><th>Allowance</th><th>Created</th><th>Last Updated</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table>' : '<div class="eg-empty">' + (state.overviewSearch ? "No matching clients." : "No clients yet.") + '</div>') +
      (filtered.length ? pagerHtml : "") +
      '</div>' +
      '<div class="eg-card" style="margin-top:14px;background:#eef4fb;border-color:#d7e6fb"><div class="eg-row">' +
      '<div class="eg-small" style="color:#2c5aa8">&#9432; Metrics are calculated from live data via existing APIs. No backend changes required.</div>' +
      '<div class="eg-small" style="color:#2c5aa8">&#128197; Tip: Use the date filter to view metrics for different periods.</div>' +
      '</div></div>';
  }

  function bindDashboard(){
    document.querySelectorAll("[data-goto]").forEach(function(el){
      el.addEventListener("click", function(){ setView(el.getAttribute("data-goto")); });
    });
    document.querySelectorAll("[data-tenant-id]").forEach(function(row){
      row.addEventListener("click", function(){ openTenantDetail(row.getAttribute("data-tenant-id")); });
    });
    document.querySelectorAll("[data-lead-drawer]").forEach(function(row){
      row.addEventListener("click", function(){ openLeadDrawer(row.getAttribute("data-lead-drawer")); });
    });

    var overviewSearch = document.getElementById("egOverviewSearch");
    if (overviewSearch) overviewSearch.addEventListener("input", function(){
      preserveFocus(function(){ state.overviewSearch = overviewSearch.value; state.overviewPage = 1; render(); });
    });
    var overviewDateFilter = document.getElementById("egOverviewDateFilter");
    if (overviewDateFilter) overviewDateFilter.addEventListener("change", function(){
      state.overviewDateFilter = overviewDateFilter.value; render();
    });
    var overviewPrev = document.getElementById("egOverviewPrev");
    if (overviewPrev) overviewPrev.addEventListener("click", function(){ state.overviewPage -= 1; render(); });
    var overviewNext = document.getElementById("egOverviewNext");
    if (overviewNext) overviewNext.addEventListener("click", function(){ state.overviewPage += 1; render(); });

    document.querySelectorAll("[data-kebab]").forEach(function(btn){
      btn.addEventListener("click", function(e){
        e.stopPropagation();
        var id = btn.getAttribute("data-kebab");
        state.overviewKebabId = state.overviewKebabId === id ? null : id;
        render();
      });
    });
    document.querySelectorAll("[data-toggle-active]").forEach(function(item){
      item.addEventListener("click", function(e){
        e.stopPropagation();
        var id = item.getAttribute("data-toggle-active");
        var tenant = (state.tenants || []).filter(function(t){ return t.id === id; })[0];
        state.overviewKebabId = null;
        if (!tenant) { render(); return; }
        api("/api/v1/admin/tenants/" + id, { method: "PATCH", body: { is_active: !tenant.is_active } })
          .then(function(updated){
            state.tenants = state.tenants.map(function(t){ return t.id === updated.id ? updated : t; });
            showToast(updated.is_active ? "Client activated" : "Client deactivated");
            render();
          })
          .catch(function(err){ showToast(err.message, true); render(); });
      });
    });
    if (state.overviewKebabId) {
      document.addEventListener("click", function(e){
        if (e.target.closest && (e.target.closest("[data-kebab]") || e.target.closest(".eg-kebab-menu"))) return;
        state.overviewKebabId = null;
        render();
      }, { once: true });
    }
  }

  function statusPill(s){
    var cls = "eg-pill";
    if (s === "won" || s === "qualified" || s === "booked") cls += " green";
    else if (s === "new" || s === "contacted") cls += " amber";
    else if (s === "lost") cls += " red";
    return '<span class="' + cls + '">' + esc(s) + '</span>';
  }

  // ---- Leads & Contacts ----
  // Matches the client dashboard mockup: leads and contacts stay separate
  // records (both in the API and here), search/filter/sort happen in the
  // frontend, and clicking a lead row opens a drawer with the joined
  // contact + lead detail (status change moved into the drawer instead of
  // an inline per-row dropdown - same underlying PATCH, just a less
  // cluttered table to match the mockup's plain columns).
  // GET /api/v1/crm/leads and /crm/contacts take no query params - the
  // backend returns every record for the tenant in one response, every
  // time, full stop. There's no pagination or date-range support to ask
  // for server-side, so at real scale (the "10,000 contacts a year from
  // now" case) the fetch itself stays expensive no matter what the UI
  // does - only a backend paginated/filtered list endpoint actually fixes
  // that. What IS fixable here: not rendering everything at once. Default
  // date filter is "quarter" (rolling 3 months) so the table itself never
  // has to hold more than a few months of rows in the DOM; CSV export
  // passes ignoreDateFilter so "just download it" always gets full
  // history regardless of what's on screen, per the "download for
  // anything older" strategy.
  function withinDateFilter(dateStr, filterValue){
    if (filterValue === "all") return true;
    var d = new Date(dateStr);
    var now = new Date();
    if (filterValue === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    if (filterValue === "quarter") return d.getTime() >= now.getTime() - 90 * 24 * 60 * 60 * 1000;
    if (filterValue === "year") return d.getFullYear() === now.getFullYear();
    return true;
  }

  function filteredLeads(opts){
    opts = opts || {};
    var rows = joinedLeads();
    var q = (state.leadSearch || "").toLowerCase().trim();
    rows = rows.filter(function(r){
      var c = r.contact || {};
      var text = [contactName(c), c.email, c.phone, c.company, r.service_interest, r.title].filter(Boolean).join(" ").toLowerCase();
      if (q && text.indexOf(q) === -1) return false;
      if (state.leadStatusFilter !== "all" && r.status !== state.leadStatusFilter) return false;
      if (state.leadSourceFilter !== "all" && r.source !== state.leadSourceFilter) return false;
      if (!opts.ignoreDateFilter && !withinDateFilter(r.created_at, state.leadDateFilter)) return false;
      return true;
    });
    return rows.sort(function(a, b){ return new Date(b.created_at) - new Date(a.created_at); });
  }

  function filteredContacts(opts){
    opts = opts || {};
    var q = (state.contactSearch || "").toLowerCase().trim();
    return (state.contacts || []).filter(function(c){
      var text = [contactName(c), c.email, c.phone, c.company].filter(Boolean).join(" ").toLowerCase();
      if (q && text.indexOf(q) === -1) return false;
      if (!opts.ignoreDateFilter && !withinDateFilter(c.created_at, state.contactDateFilter)) return false;
      return true;
    }).sort(function(a, b){ return new Date(b.created_at) - new Date(a.created_at); });
  }

  function leadsTabHtml(){
    if (!state.leads || !state.contacts) return '<div class="eg-card"><div class="eg-empty">Loading leads...</div></div>';
    var filtered = filteredLeads();
    var page = paginate(filtered, state.leadPage);
    var lrows = page.pageItems.map(function(r){
      return '<tr class="eg-clickrow" style="cursor:pointer" data-lead-drawer="' + esc(r.id) + '">' +
        '<td><b>' + esc(contactName(r.contact)) + '</b></td>' +
        '<td>' + esc(r.service_interest || r.title || "-") + '</td>' +
        '<td><span class="eg-tag">' + esc(sourceLabel(r.source)) + '</span></td>' +
        '<td>' + statusPill(r.status) + '</td>' +
        '<td>' + esc(r.priority) + '</td>' +
        '<td class="eg-small eg-muted">' + fmtDate(r.last_activity_at) + '</td>' +
        '<td class="eg-small eg-muted">' + fmtDate(r.created_at) + '</td></tr>';
    }).join("");
    return '<div class="eg-card">' +
      '<div class="eg-toolbar">' +
      '<input id="egLeadSearch" placeholder="Search lead or contact..." value="' + esc(state.leadSearch) + '" />' +
      '<select id="egLeadDateFilter">' + selOpts([{value:"month",label:"This month"},{value:"quarter",label:"This quarter"},{value:"year",label:"This year"},{value:"all",label:"All time"}], state.leadDateFilter) + '</select>' +
      '<select id="egLeadStatusFilter">' + selOpts(["all","new","contacted","qualified","booked","won","lost"].map(function(s){ return {value:s, label: s === "all" ? "All status" : s}; }), state.leadStatusFilter) + '</select>' +
      '<select id="egLeadSourceFilter">' + selOpts([{value:"all",label:"All sources"},{value:"website_form",label:"Website form"},{value:"website_chat",label:"Website chat"},{value:"whatsapp",label:"WhatsApp"},{value:"voice",label:"Voice"},{value:"manual",label:"Manual"}], state.leadSourceFilter) + '</select>' +
      '<button class="eg-btn" id="egDownloadLeadsCsv">Download Leads CSV</button>' +
      '</div>' +
      (lrows ? '<table class="eg-table"><thead><tr><th>Lead</th><th>Interest</th><th>Source</th><th>Status</th><th>Priority</th><th>Last Activity</th><th>Created</th></tr></thead><tbody>' + lrows + '</tbody></table>' : '<div class="eg-empty">' + (state.leadSearch ? "No matching leads." : "No leads in this period.") + '</div>') +
      pagerHtml("egLead", page, "leads") +
      (state.leadDateFilter !== "all" ? '<div class="eg-small eg-muted" style="margin-top:10px">Only showing leads from the selected period. Older leads aren\'t deleted - switch to "All time" or use Download Leads CSV to get full history.</div>' : "") +
      '</div>';
  }

  function contactsTabHtml(){
    if (!state.contacts) return '<div class="eg-card"><div class="eg-empty">Loading contacts...</div></div>';
    var filtered = filteredContacts();
    var page = paginate(filtered, state.contactPage);
    var crows = page.pageItems.map(function(c){
      return '<tr><td><b>' + esc(contactName(c)) + '</b></td><td>' + esc(c.email || "-") + '</td><td>' + esc(c.phone || "-") + '</td><td>' + esc(c.company || "-") + '</td><td>' + esc(c.preferred_channel || "-") + '</td><td class="eg-small eg-muted">' + fmtDate(c.last_interaction_at) + '</td><td class="eg-small eg-muted">' + fmtDate(c.created_at) + '</td></tr>';
    }).join("");
    return '<div class="eg-card">' +
      '<div class="eg-toolbar">' +
      '<input id="egContactSearch" placeholder="Search name, email, company..." value="' + esc(state.contactSearch) + '" />' +
      '<select id="egContactDateFilter">' + selOpts([{value:"month",label:"This month"},{value:"quarter",label:"This quarter"},{value:"year",label:"This year"},{value:"all",label:"All time"}], state.contactDateFilter) + '</select>' +
      '<button class="eg-btn" id="egDownloadContactsCsv">Download Contacts CSV</button>' +
      '</div>' +
      (crows ? '<table class="eg-table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Company</th><th>Preferred Channel</th><th>Last Interaction</th><th>Created</th></tr></thead><tbody>' + crows + '</tbody></table>' : '<div class="eg-empty">' + (state.contactSearch ? "No matching contacts." : "No contacts in this period.") + '</div>') +
      pagerHtml("egContact", page, "contacts") +
      (state.contactDateFilter !== "all" ? '<div class="eg-small eg-muted" style="margin-top:10px">Only showing contacts created in the selected period. Older contacts aren\'t deleted - switch to "All time" or use Download Contacts CSV to get full history.</div>' : "") +
      '</div>';
  }

  function leadsHtml(){
    var tabs = '<div class="eg-tabs">' +
      '<div class="eg-tab' + (state.tab === "leads" ? " active" : "") + '" data-tab="leads">Leads</div>' +
      '<div class="eg-tab' + (state.tab === "contacts" ? " active" : "") + '" data-tab="contacts">Contacts</div>' +
      '</div>';
    return tabs + (state.tab === "contacts" ? contactsTabHtml() : leadsTabHtml());
  }

  function bindLeads(){
    document.querySelectorAll("[data-tab]").forEach(function(el){
      el.addEventListener("click", function(){
        state.tab = el.getAttribute("data-tab");
        if (state.tab === "contacts") ensureContacts(function(){});
        render();
      });
    });
    document.querySelectorAll("[data-lead-drawer]").forEach(function(el){
      el.addEventListener("click", function(){ openLeadDrawer(el.getAttribute("data-lead-drawer")); });
    });

    var leadSearch = document.getElementById("egLeadSearch");
    if (leadSearch) leadSearch.addEventListener("input", function(){
      preserveFocus(function(){ state.leadSearch = leadSearch.value; state.leadPage = 1; render(); });
    });
    var dateFilter = document.getElementById("egLeadDateFilter");
    if (dateFilter) dateFilter.addEventListener("change", function(){ state.leadDateFilter = dateFilter.value; state.leadPage = 1; render(); });
    var statusFilter = document.getElementById("egLeadStatusFilter");
    if (statusFilter) statusFilter.addEventListener("change", function(){ state.leadStatusFilter = statusFilter.value; state.leadPage = 1; render(); });
    var sourceFilter = document.getElementById("egLeadSourceFilter");
    if (sourceFilter) sourceFilter.addEventListener("change", function(){ state.leadSourceFilter = sourceFilter.value; state.leadPage = 1; render(); });
    var contactSearch = document.getElementById("egContactSearch");
    if (contactSearch) contactSearch.addEventListener("input", function(){
      preserveFocus(function(){ state.contactSearch = contactSearch.value; state.contactPage = 1; render(); });
    });
    var contactDateFilter = document.getElementById("egContactDateFilter");
    if (contactDateFilter) contactDateFilter.addEventListener("change", function(){ state.contactDateFilter = contactDateFilter.value; state.contactPage = 1; render(); });
    bindPager("egLead", "leadPage");
    bindPager("egContact", "contactPage");

    // CSV export deliberately ignores the on-screen date filter - it's the
    // "full history" escape hatch for anything older than what's rendered
    // (see the note above the table), so it always exports every record
    // matching the search/status/source filters regardless of period.
    var dlLeadsBtn = document.getElementById("egDownloadLeadsCsv");
    if (dlLeadsBtn) dlLeadsBtn.addEventListener("click", function(){
      var header = ["Name","Email","Phone","Company","Interest","Source","Status","Priority","Last Activity","Created","Notes"];
      var body = filteredLeads({ ignoreDateFilter: true }).map(function(r){
        var c = r.contact || {};
        return [contactName(c), c.email, c.phone, c.company, r.service_interest || r.title, r.source, r.status, r.priority, r.last_activity_at, r.created_at, r.notes];
      });
      downloadCsv("edgifynow-crm-leads.csv", header, body);
    });
    var dlContactsBtn = document.getElementById("egDownloadContactsCsv");
    if (dlContactsBtn) dlContactsBtn.addEventListener("click", function(){
      var header = ["Name","Email","Phone","Company","Job Title","Preferred Channel","Last Interaction","Created"];
      var body = filteredContacts({ ignoreDateFilter: true }).map(function(c){
        return [contactName(c), c.email, c.phone, c.company, c.job_title, c.preferred_channel, c.last_interaction_at, c.created_at];
      });
      downloadCsv("edgifynow-crm-contacts.csv", header, body);
    });
  }

  // ---- Lead detail drawer ----
  // There's no DELETE for leads (GET/PATCH only) - "Lost" + a reason is
  // the only way to get bad/test/duplicate leads out of the way without
  // deleting them. Note lost_reason is write-only: PATCH accepts it but
  // GET /api/v1/crm/leads never returns it, so the field always starts
  // blank here even if one was set previously - there's no way to show
  // what it currently is from this API.
  function leadDrawerHtml(){
    if (!state.leadDrawerId) return "";
    var r = joinedLeads().filter(function(x){ return x.id === state.leadDrawerId; })[0];
    if (!r) return "";
    var c = r.contact || {};
    var statusOptions = ["new", "contacted", "qualified", "booked", "won", "lost"];
    var statusSelect = '<select class="eg-select" id="egDrawerStatus">' + statusOptions.map(function(s){
      return '<option value="' + s + '"' + (s === r.status ? " selected" : "") + '>' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
    }).join("") + '</select>';

    return '<div class="eg-drawer-backdrop open" id="egDrawerBackdrop"></div>' +
      '<aside class="eg-drawer open">' +
      '<button class="eg-drawer-close" id="egDrawerClose" aria-label="Close">&times;</button>' +
      '<h2>' + esc(contactName(c)) + '</h2>' +
      '<div class="eg-drawer-sub">' + esc(r.service_interest || r.title || "Lead") + '</div>' +
      '<h4>Contact</h4>' +
      '<div class="eg-kv"><span>Email</span><b>' + esc(c.email || "-") + '</b></div>' +
      '<div class="eg-kv"><span>Phone</span><b>' + esc(c.phone || "-") + '</b></div>' +
      '<div class="eg-kv"><span>Company</span><b>' + esc(c.company || "-") + '</b></div>' +
      '<div class="eg-kv"><span>Job title</span><b>' + esc(c.job_title || "-") + '</b></div>' +
      '<h4>Lead</h4>' +
      '<div class="eg-kv"><span>Interest</span><b>' + esc(r.service_interest || "-") + '</b></div>' +
      '<div class="eg-kv"><span>Source</span><b>' + esc(sourceLabel(r.source)) + '</b></div>' +
      '<div class="eg-kv"><span>Priority</span><b>' + esc(r.priority) + '</b></div>' +
      '<div class="eg-kv"><span>Created</span><b>' + fmtDate(r.created_at) + '</b></div>' +
      '<div class="eg-kv"><span>Last activity</span><b>' + fmtDate(r.last_activity_at) + '</b></div>' +
      '<h4>Status</h4>' +
      '<div class="eg-form-row">' + statusSelect + '</div>' +
      '<div class="eg-form-row" id="egDrawerLostReasonRow"' + (r.status === "lost" ? "" : " hidden") + '>' +
      '<label>Reason <span class="eg-small eg-muted">(use "Lost" + a reason like "Test/dummy data" to get bad leads out of the way without deleting - there\'s no delete endpoint for leads)</span></label>' +
      '<input class="eg-input" id="egDrawerLostReason" placeholder="Not interested, duplicate, test data, etc." />' +
      '</div>' +
      '<button class="eg-btn" id="egDrawerSaveStatus">Save status</button>' +
      '<h4>Notes</h4>' +
      '<div style="line-height:1.55">' + (r.notes ? esc(r.notes) : '<span class="eg-muted">-</span>') + '</div>' +
      '<h4>Appointments</h4>' +
      appointmentsHtml() +
      '</aside>';
  }

  // Journey C: a visitor books via the widget (POST /api/v1/public/
  // appointments), and the client needs to be able to review it here.
  // There's no global appointments list endpoint, only per-lead, so this
  // is fetched by openLeadDrawer() alongside the lead itself.
  function appointmentsHtml(){
    if (state.leadAppointments === null) return '<div class="eg-small eg-muted">Loading...</div>';
    if (!state.leadAppointments.length) return '<div class="eg-small eg-muted">No appointments for this lead.</div>';
    var apptStatusOptions = ["scheduled", "confirmed", "cancelled", "completed", "no_show"];
    return state.leadAppointments.map(function(a){
      var opts = apptStatusOptions.map(function(s){
        return '<option value="' + s + '"' + (s === a.status ? " selected" : "") + '>' + esc(s.replace("_", " ")) + '</option>';
      }).join("");
      var when = fmtDate(a.start_at) + (a.end_at ? " &ndash; " + new Date(a.end_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
      var where = a.meeting_url ? '<a href="' + esc(a.meeting_url) + '" target="_blank" rel="noopener">Meeting link</a>' : (a.location ? esc(a.location) : "");
      return '<div class="eg-statusbox" style="margin-bottom:10px">' +
        '<b>' + when + '</b>' +
        (where ? '<div class="eg-small eg-muted" style="margin-top:2px">' + where + '</div>' : "") +
        (a.notes ? '<div class="eg-small" style="margin-top:6px">' + esc(a.notes) + '</div>' : "") +
        '<div style="margin-top:8px"><select class="eg-select" style="padding:6px 8px;font-size:12px;width:auto" data-appt-status="' + esc(a.id) + '">' + opts + '</select></div>' +
        '</div>';
    }).join("");
  }

  function bindDrawer(){
    var backdrop = document.getElementById("egDrawerBackdrop");
    if (backdrop) backdrop.addEventListener("click", function(){ state.leadDrawerId = null; state.leadAppointments = null; render(); });
    var closeBtn = document.getElementById("egDrawerClose");
    if (closeBtn) closeBtn.addEventListener("click", function(){ state.leadDrawerId = null; state.leadAppointments = null; render(); });
    var statusSelectEl = document.getElementById("egDrawerStatus");
    var lostReasonRow = document.getElementById("egDrawerLostReasonRow");
    if (statusSelectEl && lostReasonRow) {
      statusSelectEl.addEventListener("change", function(){ lostReasonRow.hidden = statusSelectEl.value !== "lost"; });
    }
    var saveBtn = document.getElementById("egDrawerSaveStatus");
    if (saveBtn) saveBtn.addEventListener("click", function(){
      var id = state.leadDrawerId;
      var newStatus = document.getElementById("egDrawerStatus").value;
      var body = { status: newStatus };
      if (newStatus === "lost") {
        var reasonInput = document.getElementById("egDrawerLostReason");
        body.lost_reason = reasonInput ? (reasonInput.value.trim() || null) : null;
      }
      saveBtn.disabled = true; saveBtn.textContent = "Saving...";
      api("/api/v1/crm/leads/" + id, { method: "PATCH", body: body })
        .then(function(updated){
          state.leads = (state.leads || []).map(function(l){ return l.id === updated.id ? updated : l; });
          showToast("Lead updated");
          render();
        })
        .catch(function(err){ showToast(err.message, true); saveBtn.disabled = false; saveBtn.textContent = "Save status"; });
    });
    document.querySelectorAll("[data-appt-status]").forEach(function(sel){
      sel.addEventListener("change", function(){
        var id = sel.getAttribute("data-appt-status");
        var newStatus = sel.value;
        api("/api/v1/crm/appointments/" + id, { method: "PATCH", body: { status: newStatus } })
          .then(function(updated){
            state.leadAppointments = (state.leadAppointments || []).map(function(a){ return a.id === updated.id ? updated : a; });
            showToast("Appointment updated");
          })
          .catch(function(err){ showToast(err.message, true); });
      });
    });
  }

  // ---- Knowledge ----
  function knowledgeHtml(){
    var docs = state.documents;
    var body = "";
    var pager = "";
    if (!docs) body = '<div class="eg-empty">Loading documents...</div>';
    else if (!docs.length) body = '<div class="eg-empty">No documents uploaded yet.</div>';
    else {
      var page = paginate(docs, state.knowledgePage);
      var rows = page.pageItems.map(function(d){
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
      pager = pagerHtml("egKnowledge", page, "documents");
    }
    return '<div class="eg-card">' +
      '<div class="eg-row"><h3>Documents</h3><label class="eg-btn" style="cursor:pointer">Upload document<input type="file" id="egFileInput" accept=".pdf,.doc,.docx" style="display:none" /></label></div>' +
      body +
      pager +
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
    bindPager("egKnowledge", "knowledgePage");
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
      var page = paginate(tenants, state.tenantsPage);
      var rows = page.pageItems.map(function(t){
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
        pagerHtml("egTenants", page, "clients") +
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
    bindPager("egTenants", "tenantsPage");

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
      '<div class="eg-form-row"><label><input type="checkbox" id="egDetailWhatsappEnabled"' + (t.whatsapp_enabled ? ' checked' : '') + ' style="margin-right:6px" />WhatsApp enabled</label></div>' +
      '<div class="eg-form-row"><label>WhatsApp number</label><input class="eg-input" id="egDetailWhatsappNumber" value="' + esc(t.whatsapp_number || "") + '" placeholder="+15551234567" /></div>' +
      '<div class="eg-form-row"><label><input type="checkbox" id="egDetailVoiceEnabled"' + (t.voice_enabled ? ' checked' : '') + ' style="margin-right:6px" />Voice AI enabled</label></div>' +
      '<div class="eg-form-row"><label>Voice number</label><input class="eg-input" id="egDetailVoiceNumber" value="' + esc(t.voice_number || "") + '" placeholder="+15551234567" /></div>' +
      '<button class="eg-btn" id="egSaveChannels">Save channel settings</button>' +
      '<h3 style="margin-top:18px">Contact</h3>' +
      '<div class="eg-form-row"><label>Contact name</label><div class="eg-input" style="background:#f7f9fc">' + (t.contact_name ? esc(t.contact_name) : dash) + '</div></div>' +
      '<div class="eg-form-row"><label>Contact phone</label><div class="eg-input" style="background:#f7f9fc">' + (t.contact_phone ? esc(t.contact_phone) : dash) + '</div></div>' +
      '<div class="eg-form-row"><label>Website</label><div class="eg-input" style="background:#f7f9fc">' + (t.website ? ('<a href="' + esc(t.website) + '" target="_blank" rel="noopener">' + esc(t.website) + '</a>') : dash) + '</div></div>' +
      '<div class="eg-small eg-muted">There is no contact email field on this resource - checked every admin endpoint (GET/PATCH tenant, GET tenants list, GET /api/v1/users). owner_email is only captured at client creation time and never stored back on the tenant record, so it can\'t be shown or edited here. Needs a backend field before this can be added.</div>' +
      '</div>' +
      '</div>' +
      channelSummaryHtml(t);
  }

  // High-level per-channel usage/leads summary, from GET
  // /api/v1/admin/tenants/{id}/usage-summary (added to the backend after
  // this page was first built - openTenantDetail() already called it
  // optimistically in case it showed up, so it started working with no
  // further frontend change). state.tenantUsageSummary still falls back to
  // null defensively (e.g. a transient fetch failure) - the placeholder
  // rendering below is that fallback, not the expected case anymore.
  function channelSummaryHtml(t){
    var s = state.tenantUsageSummary;
    var dash = '<span class="eg-small eg-muted">&mdash;</span>';
    function cell(v){ return (v === null || v === undefined) ? dash : Number(v).toLocaleString(); }

    var rows, totalLeads, totalAi, totalAllowance;
    if (s) {
      var c = s.channels || {};
      rows = [
        ['Website Assistant', cell(c.website && c.website.ai_interactions), cell(c.website && c.website.leads)],
        ['WhatsApp', cell(c.whatsapp && c.whatsapp.ai_interactions), cell(c.whatsapp && c.whatsapp.leads)],
        ['Voice AI', cell(c.voice && c.voice.ai_interactions), cell(c.voice && c.voice.leads)],
        ['Web / Contact Forms', dash, cell(c.web_form && c.web_form.leads)]
      ];
      totalLeads = ["website", "whatsapp", "voice", "web_form"].reduce(function(sum, k){
        return sum + ((c[k] && c[k].leads) || 0);
      }, 0);
      totalAi = s.ai_usage_total !== null && s.ai_usage_total !== undefined ? s.ai_usage_total : (t.ai_usage_current_period || 0);
      totalAllowance = s.ai_usage_allowance !== null && s.ai_usage_allowance !== undefined ? s.ai_usage_allowance : t.ai_usage_allowance;
    } else {
      rows = [
        ['Website Assistant', dash, dash],
        ['WhatsApp', dash, dash],
        ['Voice AI', dash, dash],
        ['Web / Contact Forms', dash, dash]
      ];
      totalLeads = null;
      totalAi = t.ai_usage_current_period || 0;
      totalAllowance = t.ai_usage_allowance;
    }
    var totalAiHtml = totalAllowance ? totalAi.toLocaleString() + ' / ' + totalAllowance.toLocaleString() : totalAi.toLocaleString();
    var totalLeadsHtml = cell(totalLeads);

    var rowsHtml = rows.map(function(r){
      return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>';
    }).join("");

    var noteHtml = s
      ? '<div class="eg-small eg-muted" style="margin-top:10px">Per-channel breakdown from GET /api/v1/admin/tenants/{id}/usage-summary.</div>'
      : '<div class="eg-small eg-muted" style="margin-top:10px">Could not load the per-channel breakdown just now, so those cells show &mdash; rather than a guess. Total AI Interactions / Allowance above is still real (from the tenant record). Try reopening this client.</div>';

    return '<div class="eg-card" style="margin-top:16px">' +
      '<h3>Channel summary</h3>' +
      '<table class="eg-table"><thead><tr><th>Channel</th><th>AI Interactions</th><th>Leads Captured</th></tr></thead><tbody>' +
      rowsHtml +
      '<tr><td><b>Total</b></td><td><b>' + totalAiHtml + '</b></td><td><b>' + totalLeadsHtml + '</b></td></tr>' +
      '</tbody></table>' +
      noteHtml +
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

    var saveChannelsBtn = document.getElementById("egSaveChannels");
    if (saveChannelsBtn) saveChannelsBtn.addEventListener("click", function(){
      var whatsappNumber = document.getElementById("egDetailWhatsappNumber").value.trim();
      var voiceNumber = document.getElementById("egDetailVoiceNumber").value.trim();
      var body = {
        whatsapp_enabled: document.getElementById("egDetailWhatsappEnabled").checked,
        whatsapp_number: whatsappNumber || null,
        voice_enabled: document.getElementById("egDetailVoiceEnabled").checked,
        voice_number: voiceNumber || null
      };
      saveChannelsBtn.disabled = true; saveChannelsBtn.textContent = "Saving...";
      api("/api/v1/admin/tenants/" + state.tenantDetailId, { method: "PATCH", body: body })
        .then(function(updated){
          state.tenantDetail = updated;
          if (state.tenants) state.tenants = state.tenants.map(function(x){ return x.id === updated.id ? updated : x; });
          showToast("Channel settings updated");
          render();
        })
        .catch(function(err){ showToast(err.message, true); })
        .then(function(){ saveChannelsBtn.disabled = false; saveChannelsBtn.textContent = "Save channel settings"; });
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

  // ---- Integrations (widget keys) ----
  // Journey A's "widget generated" step: there was no UI anywhere to
  // create the key a client's website widget needs. POST /api/v1/
  // integrations/api-keys is scoped to whoever is logged in (no tenant_id
  // param), so it can only ever create a key for the CURRENT account - an
  // admin can't generate one on behalf of another tenant through this
  // endpoint. That means this has to live in the client portal, not the
  // admin one: the client logs in (credentials the admin set at creation
  // time) and generates their own key here.
  function integrationsHtml(){
    var revealHtml = "";
    if (state.newApiKeyReveal) {
      var widgetBase = (window.EDGIFY_CONFIG && window.EDGIFY_CONFIG.WIDGET_BASE_URL) || "https://app-dev.edgifynow.com/widget";
      var widgetUrl = widgetBase + "?key=" + encodeURIComponent(state.newApiKeyReveal.api_key);
      var snippet = '<script>\n(function(){\n  var WIDGET_URL = "' + widgetUrl + '";\n' +
        '  var BUBBLE = "70px", PANEL_W = "400px", PANEL_H = "600px";\n' +
        '  var f = document.createElement("iframe");\n' +
        '  f.src = WIDGET_URL;\n' +
        '  f.title = "Business Assistant";\n' +
        '  f.allow = "clipboard-write";\n' +
        '  f.style.cssText = "border:0!important;position:fixed!important;right:20px!important;bottom:20px!important;" +\n' +
        '    "width:" + BUBBLE + "!important;height:" + BUBBLE + "!important;" +\n' +
        '    "max-width:calc(100vw - 40px)!important;max-height:calc(100vh - 40px)!important;" +\n' +
        '    "z-index:2147483647!important;background:transparent!important;border-radius:16px!important;" +\n' +
        '    "transition:width .15s ease,height .15s ease;";\n' +
        '  document.body.appendChild(f);\n' +
        '  window.addEventListener("message", function(e){\n' +
        '    if (!e.data || e.data.source !== "edgifynow-widget") return;\n' +
        '    f.style.width = e.data.open ? PANEL_W : BUBBLE;\n' +
        '    f.style.height = e.data.open ? PANEL_H : BUBBLE;\n' +
        '  });\n})();\n<\/script>';
      revealHtml = '<div class="eg-card" style="border-color:#f0c869;background:#fffbf0;margin-bottom:16px">' +
        '<h3>Your new widget key</h3>' +
        '<div class="eg-error" style="background:#fff7df;color:#9b7100;margin-bottom:12px">Copy this now - you will not be able to see the full key again after leaving this page.</div>' +
        '<div class="eg-form-row"><label>Key (' + esc(state.newApiKeyReveal.name) + ')</label><input class="eg-input" readonly value="' + esc(state.newApiKeyReveal.api_key) + '" onclick="this.select()" /></div>' +
        '<div class="eg-form-row"><label>Embed this on your website</label><textarea class="eg-textarea" readonly style="min-height:160px;font-family:monospace;font-size:12px" onclick="this.select()">' + esc(snippet) + '</textarea></div>' +
        '<button class="eg-btn" id="egDismissKeyReveal">I have copied this</button>' +
        '</div>';
    }

    var listHtml;
    if (!state.apiKeys) {
      listHtml = '<div class="eg-empty">Loading...</div>';
    } else if (!state.apiKeys.length) {
      listHtml = '<div class="eg-empty">No widget keys yet - create one below to embed your assistant on your website.</div>';
    } else {
      var rows = state.apiKeys.map(function(k){
        return '<tr><td><b>' + esc(k.name) + '</b></td>' +
          '<td class="eg-small eg-muted">' + esc(k.key_prefix) + '&hellip;</td>' +
          '<td>' + (k.is_active ? '<span class="eg-pill green">Active</span>' : '<span class="eg-pill red">Revoked</span>') + '</td>' +
          '<td class="eg-small eg-muted">' + fmtDate(k.created_at) + '</td>' +
          '<td>' + (k.is_active ? '<button class="eg-btn danger" style="padding:6px 10px" data-revoke-key="' + esc(k.id) + '">Revoke</button>' : "") + '</td></tr>';
      }).join("");
      listHtml = '<table class="eg-table"><thead><tr><th>Name</th><th>Key prefix</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
    }

    return revealHtml +
      '<div class="eg-card" style="margin-bottom:16px">' +
      '<h3>Widget keys</h3>' +
      '<p class="eg-small eg-muted" style="margin-top:-8px">A widget key lets your website embed your AI assistant. Treat it like a publishable key (safe to put in your site\'s HTML) - it can\'t access your CRM, leads, or account settings.</p>' +
      listHtml +
      '</div>' +
      '<div class="eg-card">' +
      '<h3>Create a new widget key</h3>' +
      '<div class="eg-form-row"><label>Name</label><input class="eg-input" id="egNewKeyName" placeholder="e.g. Main website" /></div>' +
      '<button class="eg-btn" id="egCreateKey">Generate widget key</button>' +
      '</div>';
  }

  function bindIntegrations(){
    var dismissBtn = document.getElementById("egDismissKeyReveal");
    if (dismissBtn) dismissBtn.addEventListener("click", function(){ state.newApiKeyReveal = null; render(); });

    var createBtn = document.getElementById("egCreateKey");
    if (createBtn) createBtn.addEventListener("click", function(){
      var name = document.getElementById("egNewKeyName").value.trim();
      if (!name) { showToast("Please name this key (e.g. which website it's for)", true); return; }
      createBtn.disabled = true; createBtn.textContent = "Generating...";
      api("/api/v1/integrations/api-keys", { method: "POST", body: { name: name } })
        .then(function(created){
          state.newApiKeyReveal = created;
          showToast("Widget key created");
          ensureApiKeys();
        })
        .catch(function(err){ showToast(err.message, true); })
        .then(function(){ createBtn.disabled = false; createBtn.textContent = "Generate widget key"; });
    });

    document.querySelectorAll("[data-revoke-key]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var id = btn.getAttribute("data-revoke-key");
        if (!window.confirm("Revoke this widget key? Any website embedding it will stop working immediately.")) return;
        btn.disabled = true; btn.textContent = "Revoking...";
        api("/api/v1/integrations/api-keys/" + id, { method: "DELETE" })
          .then(function(){
            showToast("Widget key revoked");
            ensureApiKeys();
          })
          .catch(function(err){ showToast(err.message, true); btn.disabled = false; btn.textContent = "Revoke"; });
      });
    });
  }

  init();
})();
