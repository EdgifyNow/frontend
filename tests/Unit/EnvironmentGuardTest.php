<?php

namespace Tests\Unit;

use App\Support\EnvironmentGuard;
use Tests\TestCase;

class EnvironmentGuardTest extends TestCase
{
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

    public function test_is_staging_reflects_environment_name(): void
    {
        config(['services.edgifynow.environment_name' => 'staging']);
        $this->assertTrue(EnvironmentGuard::isStaging());

        config(['services.edgifynow.environment_name' => 'production']);
        $this->assertFalse(EnvironmentGuard::isStaging());
    }
}
