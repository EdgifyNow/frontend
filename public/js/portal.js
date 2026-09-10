(function(){
  // No hard-coded staging fallback here on purpose: config-script.blade.php
  // always renders this from the same server-validated config that
  // EnvironmentGuard already checked; if it's somehow missing, silently
  // defaulting to the staging API is exactly the wrong failure mode in
  // production - render() below blocks with a visible error instead.
  var API_BASE = (window.EDGIFY_CONFIG && window.EDGIFY_CONFIG.API_BASE_URL) || "";
  var TOKEN_KEY = "eg_portal_token";
  var root = document.getElementById("egApp");
  function AND(){ for (var i=0;i<arguments.length;i++){ if(!arguments[i]) return false; } return true; }

  // Voice/WhatsApp aren't part of V1 production scope - this only gates
  // the enablement controls and dashboards (Client Details toggles,
  // Assistant "WhatsApp" type option, Voice/WhatsApp Activity nav items),
  // nothing is deleted. Env-driven (FEATURE_VOICE_WHATSAPP), default true -
  // production's .env sets it false. This is a global switch, separate
  // from (and takes priority over) each tenant's own voice_enabled/
  // whatsapp_enabled - those still gate visibility per-tenant underneath it.
  function featureVoiceWhatsapp(){
    return !!(window.EDGIFY_CONFIG && window.EDGIFY_CONFIG.FEATURE_VOICE_WHATSAPP);
  }

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
    widgetKey: undefined, // undefined = not fetched yet, null = fetched, none exists
    widgetIdDraft: "",
    leadPage: 1,
    contactPage: 1,
    knowledgePage: 1,
    tenantsPage: 1,
    leadSearch: "",
    leadDateFilter: "quarter",
    leadStatusFilter: "all",
    leadSourceFilter: "all",
    contactSearch: "",
    contactDateFilter: "quarter",
    tenantSelf: null,
    voiceCaptures: null,
    voiceSearch: "",
    voiceStatusFilter: "all",
    voiceDrawerId: null,
    voiceDrawerDetail: null,
    whatsappCaptures: null,
    whatsappSearch: "",
    whatsappStatusFilter: "all",
    whatsappDrawerId: null,
    whatsappDrawerDetail: null
  };

  function esc(s){
    if (s === null || s === undefined) return "";
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // Small inline-SVG icon set (solid, currentColor) - used for nav items,
  // metric card badges and card headers so the portal matches the design
  // mockup instead of leaning on unicode glyphs that render differently
  // per OS/font.
  var EG_ICONS = {
    home: 'M10 2.3 2.4 8.7A1 1 0 0 0 2 9.5V17a1 1 0 0 0 1 1h4v-5h6v5h4a1 1 0 0 0 1-1V9.5a1 1 0 0 0-.4-.8z',
    users: 'M7 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm6.5 1a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM2 16.5C2 13.9 4.2 12 7 12s5 1.9 5 4.5V18H2Zm11-4.5c2.5 0 5 1.5 5 4.4V18h-4.4v-1.5c0-1.6-.6-3-1.6-4.2.3-.03.6-.05 1-.05Z',
    play: 'M6 3.6v12.8a.6.6 0 0 0 .9.5l10-6.4a.6.6 0 0 0 0-1L6.9 3.1a.6.6 0 0 0-.9.5z',
    contacts: 'M5 2.5h7.5A1.5 1.5 0 0 1 14 4v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 16V4A1.5 1.5 0 0 1 5 2.5Zm10.5 3H17a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5h-1.5z',
    book: 'M5 2.5h6.5a1 1 0 0 1 1 1v12.7l-3.6-1.8a1 1 0 0 0-.9 0L4.5 16.2V3.5a1 1 0 0 1 1-1zm9 0h1.5a1 1 0 0 1 1 1v12l-2.5-1.25z',
    spark: 'M10 1.6l1.9 4.8a2 2 0 0 0 1.7 1.7l4.8 1.9-4.8 1.9a2 2 0 0 0-1.7 1.7L10 18.4l-1.9-4.8a2 2 0 0 0-1.7-1.7L1.6 10l4.8-1.9a2 2 0 0 0 1.7-1.7z',
    plug: 'M7 2a1 1 0 0 1 1 1v3h4V3a1 1 0 1 1 2 0v3h.5a1 1 0 0 1 1 1v2A5.5 5.5 0 0 1 11 15.4V18a1 1 0 1 1-2 0v-2.6A5.5 5.5 0 0 1 3.5 10V7a1 1 0 0 1 1-1H5V3a1 1 0 0 1 1-1z',
    phone: 'M3.7 3 6.2 2.2l2 4.1-1.9 1.2a10 10 0 0 0 4 4l1.2-1.9 4.1 2-.8 2.5C11.4 16.6 3.6 8.8 3.7 3z',
    chat: 'M3.5 3.5h13A1.5 1.5 0 0 1 18 5v8a1.5 1.5 0 0 1-1.5 1.5H8.4L4 18v-3.5H3.5A1.5 1.5 0 0 1 2 13V5a1.5 1.5 0 0 1 1.5-1.5z',
    pulse: 'M2 11h3.4l1.9-4.6a.8.8 0 0 1 1.5 0l2.8 8.7 1.5-3.6a.8.8 0 0 1 .7-.5H18v2h-3.5l-2.2 5.3a.8.8 0 0 1-1.5 0L8 9.1 6.8 11.5a.8.8 0 0 1-.8.5H2z',
    dollar: 'M9 2h2v2.1c1.2.1 2.3.5 3.1 1.1l-1.1 1.6A4 4 0 0 0 10 6c-1.3 0-2.2.5-2.2 1.4 0 .8.7 1.2 2.5 1.6 2.3.5 3.9 1.3 3.9 3.4 0 1.8-1.3 3-3.2 3.4V18H9v-2c-1.5-.1-2.8-.7-3.8-1.5l1.2-1.6c.9.8 2 1.2 3.1 1.2 1.4 0 2.3-.5 2.3-1.5 0-.8-.6-1.2-2.5-1.6C6.6 8.9 5 8.1 5 6c0-1.8 1.3-3 4-3.3z',
    flask: 'M7.5 2h5v1.8h-1v4.7l3.9 6.5A2 2 0 0 1 13.7 18H6.3a2 2 0 0 1-1.7-3l3.9-6.5V3.8h-1z',
    doc: 'M5 2h6l4 4v10.5A1.5 1.5 0 0 1 13.5 18h-8A1.5 1.5 0 0 1 4 16.5v-13A1.5 1.5 0 0 1 5.5 2zm5.5 1.4V6h2.6z',
    funnel: 'M3 3.5h14a.6.6 0 0 1 .46 1L12.4 10.6a1 1 0 0 0-.24.65V16l-3.3 1.65A.4.4 0 0 1 8 17.3v-6.05a1 1 0 0 0-.24-.65L2.54 4.5A.6.6 0 0 1 3 3.5z',
    trophy: 'M5.5 3h9v3.6a4.5 4.5 0 0 1-9 0zM4 4v1.4A3.5 3.5 0 0 0 6 8.6M16 4v1.4A3.5 3.5 0 0 1 14 8.6M8.5 12h3v2.5h-3zM6 16h8v1.8H6z',
    flag: 'M4 2a1 1 0 0 1 1 1v.5h9.5a.5.5 0 0 1 .42.77L13.3 7.5l1.62 3.23a.5.5 0 0 1-.42.77H5V17a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1z',
    clock: 'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm.9 4a.9.9 0 0 0-1.8 0v4c0 .3.15.58.4.75l3 2a.9.9 0 1 0 1-1.5L10.9 9.5z',
    logout: 'M7 2h4a1 1 0 0 1 0 2H7a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4a1 1 0 1 1 0 2H7a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3zm7.3 4.3 3 3a1 1 0 0 1 0 1.4l-3 3a1 1 0 0 1-1.4-1.4L14.1 11H9a1 1 0 1 1 0-2h5.1l-1.2-1.3a1 1 0 0 1 1.4-1.4z'
  };
  function egIcon(name, size){
    var d = EG_ICONS[name];
    if (!d) return "";
    var s = size || 18;
    return '<svg class="eg-ic" viewBox="0 0 20 20" width="' + s + '" height="' + s + '" fill="currentColor" aria-hidden="true"><path d="' + d + '"/></svg>';
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
      // Gates the Voice Activity nav item: only shown once this tenant's
      // voice channel is actually enabled (set from the admin side), see
      // GET /tenants/me.
      api("/api/v1/tenants/me").then(function(d){ state.tenantSelf = d; render(); }).catch(function(){});
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
  function ensureWidgetKey(){
    api("/api/v1/integrations/widget-key").then(function(d){ state.widgetKey = d; render(); }).catch(function(err){ showToast(err.message, true); });
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
    if (v === "integrations") ensureWidgetKey();
    if (v === "voice") loadChannelCaptures(CHANNEL_ACTIVITY.voice);
    if (v === "whatsapp") loadChannelCaptures(CHANNEL_ACTIVITY.whatsapp);
    render();
  }

  // ---------- RENDER ----------
  function render(){
    if (!API_BASE) {
      root.innerHTML = '<div class="eg-login-wrap"><div class="eg-login-card"><div class="eg-error">Configuration error: API_BASE_URL is not set. This page can\'t reach the API - contact support instead of retrying.</div></div></div>';
      return;
    }
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
        { id: "dashboard", label: "Overview", icon: "home" },
        { id: "tenants", label: "Clients", icon: "users" }
      ];
    }
    // Instant Demo lives in the client portal: it uploads a doc and asks the
    // live assistant, both scoped to a tenant via the caller's JWT - an admin
    // has no tenant context, so it only works for a client account.
    var items = [
      { id: "dashboard", label: "Dashboard", icon: "home" },
      { id: "leads", label: "Leads & Contacts", icon: "contacts" },
      { id: "knowledge", label: "Knowledge", icon: "book" },
      { id: "assistant", label: "AI Assistant", icon: "spark" },
      { id: "demo", label: "Instant Demo", icon: "play" },
      { id: "integrations", label: "Integrations", icon: "plug" }
    ];
    // Voice Activity is a real-time operational dashboard, only meaningful
    // (and only shown) once this tenant's voice channel is enabled - see
    // GET /tenants/me. Hidden entirely rather than shown-disabled, since a
    // tenant without voice has nothing to look at there. featureVoiceWhatsapp()
    // is the global production on/off switch, checked first: Voice/WhatsApp
    // aren't in V1 scope, so this stays hidden for every tenant in
    // production regardless of their own per-tenant enablement.
    if (featureVoiceWhatsapp() && state.tenantSelf && state.tenantSelf.voice_enabled) {
      items.splice(3, 0, { id: "voice", label: "Voice Activity", icon: "phone" });
    }
    if (featureVoiceWhatsapp() && state.tenantSelf && state.tenantSelf.whatsapp_enabled) {
      items.splice(3, 0, { id: "whatsapp", label: "WhatsApp Activity", icon: "chat" });
    }
    return items;
  }

  function renderShell(){
    var items = navItems();
    var navHtml = items.map(function(it){
      var isActive = state.view === it.id || (it.id === "tenants" && state.view === "tenantDetail");
      var cls = "eg-navitem" + (isActive ? " active" : "");
      return '<div class="' + cls + '" data-nav="' + it.id + '">' + egIcon(it.icon) + '<span>' + esc(it.label) + '</span></div>';
    }).join("");

    var sidebarFoot = isAdmin()
      ? '<div class="eg-sidebar-foot"><b>Smarter AI.</b>Stronger Businesses.</div>'
      : '<div class="eg-sidebar-foot"><b>Better conversations.</b>Bigger business.<div style="margin-top:8px;opacity:.7">EdgifyNow Client v1.0.0</div></div>';

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
      '<div class="eg-navitem logout" data-nav="logout">' + egIcon("logout") + '<span>Log out</span></div>' +
      sidebarFoot +
      '</aside>' +
      '<main class="eg-main">' +
      '<div class="eg-topbar">' +
      '<div><div class="eg-h1">' + viewTitle() + '</div><div class="eg-sub">' + viewSub() + '</div></div>' +
      '<div class="eg-user"><div class="eg-avatar">' + esc(initials) + '</div><div><b>' + esc(state.user.email) + '</b><div class="eg-small eg-muted">' + esc(roleLabel) + '</div></div></div>' +
      '</div>' +
      '<div id="egContent"></div>' +
      '</main>' +
      '</div>' + toastHtml + leadDrawerHtml() + voiceDrawerHtml() + whatsappDrawerHtml();

    document.querySelectorAll("[data-nav]").forEach(function(el){
      el.addEventListener("click", function(){
        var v = el.getAttribute("data-nav");
        if (v === "logout") { doLogout(); return; }
        setView(v);
      });
    });
    bindDrawer();
    bindAllChannelDrawers();

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
    if (state.view === "voice") return "Voice Activity";
    if (state.view === "whatsapp") return "WhatsApp Activity";
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
    if (state.view === "voice") return "Live calls, orders, and appointments captured by your voice assistant.";
    if (state.view === "whatsapp") return "Live orders, appointments, and leads captured over WhatsApp.";
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
    if (state.view === "voice") { el.innerHTML = voiceHtml(); bindVoice(); return; }
    if (state.view === "whatsapp") { el.innerHTML = whatsappHtml(); bindWhatsapp(); return; }
  }

  // ---- Dashboard ----
  // "CRM daily view" per the client dashboard mockup: raw lead visibility,
  // no scoring/workflow logic. Built entirely from GET /api/v1/crm/leads +
  // GET /api/v1/crm/contacts (joined client-side on contact_id) - both
  // already fetched by loadDashboardData(). Date/status filtering and
  // sorting happen here in the frontend, same as the mockup's api-note said.
  // Right-side hero artwork (browser window + rising chart), matching the
  // design mockup - inline SVG so it themes with the gradient and needs no
  // asset. Paired with the AUTOMATE/ENGAGE/CONVERT/GROW keyword strip.
  function heroArt(){
    return '<div class="eg-hero-art">' +
      '<svg viewBox="0 0 190 130" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect x="8" y="14" width="150" height="104" rx="10" fill="rgba(255,255,255,.14)" stroke="rgba(255,255,255,.5)" stroke-width="1.5"/>' +
      '<circle cx="20" cy="26" r="2.4" fill="rgba(255,255,255,.7)"/><circle cx="29" cy="26" r="2.4" fill="rgba(255,255,255,.7)"/><circle cx="38" cy="26" r="2.4" fill="rgba(255,255,255,.7)"/>' +
      '<line x1="8" y1="36" x2="158" y2="36" stroke="rgba(255,255,255,.4)" stroke-width="1.2"/>' +
      '<rect x="26" y="88" width="16" height="20" rx="2" fill="rgba(255,255,255,.5)"/>' +
      '<rect x="50" y="78" width="16" height="30" rx="2" fill="rgba(255,255,255,.62)"/>' +
      '<rect x="74" y="66" width="16" height="42" rx="2" fill="rgba(255,255,255,.72)"/>' +
      '<rect x="98" y="80" width="16" height="28" rx="2" fill="rgba(255,255,255,.55)"/>' +
      '<rect x="122" y="56" width="16" height="52" rx="2" fill="rgba(255,255,255,.85)"/>' +
      '<path d="M22 96 L58 84 L82 60 L110 74 L150 30" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M139 28 L152 26 L150 40 Z" fill="#fff"/>' +
      '</svg>' +
      '<div class="eg-hero-kw"><span>AUTOMATE</span><span>ENGAGE</span><span>CONVERT</span><span>GROW</span><span></span></div>' +
      '</div>';
  }
  function heroHtml(eyebrow, title, sub, withArt){
    return '<div class="eg-hero">' +
      (eyebrow ? '<div class="eg-hero-eyebrow">' + esc(eyebrow) + '</div>' : '') +
      '<h2>' + esc(title) + '</h2><p>' + esc(sub) + '</p>' +
      (withArt ? heroArt() : '') +
      '</div>';
  }
  function metricCard(o){
    return '<div class="eg-card eg-metric tint-' + o.color + '">' +
      '<div class="eg-ic-badge c-' + o.color + '">' + egIcon(o.icon, 18) + '</div>' +
      '<div class="eg-label">' + esc(o.label) + '</div>' +
      '<div class="eg-value">' + o.value + '</div>' +
      (o.sub ? '<div class="eg-metric-sub">' + o.sub + '</div>' : '') +
      (o.trend || '') +
      '</div>';
  }
  // Trend line for a metric card. Only shown where there's a real prior
  // period to compare against - "no change" (rather than a fabricated
  // percentage) when there isn't.
  function trendLine(current, prior, unit){
    if (prior === null || prior === undefined) return '<div class="eg-metric-trend flat">&mdash; No change</div>';
    if (!prior) {
      return current > 0
        ? '<div class="eg-metric-trend up">&#8599; up ' + unit + '</div>'
        : '<div class="eg-metric-trend flat">&mdash; No change</div>';
    }
    var pct = Math.round(((current - prior) / prior) * 100);
    if (pct === 0) return '<div class="eg-metric-trend flat">&mdash; No change ' + unit + '</div>';
    return '<div class="eg-metric-trend ' + (pct > 0 ? "up" : "flat") + '">' + (pct > 0 ? "&#8599; +" : "&#8600; ") + pct + '% ' + unit + '</div>';
  }
  function cardHead(icon, title, linkText, linkGoto){
    return '<div class="eg-cardhead"><span class="eg-ic-badge-sm">' + egIcon(icon, 15) + '</span><h3>' + esc(title) + '</h3>' +
      (linkText ? '<span class="eg-cardlink" data-goto="' + esc(linkGoto) + '">' + esc(linkText) + ' &rarr;</span>' : '') +
      '</div>';
  }

  function clientDashboardHtml(){
    var CLIENT_HERO = heroHtml("Welcome to EdgifyNow", "Turn Conversations Into Business", "Manage your AI assistant, leads, appointments and channels in one powerful workspace.", true);
    if (!state.leads || !state.contacts) {
      return CLIENT_HERO + '<div class="eg-card"><div class="eg-empty">Loading...</div></div>';
    }

    var rows = joinedLeads();
    var now = new Date();
    var inMonth = function(d, offset){
      var m = now.getMonth() + (offset || 0), y = now.getFullYear();
      while (m < 0) { m += 12; y -= 1; }
      return d.getFullYear() === y && d.getMonth() === m;
    };
    var monthCount = rows.filter(function(r){ return inMonth(new Date(r.created_at)); }).length;
    var lastMonthCount = rows.filter(function(r){ return inMonth(new Date(r.created_at), -1); }).length;
    var wkAgo = now.getTime() - 7 * 864e5, twoWkAgo = now.getTime() - 14 * 864e5;
    var newThisWk = rows.filter(function(r){ var t = new Date(r.created_at).getTime(); return t >= wkAgo; }).length;
    var newLastWk = rows.filter(function(r){ var t = new Date(r.created_at).getTime(); return t >= twoWkAgo && t < wkAgo; }).length;
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

    return CLIENT_HERO +
      '<div class="eg-grid4">' +
      metricCard({ label: "Leads This Month", value: monthCount, color: "blue", icon: "users", trend: trendLine(monthCount, lastMonthCount, "from last month") }) +
      metricCard({ label: "New", value: newCount, color: "green", icon: "doc", trend: trendLine(newThisWk, newLastWk, "from last week") }) +
      metricCard({ label: "Qualified", value: qualifiedCount, color: "amber", icon: "funnel", trend: trendLine(qualifiedCount, null) }) +
      metricCard({ label: "Won", value: wonCount, color: "purple", icon: "trophy", trend: trendLine(wonCount, null) }) +
      '</div>' +
      '<div class="eg-grid2">' +
      '<div class="eg-card">' + cardHead("flag", "New leads today", "View all leads", "leads") +
      '<p class="eg-small eg-muted" style="margin:2px 0 12px">Created today, newest first.</p>' +
      (todayHtml ? '<table class="eg-table"><thead><tr><th>Lead</th><th>Interest</th><th>Source</th><th>Time</th><th>Status</th></tr></thead><tbody>' + todayHtml + '</tbody></table>' : '<div class="eg-empty">No leads today.</div>') +
      '</div>' +
      '<div class="eg-card">' + cardHead("clock", "This week's attention", "View all activity", "leads") +
      '<p class="eg-small eg-muted" style="margin:2px 0 12px">Open leads with activity this week, newest activity first.</p>' +
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
    // "Active" here means status === "active" specifically - NOT the
    // is_active operational flag, which is also true for trial clients
    // (a trial is an active account, just not a paying one). Counting
    // is_active double-counted trials in both the Active and Trial cards.
    var activeCount = allTenants.filter(function(t){ return t.status === "active"; }).length;
    var trialCount = allTenants.filter(function(t){ return t.status === "trial"; }).length;
    var mrr = allTenants.filter(function(t){ return t.status === "active"; })
      .reduce(function(sum, t){ return sum + (t.recurring_price_usd || 0); }, 0);
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

    return '<div class="eg-hero eg-hero-img"><img src="img/admin-banner.jpg" alt="Run the Platform. Grow the Business. Monitor clients, usage, revenue and platform activity from one place." /></div>' +
      '<div class="eg-row" style="margin-bottom:14px">' +
      '<div></div>' +
      '<select class="eg-select" id="egOverviewDateFilter" style="width:auto">' +
      selOpts([{value:"month",label:"This Month"},{value:"last_month",label:"Last Month"},{value:"quarter",label:"This Quarter"},{value:"all",label:"All Time"}], state.overviewDateFilter) +
      '</select></div>' +
      '<div class="eg-grid4" style="grid-template-columns:repeat(5,1fr)">' +
      metricCard({ label: "Total Clients", value: allTenants.length, color: "blue", icon: "users", sub: "All registered clients" }) +
      metricCard({ label: "Active Clients", value: activeCount, color: "green", icon: "pulse", sub: "Status is active (excludes trials)" }) +
      metricCard({ label: "Monthly Recurring Revenue", value: "$" + mrr.toLocaleString(), color: "teal", icon: "dollar", sub: "Sum of monthly package fees" }) +
      metricCard({ label: "Trial Clients", value: trialCount, color: "amber", icon: "flask", sub: "In trial status" }) +
      metricCard({ label: "AI Usage This Period", value: aiUsageTotal.toLocaleString(), color: "purple", icon: "spark", sub: "Total AI interactions" }) +
      '</div>' +
      '<div class="eg-card"><div class="eg-row"><div>' + cardHead("pulse", "Client health") +
      '<div class="eg-small eg-muted" style="margin-top:2px">Overview of all clients and their current status, package and usage.</div></div>' +
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

  // ---- Channel Activity (real-time operational dashboards, not a usage
  // report - each captured call/message is a business outcome,
  // order/appointment/lead/general inquiry, moving through a status
  // workflow). Voice and WhatsApp share this exact implementation,
  // distinguished only by which channel they ask the backend for
  // (GET /crm/voice-captures?channel=voice|whatsapp) - the backend keeps
  // both in the same table, split by the conversation's own channel.
  var CHANNEL_STATUS_COLOR = { new: "gray", in_progress: "green", ready: "amber", completed: "blue", cancelled: "red" };
  var CHANNEL_STATUS_OPTIONS = ["new", "in_progress", "ready", "completed", "cancelled"];

  var CHANNEL_ACTIVITY = {
    voice: {
      key: "voice",
      captures: "voiceCaptures", search: "voiceSearch", statusFilter: "voiceStatusFilter",
      drawerId: "voiceDrawerId", drawerDetail: "voiceDrawerDetail",
      idPrefix: "egVoice", contactLabel: "Caller",
      emptyMessage: "No voice activity yet. Once your assistant takes a call, captured orders, appointments, and leads will show up here.",
      showTranscript: true
    },
    whatsapp: {
      key: "whatsapp",
      captures: "whatsappCaptures", search: "whatsappSearch", statusFilter: "whatsappStatusFilter",
      drawerId: "whatsappDrawerId", drawerDetail: "whatsappDrawerDetail",
      idPrefix: "egWhatsapp", contactLabel: "Contact",
      emptyMessage: "No WhatsApp activity yet. Once your assistant captures an order, appointment, or lead over WhatsApp, it will show up here.",
      showTranscript: false
    }
  };

  function channelStatusLabel(s){
    return String(s || "").split("_").map(function(w){ return w.charAt(0).toUpperCase() + w.slice(1); }).join(" ");
  }
  function channelTypeLabel(t){
    return String(t || "").split("_").map(function(w){ return w.charAt(0).toUpperCase() + w.slice(1); }).join(" ");
  }

  function loadChannelCaptures(cfg){
    var params = new URLSearchParams();
    params.set("channel", cfg.key);
    if (state[cfg.statusFilter] !== "all") params.set("status_filter", state[cfg.statusFilter]);
    if (state[cfg.search]) params.set("search", state[cfg.search]);
    api("/api/v1/crm/voice-captures?" + params.toString()).then(function(d){
      state[cfg.captures] = d;
      render();
    }).catch(function(err){ showToast(err.message, true); });
  }

  function openChannelDrawer(cfg, id){
    state[cfg.drawerId] = id;
    state[cfg.drawerDetail] = null;
    render();
    api("/api/v1/crm/voice-captures/" + id).then(function(d){
      state[cfg.drawerDetail] = d;
      render();
    }).catch(function(err){ showToast(err.message, true); });
  }

  function channelActivityHtml(cfg){
    var statusOptions = ["all"].concat(CHANNEL_STATUS_OPTIONS);
    var filters =
      '<div class="eg-row" style="margin-bottom:14px;gap:10px;flex-wrap:wrap">' +
      '<input class="eg-input" id="' + cfg.idPrefix + 'Search" placeholder="Search name, phone, or summary..." style="max-width:280px" value="' + esc(state[cfg.search]) + '" />' +
      '<select class="eg-select" id="' + cfg.idPrefix + 'StatusFilter" style="width:auto">' +
      statusOptions.map(function(s){
        return '<option value="' + s + '"' + (s === state[cfg.statusFilter] ? " selected" : "") + '>' + (s === "all" ? "All statuses" : channelStatusLabel(s)) + '</option>';
      }).join("") +
      '</select>' +
      '</div>';

    var captures = state[cfg.captures];
    if (captures === null) return filters + '<div class="eg-small eg-muted">Loading...</div>';
    if (!captures.length) return filters + '<div class="eg-card"><div class="eg-small eg-muted">' + esc(cfg.emptyMessage) + '</div></div>';

    var tiles = captures.map(function(v){
      var color = CHANNEL_STATUS_COLOR[v.status] || "gray";
      return '<div class="eg-vtile ' + color + '" data-channel-drawer="' + cfg.key + '" data-channel-drawer-id="' + esc(v.id) + '">' +
        '<div class="eg-vtile-top">' +
        '<div><div class="eg-vtile-name">' + esc(v.contact.name || "Unknown") + '</div>' +
        '<div class="eg-vtile-phone">' + esc(v.contact.phone || "-") + '</div></div>' +
        '<span class="eg-pill ' + color + '">' + channelStatusLabel(v.status) + '</span>' +
        '</div>' +
        '<span class="eg-tag">' + esc(channelTypeLabel(v.capture_type)) + '</span>' +
        '<div class="eg-vtile-summary">' + esc(v.summary) + '</div>' +
        '<div class="eg-vtile-time">' + fmtDate(v.created_at) + '</div>' +
        '</div>';
    }).join("");

    return filters + '<div class="eg-tilegrid">' + tiles + '</div>';
  }

  function bindChannelActivity(cfg){
    var search = document.getElementById(cfg.idPrefix + "Search");
    if (search) search.addEventListener("input", function(){
      preserveFocus(function(){ state[cfg.search] = search.value; });
      clearTimeout(state["_" + cfg.key + "SearchDebounce"]);
      state["_" + cfg.key + "SearchDebounce"] = setTimeout(function(){ loadChannelCaptures(cfg); }, 300);
    });
    var statusFilterEl = document.getElementById(cfg.idPrefix + "StatusFilter");
    if (statusFilterEl) statusFilterEl.addEventListener("change", function(){
      state[cfg.statusFilter] = statusFilterEl.value;
      loadChannelCaptures(cfg);
    });
    document.querySelectorAll('[data-channel-drawer="' + cfg.key + '"]').forEach(function(el){
      el.addEventListener("click", function(){ openChannelDrawer(cfg, el.getAttribute("data-channel-drawer-id")); });
    });
  }

  function channelDrawerHtml(cfg){
    if (!state[cfg.drawerId]) return "";
    var d = state[cfg.drawerDetail];
    var backdropId = cfg.idPrefix + "DrawerBackdrop";
    if (!d) {
      return '<div class="eg-drawer-backdrop open" id="' + backdropId + '"></div>' +
        '<aside class="eg-drawer open"><div class="eg-small eg-muted">Loading...</div></aside>';
    }
    var statusSelect = '<select class="eg-select" id="' + cfg.idPrefix + 'DrawerStatus">' + CHANNEL_STATUS_OPTIONS.map(function(s){
      return '<option value="' + s + '"' + (s === d.status ? " selected" : "") + '>' + channelStatusLabel(s) + '</option>';
    }).join("") + '</select>';

    var transcriptSection = "";
    if (cfg.showTranscript) {
      var transcriptHtml = !d.transcript.length
        ? '<div class="eg-small eg-muted">No transcript available.</div>'
        : d.transcript.map(function(m){
            return '<div style="margin-bottom:10px"><b class="eg-small">' + esc(m.role === "assistant" ? "Assistant" : cfg.contactLabel) + '</b>' +
              '<div style="font-size:13px;line-height:1.5">' + esc(m.content) + '</div></div>';
          }).join("");
      transcriptSection = '<h4>Transcript</h4>' + transcriptHtml;
    }

    return '<div class="eg-drawer-backdrop open" id="' + backdropId + '"></div>' +
      '<aside class="eg-drawer open">' +
      '<button class="eg-drawer-close" id="' + cfg.idPrefix + 'DrawerClose" aria-label="Close">&times;</button>' +
      '<h2>' + esc(d.contact.name || "Unknown") + '</h2>' +
      '<div class="eg-drawer-sub">' + esc(channelTypeLabel(d.capture_type)) + '</div>' +
      '<h4>' + esc(cfg.contactLabel) + '</h4>' +
      '<div class="eg-kv"><span>Phone</span><b>' + esc(d.contact.phone || "-") + '</b></div>' +
      '<div class="eg-kv"><span>Email</span><b>' + esc(d.contact.email || "-") + '</b></div>' +
      '<div class="eg-kv"><span>Received</span><b>' + fmtDate(d.created_at) + '</b></div>' +
      '<h4>Summary</h4>' +
      '<div style="line-height:1.55;font-size:13px">' + esc(d.summary) + '</div>' +
      (d.details && Object.keys(d.details).length
        ? '<h4>Details</h4>' + Object.keys(d.details).map(function(k){
            return '<div class="eg-kv"><span>' + esc(k) + '</span><b>' + esc(d.details[k]) + '</b></div>';
          }).join("")
        : "") +
      '<h4>Status</h4>' +
      '<div class="eg-form-row">' + statusSelect + '</div>' +
      '<button class="eg-btn" id="' + cfg.idPrefix + 'DrawerSaveStatus">Save status</button>' +
      transcriptSection +
      '</aside>';
  }

  function bindChannelDrawer(cfg){
    var backdrop = document.getElementById(cfg.idPrefix + "DrawerBackdrop");
    if (backdrop) backdrop.addEventListener("click", function(){ state[cfg.drawerId] = null; state[cfg.drawerDetail] = null; render(); });
    var closeBtn = document.getElementById(cfg.idPrefix + "DrawerClose");
    if (closeBtn) closeBtn.addEventListener("click", function(){ state[cfg.drawerId] = null; state[cfg.drawerDetail] = null; render(); });
    var saveBtn = document.getElementById(cfg.idPrefix + "DrawerSaveStatus");
    if (saveBtn) saveBtn.addEventListener("click", function(){
      var newStatus = document.getElementById(cfg.idPrefix + "DrawerStatus").value;
      var drawerId = state[cfg.drawerId];
      saveBtn.disabled = true;
      api("/api/v1/crm/voice-captures/" + drawerId, { method: "PATCH", body: { status: newStatus } })
        .then(function(){
          showToast("Status updated");
          if (state[cfg.captures]) loadChannelCaptures(cfg);
          openChannelDrawer(cfg, drawerId);
        })
        .catch(function(err){ showToast(err.message, true); })
        .then(function(){ saveBtn.disabled = false; });
    });
  }

  function voiceHtml(){ return channelActivityHtml(CHANNEL_ACTIVITY.voice); }
  function bindVoice(){ bindChannelActivity(CHANNEL_ACTIVITY.voice); }
  function voiceDrawerHtml(){ return channelDrawerHtml(CHANNEL_ACTIVITY.voice); }
  function whatsappHtml(){ return channelActivityHtml(CHANNEL_ACTIVITY.whatsapp); }
  function bindWhatsapp(){ bindChannelActivity(CHANNEL_ACTIVITY.whatsapp); }
  function whatsappDrawerHtml(){ return channelDrawerHtml(CHANNEL_ACTIVITY.whatsapp); }
  function bindAllChannelDrawers(){
    bindChannelDrawer(CHANNEL_ACTIVITY.voice);
    bindChannelDrawer(CHANNEL_ACTIVITY.whatsapp);
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
    return '<div class="eg-card"><h3>No AI assistant yet</h3><p class="eg-muted" style="margin:0 0 16px">Create your first AI assistant to start answering questions from your website chat' + (featureVoiceWhatsapp() ? ' and WhatsApp' : '') + '.</p>' +
      '<div class="eg-form-row"><label>Assistant name</label><input class="eg-input" id="egNewAssistantName" value="Website Assistant" /></div>' +
      '<div class="eg-form-row"><label>Type</label><select class="eg-select" id="egNewAssistantType">' +
      '<option value="customer_website">Customer website</option>' +
      (featureVoiceWhatsapp() ? '<option value="whatsapp">WhatsApp</option>' : '') +
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
      (featureVoiceWhatsapp() ?
        '<div class="eg-form-row"><label><input type="checkbox" id="egDetailWhatsappEnabled"' + (t.whatsapp_enabled ? ' checked' : '') + ' style="margin-right:6px" />WhatsApp enabled</label></div>' +
        '<div class="eg-form-row"><label>WhatsApp number</label><input class="eg-input" id="egDetailWhatsappNumber" value="' + esc(t.whatsapp_number || "") + '" placeholder="+15551234567" /></div>' +
        '<div class="eg-form-row"><label><input type="checkbox" id="egDetailVoiceEnabled"' + (t.voice_enabled ? ' checked' : '') + ' style="margin-right:6px" />Voice AI enabled</label></div>' +
        '<div class="eg-form-row"><label>Voice number</label><input class="eg-input" id="egDetailVoiceNumber" value="' + esc(t.voice_number || "") + '" placeholder="+15551234567" /></div>' +
        '<button class="eg-btn" id="egSaveChannels">Save channel settings</button>'
        : '<div class="eg-small eg-muted">WhatsApp and Voice AI are not part of this release.</div>') +
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
  // Widget embed URL uses only a public, non-secret client id (?client=...),
  // never the permanent key - the widget page exchanges that id for a
  // short-lived session token itself (see engine's /public/widget/bootstrap).
  function widgetEmbedUrl(widgetId){
    var widgetBase = (window.EDGIFY_CONFIG && window.EDGIFY_CONFIG.WIDGET_BASE_URL) || "https://app-dev.edgifynow.com/widget";
    return widgetBase + "?client=" + encodeURIComponent(widgetId);
  }
  function widgetEmbedSnippet(widgetId){
    var widgetUrl = widgetEmbedUrl(widgetId);
    return '<script>\n(function(){\n  var WIDGET_URL = "' + widgetUrl + '";\n' +
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
  }

  function integrationsHtml(){
    var currentHtml;
    if (state.widgetKey === null) {
      currentHtml = '<div class="eg-empty">No widget created yet - create one below to embed your assistant on your website.</div>';
    } else if (!state.widgetKey) {
      currentHtml = '<div class="eg-empty">Loading...</div>';
    } else {
      var k = state.widgetKey;
      currentHtml =
        '<table class="eg-table"><thead><tr><th>Widget ID</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>' +
        '<tr><td><b>' + esc(k.widget_id) + '</b></td>' +
        '<td>' + (k.is_active ? '<span class="eg-pill green">Active</span>' : '<span class="eg-pill red">Revoked</span>') + '</td>' +
        '<td class="eg-small eg-muted">' + fmtDate(k.created_at) + '</td>' +
        '<td>' + (k.is_active ? '<button class="eg-btn danger" style="padding:6px 10px" id="egRevokeWidgetKey">Revoke</button>' : "") + '</td></tr>' +
        '</tbody></table>' +
        (k.is_active
          ? '<div class="eg-form-row" style="margin-top:14px"><label>Embed this on your website</label><textarea class="eg-textarea" readonly style="min-height:160px;font-family:monospace;font-size:12px" onclick="this.select()">' + esc(widgetEmbedSnippet(k.widget_id)) + '</textarea></div>'
          : "");
    }

    return '<div class="eg-card" style="margin-bottom:16px">' +
      '<h3>Current widget</h3>' +
      '<p class="eg-small eg-muted" style="margin-top:-8px">Only one active widget is used for your website at a time. The embed code identifies your widget by this ID only, your account\'s actual key is never exposed to your website\'s HTML.</p>' +
      currentHtml +
      '</div>' +
      '<div class="eg-card">' +
      '<h3>' + (state.widgetKey && state.widgetKey.is_active ? "Replace widget" : "Create website widget") + '</h3>' +
      (state.widgetKey && state.widgetKey.is_active ? '<p class="eg-small eg-muted" style="margin-top:-8px">Creating a new one revokes the current widget immediately - update the code on your website after.</p>' : "") +
      '<div class="eg-form-row"><label>Widget ID</label><input class="eg-input" id="egWidgetIdInput" placeholder="e.g. bright-path-tutoring" value="' + esc(state.widgetIdDraft) + '" /></div>' +
      '<button class="eg-btn" id="egCreateWidgetKey">Generate widget key</button>' +
      '</div>';
  }

  function bindIntegrations(){
    var idInput = document.getElementById("egWidgetIdInput");
    if (idInput) idInput.addEventListener("input", function(){
      preserveFocus(function(){ state.widgetIdDraft = idInput.value; });
    });

    var createBtn = document.getElementById("egCreateWidgetKey");
    if (createBtn) createBtn.addEventListener("click", function(){
      var widgetId = (document.getElementById("egWidgetIdInput").value || "").trim();
      if (!widgetId) { showToast("Please enter a widget ID (e.g. your business slug)", true); return; }
      createBtn.disabled = true; createBtn.textContent = "Generating...";
      api("/api/v1/integrations/widget-key", { method: "POST", body: { widget_id: widgetId } })
        .then(function(created){
          state.widgetKey = created;
          state.widgetIdDraft = "";
          showToast("Widget created");
          render();
        })
        .catch(function(err){ showToast(err.message, true); })
        .then(function(){ createBtn.disabled = false; createBtn.textContent = "Generate widget key"; });
    });

    var revokeBtn = document.getElementById("egRevokeWidgetKey");
    if (revokeBtn) revokeBtn.addEventListener("click", function(){
      if (!window.confirm("Revoke this widget? Your website's embed will stop working immediately.")) return;
      revokeBtn.disabled = true; revokeBtn.textContent = "Revoking...";
      api("/api/v1/integrations/widget-key", { method: "DELETE" })
        .then(function(){
          showToast("Widget revoked");
          ensureWidgetKey();
        })
        .catch(function(err){ showToast(err.message, true); revokeBtn.disabled = false; revokeBtn.textContent = "Revoke"; });
    });
  }

  init();
})();
