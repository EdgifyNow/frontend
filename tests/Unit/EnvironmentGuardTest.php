<?php

namespace Tests\Unit;

use App\Support\EnvironmentGuard;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class EnvironmentGuardTest extends TestCase
{
    protected function tearDown(): void
    {
        // asset()'s root is bound once at app boot from config('app.asset_url')
        // and cached on the UrlGenerator instance -- config(['app.asset_url'
        // => ...]) alone wouldn't affect an already-booted instance, so these
        // tests call useAssetOrigin() directly to simulate it. Reset it here
        // so it doesn't leak into other tests sharing the same app instance.
        URL::useAssetOrigin(null);

        parent::tearDown();
    }

    public function test_staging_pointed_at_staging_api_is_ok(): void
    {
        config(['services.edgifynow.environment_name' => 'staging']);
        config(['services.edgifynow.api_base_url' => 'https://api-dev.edgifynow.com']);

        $result = EnvironmentGuard::check();

        $this->assertTrue($result['ok']);
        $this->assertNull($result['message']);
    }

    public function test_production_pointed_at_production_api_is_ok(): void
    {
        config(['services.edgifynow.environment_name' => 'production']);
        config(['services.edgifynow.api_base_url' => 'https://api.edgifynow.com']);

        $result = EnvironmentGuard::check();

        $this->assertTrue($result['ok']);
    }

    public function test_staging_pointed_at_production_api_returns_a_visible_error(): void
    {
        config(['services.edgifynow.environment_name' => 'staging']);
        config(['services.edgifynow.api_base_url' => 'https://api.edgifynow.com']);

        $result = EnvironmentGuard::check();

        $this->assertFalse($result['ok']);
        $this->assertNotNull($result['message']);
    }

    public function test_production_pointed_at_staging_api_throws(): void
    {
        config(['services.edgifynow.environment_name' => 'production']);
        config(['services.edgifynow.api_base_url' => 'https://api-dev.edgifynow.com']);

        $this->expectException(\RuntimeException::class);

        EnvironmentGuard::check();
    }

    public function test_https_app_base_url_with_https_asset_url_is_ok(): void
    {
        config(['services.edgifynow.environment_name' => 'staging']);
        config(['services.edgifynow.api_base_url' => 'https://api-dev.edgifynow.com']);
        config(['services.edgifynow.app_base_url' => 'https://app-dev.edgifynow.com']);
        URL::useAssetOrigin('https://app-dev.edgifynow.com');

        $result = EnvironmentGuard::check();

        $this->assertTrue($result['ok']);
    }

    public function test_https_app_base_url_with_http_asset_url_is_flagged(): void
    {
        // Reproduces the exact bug: APP_BASE_URL says https, but the actual
        // asset() output is still http -- this must be visible, not silent.
        config(['services.edgifynow.environment_name' => 'staging']);
        config(['services.edgifynow.api_base_url' => 'https://api-dev.edgifynow.com']);
        config(['services.edgifynow.app_base_url' => 'https://app-dev.edgifynow.com']);
        URL::useAssetOrigin('http://app-dev.edgifynow.com');

        $result = EnvironmentGuard::check();

        $this->assertFalse($result['ok']);
        $this->assertStringContainsString('asset', $result['message']);
    }

    public function test_http_app_base_url_is_never_flagged_for_asset_scheme(): void
    {
        // Local dev (APP_BASE_URL=http://localhost) has no https expectation
        // to violate in the first place.
        config(['services.edgifynow.environment_name' => 'staging']);
        config(['services.edgifynow.api_base_url' => 'https://api-dev.edgifynow.com']);
        config(['services.edgifynow.app_base_url' => 'http://localhost']);
        URL::useAssetOrigin('http://localhost');

        $result = EnvironmentGuard::check();

        $this->assertTrue($result['ok']);
    }

    public function test_is_staging_reflects_environment_name(): void
    {
        config(['services.edgifynow.environment_name' => 'staging']);
        $this->assertTrue(EnvironmentGuard::isStaging());

        config(['services.edgifynow.environment_name' => 'production']);
        $this->assertFalse(EnvironmentGuard::isStaging());
    }
}
