<?php

use App\Support\EnvironmentGuard;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('portal', ['envCheck' => EnvironmentGuard::check()]);
})->name('portal');

Route::get('/portal', function () {
    return view('portal', ['envCheck' => EnvironmentGuard::check()]);
})->name('portal.alias');

Route::get('/widget', function () {
    return view('widget', ['envCheck' => EnvironmentGuard::check()]);
})->name('widget');

// Public, no-login booking page. The appointment-text consent checkbox and
// its wording are rendered in the page HTML itself (not by JavaScript inside
// the chat widget), so anyone, including Twilio's campaign reviewer, can open
// this URL and read exactly what a customer is asked to agree to.
Route::get('/book', function (\Illuminate\Http\Request $request) {
    $client = trim((string) $request->query('client', ''));
    $business = null;
    $api = rtrim((string) config('services.edgifynow.api_base_url'), '/');
    if ($client !== '' && $api !== '') {
        try {
            $boot = \Illuminate\Support\Facades\Http::timeout(5)->get($api . '/api/v1/public/widget/bootstrap/' . rawurlencode($client));
            if ($boot->ok()) {
                $brand = \Illuminate\Support\Facades\Http::timeout(5)
                    ->withHeaders(['X-API-Key' => $boot->json('session_token')])
                    ->get($api . '/api/v1/public/branding');
                if ($brand->ok()) {
                    $business = $brand->json('name');
                }
            }
        } catch (\Throwable $e) {
            // Falls back to the generic wording in the view.
        }
    }
    return view('book', ['envCheck' => EnvironmentGuard::check(), 'client' => $client, 'business' => $business]);
})->name('book');

Route::get('/privacy', function () {
    return view('privacy');
})->name('privacy');
