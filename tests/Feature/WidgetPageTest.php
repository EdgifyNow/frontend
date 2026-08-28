<?php

namespace Tests\Feature;

use Tests\TestCase;

class WidgetPageTest extends TestCase
{
    public function test_widget_route_renders_with_a_key(): void
    {
        $response = $this->get('/widget?key=test_widget_key_123');

        $response->assertStatus(200);
        $response->assertSee('id="wgRoot"', false);
    }

    public function test_widget_route_renders_even_without_a_key(): void
    {
        // The page must still load (and let the client-side JS show a clear
        // "no key" message) rather than the server erroring out -- a client
        // could easily embed the iframe before the key param is wired up.
        $response = $this->get('/widget');

        $response->assertStatus(200);
        $response->assertSee('id="wgRoot"', false);
    }

    public function test_widget_page_is_not_indexable(): void
    {
        $response = $this->get('/widget?key=test_widget_key_123');

        $response->assertSee('name="robots" content="noindex, nofollow"', false);
    }

    public function test_widget_page_never_echoes_the_key_server_side(): void
    {
        // The key is read client-side from location.search inside widget.js.
        // The server-rendered HTML must not contain it anywhere -- if it
        // did, it would show up in any server-side response cache, proxy
        // log, or "view source", which is a different and worse exposure
        // than the client-side URL handling this test suite otherwise
        // relies on.
        $key = 'unmistakable_test_key_should_not_appear_in_html';

        $response = $this->get('/widget?key='.$key);

        $response->assertDontSee($key, false);
    }

    public function test_widget_page_exposes_central_config_to_javascript(): void
    {
        $response = $this->get('/widget?key=test_widget_key_123');

        $response->assertSee('window.EDGIFY_CONFIG', false);
        $response->assertSee(config('services.edgifynow.api_base_url'), false);
    }
}
