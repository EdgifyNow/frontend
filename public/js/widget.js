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
    open: false,
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

  // ---- Form validation (name / email / US phone / future date-time) ----
  function isValidEmail(email){
    // Deliberately simple (no full RFC 5322 attempt) -- catches the actual
    // typo/mistake case ("no @", "no domain") without rejecting valid but
    // unusual real-world addresses.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
  function usPhoneDigits(phone){
    // Accepts any of: 5551234567, (555) 123-4567, 555-123-4567,
    // +1 555 123 4567, 1-555-123-4567 -- normalizes to 10 bare digits, or
    // null if it isn't a valid US number shape (must be 10 digits, or 11
    // digits with a leading country code 1).
    var digits = String(phone || "").replace(/\D/g, "");
    if (digits.length === 11 && digits.charAt(0) === "1") digits = digits.slice(1);
    return digits.length === 10 ? digits : null;
  }
  function formatUsPhoneE164(phone){
    var digits = usPhoneDigits(phone);
    return digits ? "+1" + digits : null;
  }
  function isFutureDateTime(dateInputValue){
    if (!dateInputValue) return false;
    var d = new Date(dateInputValue);
    return !isNaN(d.getTime()) && d.getTime() > Date.now();
  }
  // FastAPI/Pydantic 422 responses shape `detail` as an array of
  // {loc, msg, type} objects, e.g. [{"loc":["body","email"],"msg":"field
  // required", ...}]. JSON.stringify-ing that whole array (the previous
  // behaviour) produced an unreadable blob; this turns it into
  // "email: field required" style lines instead.
  function describeApiError(err){
    var raw = err && err.message;
    if (!raw) return "Something went wrong. Please try again.";
    try {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(function(item){
          var field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : null;
          return (field ? field + ": " : "") + (item.msg || "invalid value");
        }).join("; ");
      }
    } catch (e) { /* not JSON -- fall through to the raw message */ }
    return raw;
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

  // Collapsed by default: just the round launcher bubble, matching the old
  // sticky chat icon's behaviour (click to open, click to close).
  //
  // IMPORTANT: an <iframe> element intercepts clicks over its whole box
  // regardless of what's drawn inside it - a transparent area is still not
  // click-through. So a host page that embeds this at a fixed large size
  // (e.g. 400x600) would have that entire rectangle block clicks to
  // whatever's underneath it (menus, buttons, etc.) even while collapsed to
  // just the bubble. notifyHostSize() below posts the open/closed state to
  // the parent window so the EMBED SNIPPET itself can shrink the actual
  // <iframe> element to a small bubble-sized box when collapsed and grow it
  // back only while open - see README "Embedding the widget" for the
  // required parent-side listener. Embeds that don't run that listener
  // still work, but keep the click-blocking problem.
  function notifyHostSize(){
    try {
      window.parent.postMessage({ source: "edgifynow-widget", open: state.open }, "*");
    } catch (e) { /* no parent window (e.g. viewed directly) - fine to ignore */ }
  }

  function render(){
    if (!state.open) {
      root.innerHTML = '<button class="wg-launcher" id="wgLauncher" aria-label="Open chat"><svg viewBox="0 0 24 24" width="26" height="26" fill="#fff"><path d="M4 4h16a1 1 0 011 1v11a1 1 0 01-1 1H9l-5 4v-4H4a1 1 0 01-1-1V5a1 1 0 011-1z"/></svg></button>';
      bind();
      return;
    }

    var closeBtnHtml = '<button class="wg-close" id="wgClose" aria-label="Close chat">&times;</button>';

    if (state.keyMissing) {
      root.innerHTML = '<div class="wg-window"><div class="wg-mini-head">' + closeBtnHtml + '</div><div class="wg-boot">No widget key provided in the URL (expected ?key=...).</div></div>';
      bind();
      return;
    }
    if (state.booting) {
      root.innerHTML = '<div class="wg-window"><div class="wg-mini-head">' + closeBtnHtml + '</div><div class="wg-boot"><span class="wg-spin"></span></div></div>';
      bind();
      return;
    }
    if (state.brandingError) {
      root.innerHTML = '<div class="wg-window"><div class="wg-mini-head">' + closeBtnHtml + '</div><div class="wg-error-banner">Could not load this assistant: ' + esc(state.brandingError) + '</div></div>';
      bind();
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
      '<div class="wg-window">' +
      '<div class="wg-head">' +
      logoHtml +
      '<div><div class="wg-head-name">' + esc(b.name || "Business Assistant") + '</div><div class="wg-head-sub">Usually replies instantly</div></div>' +
      '<button class="wg-restart" id="wgRestart" title="Restart conversation">Restart</button>' +
      closeBtnHtml +
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
      '</form></div>' +
      '</div>';

    bind();
    var body = document.getElementById("wgBody");
    if (body) body.scrollTop = body.scrollHeight;
  }

  function leadPanelHtml(){
    var result = state.leadResult ? '<div class="wg-loading" style="color:#168a5b">Thanks - we\'ve got your details.</div>' : "";
    var errorHtml = state.leadFormError ? '<div class="wg-loading" style="color:#c24141">' + esc(state.leadFormError) + '</div>' : "";
    return '<div class="wg-panel"><h4>Leave your contact details</h4>' +
      '<input id="wgLeadName" placeholder="Your name" required />' +
      '<input id="wgLeadEmail" type="email" placeholder="Email" required />' +
      '<input id="wgLeadPhone" type="tel" placeholder="Phone, e.g. (555) 123-4567" required />' +
      '<div class="wg-panel-actions">' +
      '<button class="wg-panel-btn primary" id="wgLeadSubmit">Send</button>' +
      '<button class="wg-panel-btn ghost" id="wgPanelCancel">Cancel</button>' +
      '</div>' + errorHtml + result + '</div>';
  }

  function appointmentPanelHtml(){
    var result = state.appointmentResult ? '<div class="wg-loading" style="color:#168a5b">Your appointment request was sent.</div>' : "";
    var errorHtml = state.appointmentFormError ? '<div class="wg-loading" style="color:#c24141">' + esc(state.appointmentFormError) + '</div>' : "";
    return '<div class="wg-panel"><h4>Book an appointment</h4>' +
      '<input id="wgApptName" placeholder="Your name" required />' +
      '<input id="wgApptEmail" type="email" placeholder="Email" required />' +
      '<input id="wgApptPhone" type="tel" placeholder="Phone, e.g. (555) 123-4567" required />' +
      '<input id="wgApptWhen" type="datetime-local" required />' +
      '<div class="wg-panel-actions">' +
      '<button class="wg-panel-btn primary" id="wgApptSubmit">Request</button>' +
      '<button class="wg-panel-btn ghost" id="wgPanelCancel">Cancel</button>' +
      '</div>' + errorHtml + result + '</div>';
  }

  function bind(){
    var launcher = document.getElementById("wgLauncher");
    if (launcher) launcher.addEventListener("click", function(){
      state.open = true;
      render();
      notifyHostSize();
    });

    var closeBtn = document.getElementById("wgClose");
    if (closeBtn) closeBtn.addEventListener("click", function(){
      state.open = false;
      render();
      notifyHostSize();
    });

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
      var phoneRaw = document.getElementById("wgLeadPhone").value.trim();
      var phone = formatUsPhoneE164(phoneRaw);

      if (!name) { state.leadFormError = "Please enter your name."; render(); return; }
      if (!isValidEmail(email)) { state.leadFormError = "Please enter a valid email address."; render(); return; }
      if (!phone) { state.leadFormError = "Please enter a valid US phone number, e.g. (555) 123-4567."; render(); return; }

      state.leadFormError = null;
      var parts = name.split(" ");
      var firstName = parts.shift() || "";
      var lastName = parts.join(" ");
      leadSubmit.disabled = true; leadSubmit.textContent = "Sending...";
      api("/api/v1/public/leads", { method: "POST", body: {
        first_name: firstName || null,
        last_name: lastName || null,
        email: email,
        phone: phone
      }})
        .then(function(){
          state.leadResult = true;
          render();
        })
        .catch(function(err){
          // Kept in the panel (not pushed into the chat log, and the panel
          // is no longer closed on failure) -- silently closing the panel
          // on a rejected submission is exactly why a failed save looked
          // indistinguishable from "nothing happened".
          state.leadFormError = "Could not save your details: " + describeApiError(err);
          render();
        })
        .then(function(){ leadSubmit.disabled = false; leadSubmit.textContent = "Send"; });
    });

    var APPOINTMENT_DURATION_MINUTES = 30;
    var apptSubmit = document.getElementById("wgApptSubmit");
    if (apptSubmit) apptSubmit.addEventListener("click", function(){
      var name = document.getElementById("wgApptName").value.trim();
      var email = document.getElementById("wgApptEmail").value.trim();
      var phoneRaw = document.getElementById("wgApptPhone").value.trim();
      var phone = formatUsPhoneE164(phoneRaw);
      var when = document.getElementById("wgApptWhen").value;

      if (!name) { state.appointmentFormError = "Please enter your name."; render(); return; }
      if (!isValidEmail(email)) { state.appointmentFormError = "Please enter a valid email address."; render(); return; }
      if (!phone) { state.appointmentFormError = "Please enter a valid US phone number, e.g. (555) 123-4567."; render(); return; }
      if (!isFutureDateTime(when)) { state.appointmentFormError = "Please choose a date and time in the future."; render(); return; }

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
        email: email,
        phone: phone,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null
      }})
        .then(function(){
          state.appointmentResult = true;
          render();
        })
        .catch(function(err){
          state.appointmentFormError = "Could not book that appointment: " + describeApiError(err);
          render();
        })
        .then(function(){ apptSubmit.disabled = false; apptSubmit.textContent = "Request"; });
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
  notifyHostSize();
  if (!state.keyMissing) loadBranding();
})();
