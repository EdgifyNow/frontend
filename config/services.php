<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'edgifynow' => [
        // Single source of truth for every URL the frontend needs. Nothing in
        // resources/views or public/js should hardcode api-dev/app-dev/app
        // domains directly -- they all read from this config (which reads
        // from .env), and .env is what changes between staging and production.
        'environment_name' => env('ENVIRONMENT_NAME', 'staging'),
        'api_base_url' => env('API_BASE_URL', 'https://api-dev.edgifynow.com'),
        'app_base_url' => env('APP_BASE_URL', 'http://localhost'),
        'widget_base_url' => env('WIDGET_BASE_URL', 'http://localhost/edgifynow-portal-laravel/public/widget'),

        // Voice and WhatsApp are not part of the V1 production scope (Portal +
        // CRM + Knowledge/Assistant + Website Widget + Appointment/Calendar
        // only). This hides the *enablement controls and dashboards* for them
        // (Client Details toggles, the Assistant "WhatsApp" type option, the
        // Voice/WhatsApp Activity nav items) without deleting any of that
        // code - flip back to true to re-enable for testing. Default true so
        // staging keeps exercising it; production's .env should set this to
        // false.
        'feature_voice_whatsapp' => env('FEATURE_VOICE_WHATSAPP', true),
    ],

];
