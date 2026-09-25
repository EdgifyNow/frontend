<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Book an appointment</title>
<style>
:root{--ink:#172033;--muted:#5b6472;--line:#d9dee7;--primary:#1f5fbf;--bg:#f4f6fa;--red:#c24141;--green:#168a5b}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5}
main{max-width:520px;margin:40px auto;padding:0 16px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:24px}
h1{font-size:22px;margin:0 0 4px}
.sub{color:var(--muted);font-size:14px;margin:0 0 18px}
label.field{display:block;font-size:13px;font-weight:600;margin:12px 0 4px}
input[type=text],input[type=email],input[type=tel],input[type=datetime-local]{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px;font:inherit}
.consent{display:flex;gap:10px;align-items:flex-start;margin:18px 0 6px;font-size:13px;color:var(--ink);background:#f8fafc;border:1px solid var(--line);border-radius:10px;padding:12px}
.consent input{margin-top:3px;width:18px;height:18px;flex:0 0 18px}
.legal{font-size:12.5px;color:var(--muted);margin:6px 0 0}
.legal a{color:var(--primary)}
button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:10px;background:var(--primary);color:#fff;font:inherit;font-weight:700;cursor:pointer}
button:disabled{opacity:.6;cursor:default}
.msg{margin-top:14px;font-size:14px}
.msg.err{color:var(--red)}.msg.ok{color:var(--green)}
</style>
</head>
<body>
@include('partials.config-script')
<main>
<div class="card">
  <h1>Book an appointment{{ $business ? ' with ' . $business : '' }}</h1>
  <p class="sub">Tell us when you would like to come in and we will confirm your appointment.</p>
  <form id="bookForm" novalidate>
    <label class="field" for="bkName">Your name</label>
    <input id="bkName" type="text" autocomplete="name" required />
    <label class="field" for="bkEmail">Email</label>
    <input id="bkEmail" type="email" autocomplete="email" required />
    <label class="field" for="bkPhone">Mobile phone</label>
    <input id="bkPhone" type="tel" autocomplete="tel" placeholder="(555) 123-4567" required />
    <label class="field" for="bkWhen">Preferred date and time</label>
    <input id="bkWhen" type="datetime-local" required />

    {{-- Unchecked by default. Rendered here, in the HTML, so the checkbox and
         its exact wording are readable without running any script. --}}
    <label class="consent" for="bkSmsConsent">
      <input id="bkSmsConsent" type="checkbox" name="sms_consent" value="1" />
      <span id="bkSmsConsentText">I agree to receive appointment confirmation and reminder text messages from EdgifyNow on behalf of {{ $business ?: 'the business I am booking with' }} at the phone number I entered above. Message frequency varies by appointment. Msg &amp; data rates may apply. Reply HELP for help or STOP to opt out. Consent is not a condition of booking.</span>
    </label>
    <p class="legal">See our <a href="{{ url('/privacy') }}">Privacy Policy and SMS terms</a>.</p>

    <button id="bkSubmit" type="submit">Request appointment</button>
    <div id="bkMsg" class="msg" role="status"></div>
  </form>
</div>
</main>
<script>
(function(){
  var API = (window.EDGIFY_CONFIG && window.EDGIFY_CONFIG.API_BASE_URL) || "";
  var CLIENT = @json($client);
  var form = document.getElementById("bookForm");
  var msg = document.getElementById("bkMsg");
  var token = null;

  function show(text, cls){ msg.textContent = text; msg.className = "msg " + (cls || ""); }
  function phoneE164(v){
    var d = String(v || "").replace(/\D/g, "");
    if (d.length === 11 && d.charAt(0) === "1") d = d.slice(1);
    return d.length === 10 ? "+1" + d : null;
  }
  function call(path, opts){
    opts = opts || {};
    return fetch(API + path, {
      method: opts.method || "GET",
      headers: { "Content-Type": "application/json", "X-API-Key": token || "" },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function(res){
      return res.text().then(function(t){
        var data = null; try { data = t ? JSON.parse(t) : null; } catch(e){}
        if (!res.ok) throw new Error((data && typeof data.detail === "string" && data.detail) || "Please check your details and try again.");
        return data;
      });
    });
  }
  function bootstrap(){
    if (!CLIENT) return Promise.reject(new Error("This booking page needs a business link."));
    return fetch(API + "/api/v1/public/widget/bootstrap/" + encodeURIComponent(CLIENT)).then(function(r){
      if (!r.ok) throw new Error("This booking link is not valid.");
      return r.json();
    }).then(function(d){ token = d.session_token; });
  }

  form.addEventListener("submit", function(e){
    e.preventDefault();
    var name = document.getElementById("bkName").value.trim();
    var email = document.getElementById("bkEmail").value.trim();
    var phone = phoneE164(document.getElementById("bkPhone").value);
    var when = document.getElementById("bkWhen").value;
    if (!name) return show("Please enter your name.", "err");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return show("Please enter a valid email address.", "err");
    if (!phone) return show("Please enter a valid US phone number, e.g. (555) 123-4567.", "err");
    if (!when || new Date(when).getTime() <= Date.now()) return show("Please choose a date and time in the future.", "err");

    var parts = name.split(" ");
    var first = parts.shift() || "";
    var start = new Date(when);
    var btn = document.getElementById("bkSubmit");
    btn.disabled = true; btn.textContent = "Sending...";
    bootstrap().then(function(){
      return call("/api/v1/public/appointments", { method: "POST", body: {
        first_name: first, last_name: parts.join(" ") || null, email: email, phone: phone,
        start_at: start.toISOString(), end_at: new Date(start.getTime() + 30 * 60000).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        // What the customer ticked and the exact label they saw.
        sms_consent: document.getElementById("bkSmsConsent").checked,
        sms_consent_wording: document.getElementById("bkSmsConsentText").textContent.replace(/\s+/g, " ").trim()
      }});
    }).then(function(){
      show("Thank you, your appointment request was sent.", "ok");
      form.reset();
    }).catch(function(err){ show(err.message, "err"); })
      .then(function(){ btn.disabled = false; btn.textContent = "Request appointment"; });
  });
})();
</script>
</body>
</html>
