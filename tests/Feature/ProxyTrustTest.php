<?php

namespace Tests\Feature;

use Tests\TestCase;

class ProxyTrustTest extends TestCase
{
    // Reproduces the staging bug end-to-end: the browser talks HTTPS, but
    // this container only ever sees plain HTTP from its reverse proxy, which
    // forwards the original scheme via X-Forwarded-Proto. Without trusting
    // that header (bootstrap/app.php), asset() generated http:// URLs for
    // portal.js/widget.js even on an https:// page, which blanked the page.
    public function test_asset_urls_are_https_when_proxy_forwards_https(): void
    {
        $response = $this->withHeaders(['X-Forwarded-Proto' => 'https'])->get('/');

        $response->assertStatus(200);
        $response->assertSee('src="https://', false);
        $response->assertDontSee('src="http://', false);
    }

    public function test_asset_urls_stay_http_without_a_forwarded_proto_header(): void
    {
        // No proxy header at all (e.g. local `php artisan serve`) -- should
        // still behave exactly as before, not force https unexpectedly.
        $response = $this->get('/');

        $response->assertStatus(200);
        $response->assertSee('src="http://', false);
    }
}
