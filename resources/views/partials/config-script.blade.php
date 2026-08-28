{{-- Single injection point for environment config. Every page that needs to
     call the API includes this partial instead of hardcoding a URL. --}}
{{-- JSON_UNESCAPED_SLASHES so URLs read normally in view-source instead of
     as https:\/\/... -- @json() doesn't accept flags, so this is spelled
     out rather than using that shorthand. --}}
<script>
window.EDGIFY_CONFIG = {!! json_encode([
    'ENVIRONMENT_NAME' => config('services.edgifynow.environment_name'),
    'API_BASE_URL' => config('services.edgifynow.api_base_url'),
    'APP_BASE_URL' => config('services.edgifynow.app_base_url'),
    'WIDGET_BASE_URL' => config('services.edgifynow.widget_base_url'),
], JSON_UNESCAPED_SLASHES) !!};
</script>
@if(!$envCheck['ok'])
<div style="position:fixed;top:0;left:0;right:0;z-index:99999;background:#c24141;color:#fff;padding:10px 16px;font:600 13px system-ui,sans-serif;text-align:center;">
  &#9888; {{ $envCheck['message'] }}
</div>
@endif
@if(\App\Support\EnvironmentGuard::isStaging())
<div style="position:fixed;top:0;right:0;z-index:99998;background:#b7791f;color:#fff;padding:4px 10px;font:700 11px system-ui,sans-serif;letter-spacing:.05em;border-bottom-left-radius:8px;">
  STAGING
</div>
@endif
