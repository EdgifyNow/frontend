(function(){
  var API_BASE = (window.EDGIFY_CONFIG && window.EDGIFY_CONFIG.API_BASE_URL) || "https://api-dev.edgifynow.com";
  var CONV_KEY = "eg_widget_conversation_id";
  var root = document.getElementById("wgRoot");

  // The widget key is read from the URL and used only as a request header.
  // This code never renders it into the DOM and never console.logs it. Note
  // that's not the same as "never appears anywhere" -- as a query-string
  // value it can still show up in browser history or a web server's access
  // logs, which is inherent to URLs in general, not something this file can
  // prevent. It's a public, tenant-scoped key (same trust model as a Stripe
  // publishable key), not a secret that would be dangerous if it leaked
  // that way -- see README "Embedding the widget" for the full reasoning.
  var WIDGET_KEY = new URLSearchParams(location.search).get("key") || "";

  var state = {
    booting: true,
    keyMissing: !WIDGET_KEY,
    branding: null,
    brandingError: null,
    messages: [],
    sending: false,
    activePanel: null,
    leadResult: null,
    leadFormError: null,
    appointmentResult: null,
    appointmentFormError: null,
    conversationId: sessionStorage.getItem(CONV_KEY) || null
  };

  function esc(s){
    if (s === null || s === undefined) return "";
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function api(path, opts){
    opts = opts || {};
    var headers = { "Content-Type": "application/json", "X-API-Key": WIDGET_KEY };
    return fetch(API_BASE + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function(res){
      return res.text().then(function(txt){
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch(e){ data = null; }
        if (!res.ok) {
          var msg = "Request failed (" + res.status + ")";
          if (data && data.detail) {
            msg = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
          }
          throw new Error(msg);
        }
        return data;
      });
    });
  }

  function primaryColor(){
    return (state.branding && state.branding.primary_color) || "#1f5fbf";
  }

  function applyBrandColor(){
    var color = primaryColor();
    document.documentElement.style.setProperty("--wg-primary", color);
  }

  function loadBranding(){
    api("/api/v1/public/branding")
      .then(function(b){
        state.branding = b;
        state.booting = false;
        applyBrandColor();
        render();
      })
      .catch(function(err){
        state.brandingError = err.message;
        state.booting = false;
        render();
      });
  }

  function render(){
    if (state.keyMissing) {
      root.innerHTML = '<div class="wg-boot">No widget key provided in the URL (expected ?key=...).</div>';
      return;
    }
    if (state.booting) {
      root.innerHTML = '<div class="wg-boot"><span class="wg-spin"></span></div>';
      return;
    }
    if (state.brandingError) {
      root.innerHTML = '<div class="wg-error-banner">Could not load this assistant: ' + esc(state.brandingError) + '</div>';
      return;
    }

    var b = state.branding || {};
    var logoHtml = b.logo_url ? '<img src="' + esc(b.logo_url) + '" alt="" />' : '';

    var msgsHtml = state.messages.map(function(m){
      var cls = m.who === "user" ? "wg-msg-user" : (m.who === "error" ? "wg-msg-error" : "wg-msg-bot");
      return '<div class="wg-msg ' + cls + '">' + esc(m.text) + '</div>';
    }).join("");

    if (!state.messages.length && b.welcome_message) {
      msgsHtml = '<div class="wg-msg wg-msg-bot">' + esc(b.welcome_message) + '</div>';
    }

    var loadingHtml = state.sending ? '<div class="wg-loading"><span class="wg-spin"></span> Thinking...</div>' : '';

    var panelHtml = "";
    if (state.activePanel === "lead") {
      panelHtml = leadPanelHtml();
    } else if (state.activePanel === "appointment") {
      panelHtml = appointmentPanelHtml();
    }

    root.innerHTML =
      '<div class="wg-head">' +
      logoHtml +
      '<div><div class="wg-head-name">' + esc(b.name || "Business Assistant") + '</div><div class="wg-head-sub">Usually replies instantly</div></div>' +
      '<button class="wg-restart" id="wgRestart" title="Restart conversation">Restart</button>' +
      '</div>' +
      '<div class="wg-body" id="wgBody">' + msgsHtml + loadingHtml + '</div>' +
      '<div class="wg-actions">' +
      '<button class="wg-action-btn" data-panel="lead">Leave contact details</button>' +
      '<button class="wg-action-btn" data-panel="appointment">Book an appointment</button>' +
      '</div>' +
      panelHtml +
      '<div class="wg-foot"><form class="wg-form" id="wgChatForm">' +
      '<input class="wg-input" id="wgChatInput" placeholder="Type your question..." autocomplete="off" />' +
      '<button class="wg-send" type="submit" aria-label="Send"><svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg></button>' +
      '</form></div>';

    bind();
    var body = document.getElementById("wgBody");
    if (body) body.scrollTop = body.scrollHeight;
  }

  function leadPanelHtml(){
    var result = state.leadResult ? '<div class="wg-loading" style="color:#168a5b">Thanks - we\'ve got your details.</div>' : "";
    var errorHtml = state.leadFormError ? '<div class="wg-loading" style="color:#c24141">' + esc(state.leadFormError) + '</div>' : "";
    return '<div class="wg-panel"><h4>Leave your contact details</h4>' +
      '<input id="wgLeadName" placeholder="Your name" />' +
      '<input id="wgLeadEmail" type="email" placeholder="Email" />' +
      '<input id="wgLeadPhone" placeholder="Phone" />' +
      '<div class="wg-panel-actions">' +
      '<button class="wg-panel-btn primary" id="wgLeadSubmit">Send</button>' +
      '<button class="wg-panel-btn ghost" id="wgPanelCancel">Cancel</button>' +
      '</div>' + errorHtml + result + '</div>';
  }

  function appointmentPanelHtml(){
    var result = state.appointmentResult ? '<div class="wg-loading" style="color:#168a5b">Your appointment request was sent.</div>' : "";
    var errorHtml = state.appointmentFormError ? '<div class="wg-loading" style="color:#c24141">' + esc(state.appointmentFormError) + '</div>' : "";
    return '<div class="wg-panel"><h4>Book an appointment</h4>' +
      '<input id="wgApptName" placeholder="Your name" />' +
      '<input id="wgApptEmail" type="email" placeholder="Email" />' +
      '<input id="wgApptPhone" placeholder="Phone" />' +
      '<input id="wgApptWhen" type="datetime-local" />' +
      '<div class="wg-panel-actions">' +
      '<button class="wg-panel-btn primary" id="wgApptSubmit">Request</button>' +
      '<button class="wg-panel-btn ghost" id="wgPanelCancel">Cancel</button>' +
      '</div>' + errorHtml + result + '</div>';
  }

  function bind(){
    var restart = document.getElementById("wgRestart");
    if (restart) restart.addEventListener("click", function(){
      state.messages = [];
      state.conversationId = null;
      sessionStorage.removeItem(CONV_KEY);
      state.activePanel = null;
      state.leadResult = null;
      state.leadFormError = null;
      state.appointmentResult = null;
      state.appointmentFormError = null;
      render();
    });

    document.querySelectorAll("[data-panel]").forEach(function(el){
      el.addEventListener("click", function(){
        state.activePanel = el.getAttribute("data-panel");
        state.leadFormError = null;
        state.appointmentFormError = null;
        render();
      });
    });

    var cancelBtn = document.getElementById("wgPanelCancel");
    if (cancelBtn) cancelBtn.addEventListener("click", function(){
      state.activePanel = null;
      state.leadFormError = null;
      state.appointmentFormError = null;
      render();
    });

    var chatForm = document.getElementById("wgChatForm");
    if (chatForm) chatForm.addEventListener("submit", function(e){
      e.preventDefault();
      var input = document.getElementById("wgChatInput");
      var msg = input.value.trim();
      if (!msg || state.sending) return;
      input.value = "";
      sendMessage(msg);
    });

    var leadSubmit = document.getElementById("wgLeadSubmit");
    if (leadSubmit) leadSubmit.addEventListener("click", function(){
      var name = document.getElementById("wgLeadName").value.trim();
      var email = document.getElementById("wgLeadEmail").value.trim();
      var phone = document.getElementById("wgLeadPhone").value.trim();
      if (!email && !phone) {
        state.leadFormError = "Please enter an email or phone number so we can reach you.";
        render();
        return;
      }
      state.leadFormError = null;
      var parts = name.split(" ");
      var firstName = parts.shift() || "";
      var lastName = parts.join(" ");
      leadSubmit.disabled = true; leadSubmit.textContent = "Sending...";
      api("/api/v1/public/leads", { method: "POST", body: {
        first_name: firstName || null,
        last_name: lastName || null,
        email: email || null,
        phone: phone || null
      }})
        .then(function(){
          state.leadResult = true;
          render();
        })
        .catch(function(err){
          state.messages.push({ who: "error", text: "Could not save your details: " + err.message });
          state.activePanel = null;
          render();
        });
    });

    var APPOINTMENT_DURATION_MINUTES = 30;
    var apptSubmit = document.getElementById("wgApptSubmit");
    if (apptSubmit) apptSubmit.addEventListener("click", function(){
      var name = document.getElementById("wgApptName").value.trim();
      var email = document.getElementById("wgApptEmail").value.trim();
      var phone = document.getElementById("wgApptPhone").value.trim();
      var when = document.getElementById("wgApptWhen").value;
      if (!when) {
        state.appointmentFormError = "Please choose a date and time.";
        render();
        return;
      }
      if (!email && !phone) {
        state.appointmentFormError = "Please enter an email or phone number so we can confirm your appointment.";
        render();
        return;
      }
      state.appointmentFormError = null;
      var parts = name.split(" ");
      var firstName = parts.shift() || "";
      var lastName = parts.join(" ");
      var startAt = new Date(when);
      var endAt = new Date(startAt.getTime() + APPOINTMENT_DURATION_MINUTES * 60 * 1000);
      apptSubmit.disabled = true; apptSubmit.textContent = "Sending...";
      api("/api/v1/public/appointments", { method: "POST", body: {
        first_name: firstName || null,
        last_name: lastName || null,
        email: email || null,
        phone: phone || null,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null
      }})
        .then(function(){
          state.appointmentResult = true;
          render();
        })
        .catch(function(err){
          state.messages.push({ who: "error", text: "Could not book that appointment: " + err.message });
          state.activePanel = null;
          render();
        });
    });
  }

  function sendMessage(text){
    state.messages.push({ who: "user", text: text });
    state.sending = true;
    render();

    var body = { message: text };
    if (state.conversationId) body.conversation_id = state.conversationId;

    api("/api/v1/public/chat", { method: "POST", body: body })
      .then(function(data){
        state.sending = false;
        state.conversationId = data.conversation_id;
        sessionStorage.setItem(CONV_KEY, data.conversation_id);
        state.messages.push({ who: "bot", text: data.answer });
        render();
      })
      .catch(function(err){
        state.sending = false;
        state.messages.push({ who: "error", text: err.message });
        render();
      });
  }

  render();
  if (!state.keyMissing) loadBranding();
})();
