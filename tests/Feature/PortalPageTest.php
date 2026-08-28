<?php

namespace Tests\Feature;

use Tests\TestCase;

class PortalPageTest extends TestCase
{
    public function test_root_route_renders_the_portal(): void
    {
        $response = $this->get('/');

        $response->assertStatus(200);
        $response->assertSee('EdgifyNow', false);
        $response->assertSee('id="egApp"', false);
    }

    public function test_portal_alias_route_renders_the_same_page(): void
    {
        $response = $this->get('/portal');

        $response->assertStatus(200);
        $response->assertSee('id="egApp"', false);
    }

    public function test_portal_page_is_not_indexable(): void
    {
        $response = $this->get('/');

        $response->assertSee('name="robots" content="noindex, nofollow"', false);
    }

    public function test_portal_page_exposes_central_config_to_javascript(): void
    {
        $response = $this->get('/');

        $response->assertSee('window.EDGIFY_CONFIG', false);
        $response->assertSee(config('services.edgifynow.api_base_url'), false);
    }

    public function test_health_check_route_reports_up(): void
    {
        $response = $this->get('/up');

        $response->assertStatus(200);
    }

    // Note: public/robots.txt is a static file served directly by the web
    // server (Apache/Nginx), not through Laravel's router -- `php artisan
    // test` dispatches through the router only, so it can't see static
    // public/ assets and a test here would give a false negative. Verified
    // manually instead: GET /robots.txt returns "User-agent: *\nDisallow: /".
}
