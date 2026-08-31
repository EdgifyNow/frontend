# EdgifyNow Frontend

Standalone Laravel application containing:

- **Admin & Client Portal** (`/` or `/portal`) — JWT-authenticated, role-based (platform admin vs. tenant owner/employee). Login, dashboard, CRM leads/contacts, knowledge base, AI assistant config + test chat, tenant management (admin), Instant Demo tool.
- **Public Website Widget** (`/widget?key=WIDGET_KEY`) — anonymous, embeddable chat widget for any client's website. Uses a tenant-scoped public widget key (`X-API-Key` header), never a login token. Supports live AI chat with conversation continuity, lead capture, and appointment booking.

This app does **not** depend on WordPress in any way: no `wp-load.php`, no WordPress database, no WordPress sessions, no WordPress plugins. It's a plain Laravel 13 / PHP 8.3 app that can be deployed anywhere Laravel runs. WordPress's only involvement is embedding the widget via a plain `<iframe>` pointing at this app's `/widget` URL — see "Embedding the widget" below.

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

Once deployed, give each client this snippet (swap in their tenant's own widget key):

```html
<iframe
  src="https://app-dev.edgifynow.com/widget?key=TENANT_WIDGET_KEY"
  title="Business Assistant"
  width="400"
  height="600"
  style="border:0; position:fixed; right:20px; bottom:20px; z-index:9999;"
  allow="clipboard-write">
</iframe>
```

Replace `app-dev.edgifynow.com` with `app.edgifynow.com` for a production client. **The widget key is the only thing that changes per client/tenant** — the iframe `src` and the rest of the snippet stay identical.

The widget key is read client-side from the URL and sent only as the `X-API-Key` header on requests to `/api/v1/public/*`. This app never renders it into the page and never writes it to `console.log`. It's important to be precise about what that does and doesn't guarantee, though: because it's a query-string value (`?key=...`), it **can** still appear in browser history, the referrer header of outbound requests, and web server access logs on any server it passes through — that's inherent to putting any value in a URL, not something client-side code can prevent. Treat it the same way you'd treat any embeddable-widget public key (Stripe's publishable key, Intercom's app ID, etc.): safe to expose in a browser, tenant-scoped, and rotatable, but not something to also paste into chat, tickets, or commits unnecessarily. No tenant ID, JWT, admin credential, or backend secret is ever present in the browser for this page — that guarantee does hold.

## Testing

```bash
php artisan test
```

16 tests covering: portal/widget pages render, both are `noindex`, both expose `window.EDGIFY_CONFIG`, the widget key is never echoed into server-rendered HTML, `/up` reports healthy, and `EnvironmentGuard`'s four staging/production combinations behave correctly (including that a production instance pointed at the staging API throws rather than silently running).

Not covered yet: actual browser-driven interaction (typing in the chat box, clicking "book appointment", etc.) — there's no JS test runner wired up for that. The PHP tests above cover what the server renders and the environment-safety logic; they don't simulate a user clicking through the widget.

## Deployment

There's no CI/CD pipeline yet — release process today:

1. Everything lands on `frontend-staging-handover` (or its successor) via normal commits.
2. When a batch of changes is ready to actually deploy, tag it — deploy an **exact tag**, never a moving branch:
   ```bash
   git tag -a v0.1.0-rc1 -m "Description of what's in this release"
   git push origin v0.1.0-rc1
   ```
3. On the target server: `git fetch --tags && git checkout v0.1.0-rc1`, then either build the `Dockerfile` or run manually:
   ```bash
   composer install --no-dev --optimize-autoloader
   php artisan config:cache && php artisan route:cache && php artisan view:cache
   ```
4. Confirm `.env` on that target has the correct `ENVIRONMENT_NAME`/`API_BASE_URL`/`APP_BASE_URL`/`WIDGET_BASE_URL` for that environment (staging vs. production — see table above), then verify `GET /up` returns 200 before considering the deploy live.

## Known limitations

- **JWT stored in `localStorage`** (portal only — the widget never handles a JWT at all). Acceptable for staging, but a production deployment should move to a secure `HttpOnly` cookie via a small backend-for-frontend (BFF) endpoint instead, so the token isn't reachable from JS at all (mitigates XSS token theft). Not implemented here — this is a real architectural change, not a config tweak, and is called out rather than silently left for later.
- The `/public/*` API endpoints currently reject cross-origin requests from anywhere except `https://edgifynow.com` (confirmed via live testing from `http://localhost`) — since the whole point of the widget is to be embeddable on *any* client's website, this needs a permissive/wildcard CORS policy on those specific endpoints, not a fixed allowlist. Flagged separately to the backend team; blocks live end-to-end verification of the widget until resolved.
