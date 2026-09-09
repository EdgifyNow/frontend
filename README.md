# EdgifyNow Frontend

Standalone Laravel application containing:

- **Admin & Client Portal** (`/` or `/portal`) — JWT-authenticated, role-based (platform admin vs. tenant owner/employee). Login, dashboard, CRM leads/contacts, knowledge base, AI assistant config + test chat, tenant management (admin), Instant Demo tool.
- **Public Website Widget** (`/widget?client=WIDGET_ID`) — anonymous, embeddable chat widget for any client's website. Exchanges the public `WIDGET_ID` for a short-lived session token server-side (`X-API-Key` header), never a login token or permanent secret. Supports live AI chat with conversation continuity, lead capture, and appointment booking.

This app does **not** depend on WordPress in any way: no `wp-load.php`, no WordPress database, no WordPress sessions, no WordPress plugins. It's a plain Laravel 13 / PHP 8.3 app that can be deployed anywhere Laravel runs. WordPress's only involvement is embedding the widget via a small loader script pointing at this app's `/widget` URL — see "Embedding the widget" below.

## Requirements

- PHP `^8.3`
- Composer 2.x
- Extensions: `bcmath`, `ctype`, `curl`, `dom`, `fileinfo`, `filter`, `hash`, `mbstring`, `openssl`, `pcre`, `pdo`, `session`, `tokenizer`, `xml` (all standard with a normal PHP install; see `Dockerfile` for the exact `apt`/`docker-php-ext-install` list)
- Web server: Apache (with `mod_rewrite`) or Nginx + PHP-FPM. Document root **must** be the `public/` directory, not the project root.
- No database is required for the app to function — all data comes from the external EdgifyNow API. Laravel's own session/cache/queue are configured to use the `file`/`sync` drivers precisely so no DB is needed.

## Local setup

```bash
composer install
cp .env.example .env
php artisan key:generate
```

Edit `.env` and set the environment block (see "Environment configuration" below) — for local staging testing, the defaults in `.env.example` already point at `api-dev.edgifynow.com`.

**Option A — XAMPP / Apache** (recommended if you're already running XAMPP):
Place this folder under `htdocs/`, then browse to:
```
http://localhost/<folder-name>/public/
```
The `/public/` segment is required — it's Laravel's actual web root.

**Option B — Laravel's built-in server:**
```bash
php artisan serve --port=8901
```
Then browse to `http://127.0.0.1:8901/`.

**Health check:** `GET /up` — returns HTTP 200 and "Application up" when the app is healthy (this is Laravel's built-in health-check route, not custom code).

## Environment configuration

Everything environment-specific is read from **one place**: `config/services.php` → the `edgifynow` array, which reads from `.env`. Nothing in `resources/views` or `public/js` hardcodes `api-dev`/`app-dev`/`app` domains directly.

| Variable | Staging | Production |
|---|---|---|
| `ENVIRONMENT_NAME` | `staging` | `production` |
| `API_BASE_URL` | `https://api-dev.edgifynow.com` | `https://api.edgifynow.com` |
| `APP_BASE_URL` | `https://app-dev.edgifynow.com` | `https://app.edgifynow.com` |
| `WIDGET_BASE_URL` | `https://app-dev.edgifynow.com/widget` | `https://app.edgifynow.com/widget` |

These are injected into every page (both portal and widget) via `resources/views/partials/config-script.blade.php`, which sets `window.EDGIFY_CONFIG` — the JS in `public/js/portal.js` and `public/js/widget.js` reads from that object, never a hardcoded string.

**Safety check** (`app/Support/EnvironmentGuard.php`, run on every request via `routes/web.php`):
- If `ENVIRONMENT_NAME=production` and `API_BASE_URL` points at `api-dev.*` → the app **throws and refuses to serve the page**. This is deliberate: a production deployment silently talking to staging (or vice versa) is worse than a visible crash.
- If `ENVIRONMENT_NAME=staging` and `API_BASE_URL` points at the production API → a visible red error banner is shown at the top of the page (non-fatal, since local/staging experimentation shouldn't hard-crash, but it must not be silently ignored either).
- If `APP_BASE_URL` is `https://` but generated asset URLs (`asset('js/portal.js')`) come back `http://` → same visible red banner. This is the exact bug that blanked the page on first staging deploy (see "HTTPS / reverse proxy" below) — now caught instead of silently breaking `<script src>`.
- Whenever `ENVIRONMENT_NAME=staging`, a small **STAGING** badge is shown in the top-right corner of every page, so it's never mistaken for production at a glance.

### HTTPS / reverse proxy

This app is always deployed behind a TLS-terminating reverse proxy (see `Dockerfile`: the container itself listens on plain HTTP). `bootstrap/app.php` configures `TrustProxies` to trust the `X-Forwarded-Proto` header from that proxy, so `asset()`/`url()`/`route()` correctly generate `https://` links without any extra configuration.

- `TRUSTED_PROXIES` (default `*`) — trusts the immediate connecting peer, which in this container topology is always the proxy/load balancer. Restrict it to a comma-separated IP/CIDR list once that proxy's address is fixed.
- `ASSET_URL` (optional, unset by default) — an explicit override for generated asset URLs, only needed if a specific deployment can't rely on proxy headers at all. Never hardcode a domain here or anywhere else in the codebase.

## Embedding the widget

Each client generates their own install code from the Client portal's **Integrations** page (self-serve — no admin action needed): pick a Widget ID (defaults from their business name), click Generate, then Copy Install Code. That page builds exactly this:

```html
<script>
(function(){
  var WIDGET_URL = "https://app.edgifynow.com/widget?client=WIDGET_ID";
  var BUBBLE = "70px", PANEL_W = "400px", PANEL_H = "600px";
  var f = document.createElement("iframe");
  f.src = WIDGET_URL;
  f.title = "Business Assistant";
  f.allow = "clipboard-write";
  f.style.cssText = "border:0!important;position:fixed!important;right:20px!important;bottom:20px!important;" +
    "width:" + BUBBLE + "!important;height:" + BUBBLE + "!important;" +
    "max-width:calc(100vw - 40px)!important;max-height:calc(100vh - 40px)!important;" +
    "z-index:2147483647!important;background:transparent!important;border-radius:16px!important;" +
    "transition:width .15s ease,height .15s ease;";
  document.body.appendChild(f);
  window.addEventListener("message", function(e){
    if (!e.data || e.data.source !== "edgifynow-widget") return;
    f.style.width = e.data.open ? PANEL_W : BUBBLE;
    f.style.height = e.data.open ? PANEL_H : BUBBLE;
  });
})();
</script>
```

This is a small loader script, not a plain static `<iframe>` tag, and that's deliberate: an iframe intercepts clicks over its *entire box* no matter what's drawn inside it, so a statically-sized 400x600 iframe would block clicks to the host page underneath it (menus, buttons, etc.) even while the widget shows nothing but its small collapsed bubble. The script starts the iframe at bubble size and listens for a `postMessage` the widget sends on every open/close (see `notifyHostSize()` in `public/js/widget.js`), resizing the real iframe element only while the panel is actually open. **A plain static `<iframe>` tag still works and shows the widget correctly, but keeps this click-blocking problem** — always use the script snippet above for a real embed.

### How `?client=WIDGET_ID` works (no permanent secret in the URL)

`WIDGET_ID` is a public, non-secret, client-chosen identifier — never the permanent API key itself. On load, `public/js/widget.js` exchanges it for a short-lived session token:

1. `GET /api/v1/public/widget/bootstrap/{widget_id}` (unauthenticated — that's what hands out the token) → `{ session_token, expires_in }`
2. Every subsequent call (`/api/v1/public/branding`, `/chat`, `/leads`, `/appointments`) sends `session_token` as `X-API-Key`
3. If a call ever gets a `401` (token expired mid-visit), the widget silently re-bootstraps once and retries — no visible interruption

The permanent key behind a `WIDGET_ID` is generated and revoked server-side (`POST`/`GET`/`DELETE /api/v1/integrations/widget-key`, called from the Integrations page) and is **never returned to the browser on any call, ever**. Only one widget is active per tenant at a time — generating a new one immediately revokes the previous one.

**Legacy fallback:** `?key=PERMANENT_KEY` (the original flow, where the real key sat directly in the URL) still works for any embed generated before this changed, but new embeds always use `?client=`. Its *scope* is the same either way — tenant-scoped to `/api/v1/public/*` only, same as a `WIDGET_ID`-derived session token, can't touch CRM/admin/other-tenant data — the difference is that a permanent key doesn't expire or rotate on its own, so it sits in that URL indefinitely instead of for a few minutes at a time. No tenant ID, JWT, admin credential, or other backend secret is ever present in the browser for this page — that guarantee holds regardless of which flow is used.

## Testing

```bash
php artisan test
```

21 tests covering: portal/widget pages render, both are `noindex`, both expose `window.EDGIFY_CONFIG`, the widget key is never echoed into server-rendered HTML, `/up` reports healthy, `EnvironmentGuard`'s staging/production combinations (including that a production instance pointed at the staging API throws rather than silently running) and its asset-URL-scheme checks.

Not covered yet: actual browser-driven interaction (typing in the chat box, clicking "book appointment", etc.) — there's no JS test runner wired up for that. The PHP tests above cover what the server renders and the environment-safety logic; they don't simulate a user clicking through the widget.

## Deployment

There's no CI/CD pipeline yet — release process today:

1. Everything lands on `main` via normal commits (staging deploys pull from here directly).
2. When a batch of changes is ready to actually deploy, tag it — deploy an **exact tag**, never a moving branch:
   ```bash
   git tag -a v0.11.0-rc1 -m "Description of what's in this release"
   git push origin v0.11.0-rc1
   ```
3. On the target server: `git fetch --tags && git checkout v0.11.0-rc1`, then either build the `Dockerfile` or run manually:
   ```bash
   composer install --no-dev --optimize-autoloader
   php artisan config:cache && php artisan route:cache && php artisan view:cache
   ```
4. Confirm `.env` on that target has the correct `ENVIRONMENT_NAME`/`API_BASE_URL`/`APP_BASE_URL`/`WIDGET_BASE_URL` for that environment (staging vs. production — see table above), then verify `GET /up` returns 200 before considering the deploy live.

## Known limitations

- **JWT stored in `localStorage`** (portal only — the widget never handles a JWT at all). Acceptable for staging, but a production deployment should move to a secure `HttpOnly` cookie via a small backend-for-frontend (BFF) endpoint instead, so the token isn't reachable from JS at all (mitigates XSS token theft). Not implemented here — this is a real architectural change, not a config tweak, and is called out rather than silently left for later.
- **CORS status needs re-verifying.** Earlier testing found `/public/*` only allowed `https://edgifynow.com` (a fixed allowlist, not workable for embedding on arbitrary client sites) — but the bootstrap endpoint's own API docs now describe per-tenant `allowed_origins` as *opt-in* ("a tenant with no allowed_origins configured is unrestricted"), which reads like the backend has since moved to permissive-by-default. Not independently confirmed live from a real third-party origin — do that before relying on it for production embeds.
