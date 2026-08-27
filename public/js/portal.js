(function(){
  var API_BASE = window.EDGIFYNOW_API_BASE || "https://api-dev.edgifynow.com";
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
    demoLeadResult: null
  };

  function esc(s){
    if (s === null || s === undefined) return "";
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  function fmtDate(d){
    if (!d) return "-";
    try { return new Date(d).toLocaleString(); } catch(e){ return d; }
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
      var cls = "eg-navitem" + (state.view === it.id ? " active" : "");
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
    if (state.view === "demo") return "Instant Demo";
    return "";
  }
  function viewSub(){
    if (state.view === "dashboard") return isAdmin() ? "Monitor clients from one place." : "Your AI assistant, CRM and channels in one workspace.";
    if (state.view === "leads") return "Contacts and leads captured from your website and channels.";
    if (state.view === "knowledge") return "Documents powering your AI assistant's answers.";
    if (state.view === "assistant") return "Configure and test your AI assistant.";
    if (state.view === "tenants") return "Manage EdgifyNow client workspaces.";
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

  function adminDashboardHtml(){
    var tenants = state.tenants || [];
    var rows = tenants.map(function(t){
      return '<tr><td><b>' + esc(t.name) + '</b><div class="eg-small eg-muted">' + esc(t.slug) + '</div></td>' +
        '<td>' + (t.is_active ? '<span class="eg-pill green">Active</span>' : '<span class="eg-pill red">Inactive</span>') + '</td>' +
        '<td class="eg-small eg-muted">' + fmtDate(t.created_at) + '</td></tr>';
    }).join("");
    return '<div class="eg-grid4">' +
      '<div class="eg-card eg-metric"><div class="eg-label">Total clients</div><div class="eg-value">' + tenants.length + '</div></div>' +
      '<div class="eg-card eg-metric"><div class="eg-label">Active clients</div><div class="eg-value">' + tenants.filter(function(t){return t.is_active;}).length + '</div></div>' +
      '</div>' +
      '<div class="eg-card"><div class="eg-row"><h3>Client health</h3><button class="eg-btn" data-goto="tenants">Manage clients</button></div>' +
      (rows ? '<table class="eg-table"><thead><tr><th>Client</th><th>Status</th><th>Created</th></tr></thead><tbody>' + rows + '</tbody></table>' : '<div class="eg-empty">No clients yet.</div>') +
      '</div>';
  }

  function bindDashboard(){
    document.querySelectorAll("[data-goto]").forEach(function(el){
      el.addEventListener("click", function(){ setView(el.getAttribute("data-goto")); });
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
        window.open(API_BASE + "/api/v1/documents/" + id + "/download", "_blank");
      });
    });
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
  function tenantsHtml(){
    var tenants = state.tenants;
    var listHtml = "";
    if (!tenants) listHtml = '<div class="eg-empty">Loading clients...</div>';
    else if (!tenants.length) listHtml = '<div class="eg-empty">No clients yet.</div>';
    else {
      var rows = tenants.map(function(t){
        return '<tr><td><b>' + esc(t.name) + '</b></td><td>' + esc(t.slug) + '</td>' +
          '<td>' + (t.is_active ? '<span class="eg-pill green">Active</span>' : '<span class="eg-pill red">Inactive</span>') + '</td>' +
          '<td class="eg-small eg-muted">' + fmtDate(t.created_at) + '</td></tr>';
      }).join("");
      listHtml = '<table class="eg-table"><thead><tr><th>Name</th><th>Slug</th><th>Status</th><th>Created</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }

    return '<div class="eg-grid2">' +
      '<div class="eg-card"><h3>All clients</h3>' + listHtml + '</div>' +
      '<div class="eg-card"><h3>Add new client</h3>' +
      '<div class="eg-form-row"><label>Client / business name</label><input class="eg-input" id="egTenantName" /></div>' +
      '<div class="eg-form-row"><label>Slug</label><input class="eg-input" id="egTenantSlug" placeholder="e.g. bright-path-tutoring" /></div>' +
      '<div class="eg-form-row"><label>Owner email</label><input class="eg-input" type="email" id="egOwnerEmail" /></div>' +
      '<div class="eg-form-row"><label>Owner password</label><input class="eg-input" type="password" id="egOwnerPassword" /></div>' +
      '<div class="eg-form-row"><label>Welcome message (optional)</label><input class="eg-input" id="egWelcomeMsg" /></div>' +
      '<button class="eg-btn" id="egCreateTenant" style="width:100%">Create client</button>' +
      '</div></div>';
  }

  function bindTenants(){
    var btn = document.getElementById("egCreateTenant");
    if (!btn) return;
    btn.addEventListener("click", function(){
      var body = {
        tenant_name: document.getElementById("egTenantName").value.trim(),
        tenant_slug: document.getElementById("egTenantSlug").value.trim(),
        owner_email: document.getElementById("egOwnerEmail").value.trim(),
        owner_password: document.getElementById("egOwnerPassword").value,
        welcome_message: document.getElementById("egWelcomeMsg").value.trim() || null
      };
      if (!body.tenant_name || !body.tenant_slug || !body.owner_email || !body.owner_password) {
        showToast("Please fill in all required fields", true);
        return;
      }
      btn.disabled = true; btn.textContent = "Creating...";
      api("/api/v1/admin/tenants", { method: "POST", body: body })
        .then(function(){
          showToast("Client created");
          ensureTenants();
        })
        .catch(function(err){ showToast(err.message, true); })
        .then(function(){ btn.disabled = false; btn.textContent = "Create client"; });
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
