<?php

namespace App\Support;

/**
 * Guards against staging/production configuration drift.
 *
 * The rule set is intentionally simple and explicit:
 *  - a "staging" environment must talk to the staging API (api-dev.edgifynow.com)
 *  - a "production" environment must talk to the production API (api.edgifynow.com)
 *  - a production environment pointed at the staging API is a hard failure,
 *    not a warning, because it risks writing real customer data into staging
 *    or vice versa.
 */
class EnvironmentGuard
{
    /**
     * @return array{ok: bool, message: ?string}
     */
    public static function check(): array
    {
        $environmentName = config('services.edgifynow.environment_name');
        $apiBaseUrl = config('services.edgifynow.api_base_url');

        $apiIsStaging = str_contains($apiBaseUrl, 'api-dev.');
        $apiIsProduction = str_contains($apiBaseUrl, 'api.edgifynow.com') && ! $apiIsStaging;

        if ($environmentName === 'production' && $apiIsStaging) {
            throw new \RuntimeException(
                "Configuration error: ENVIRONMENT_NAME=production but API_BASE_URL ({$apiBaseUrl}) points at the staging API. Refusing to run with this configuration."
            );
        }

        if ($environmentName === 'staging' && $apiIsProduction) {
            return [
                'ok' => false,
                'message' => "Configuration error: ENVIRONMENT_NAME=staging but API_BASE_URL ({$apiBaseUrl}) points at the production API. This must be fixed before continuing.",
            ];
        }

        return ['ok' => true, 'message' => null];
    }

    public static function isStaging(): bool
    {
        return config('services.edgifynow.environment_name') === 'staging';
    }
}
