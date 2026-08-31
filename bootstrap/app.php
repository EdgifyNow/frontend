<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // This app is always deployed behind a TLS-terminating reverse proxy
        // (see Dockerfile: container listens on plain HTTP:80, TLS ends
        // upstream) and never receives a request directly from the browser.
        // Without this, Symfony's Request doesn't trust the X-Forwarded-Proto
        // header from that proxy, so isSecure() reads false and every
        // generated URL (asset(), url(), route()) comes back http:// even
        // though the browser is on https:// -- this is what broke portal.js's
        // <script src> and produced a blank page on staging.
        //
        // TRUSTED_PROXIES defaults to '*' (trust the immediate peer, which in
        // this container topology is always the proxy/load balancer, not an
        // arbitrary client) -- set it to a comma-separated IP/CIDR list in
        // .env to restrict this once the proxy's address is fixed. '*' is
        // Symfony's own literal wildcard value; it must stay a plain string
        // rather than becoming a single-element array, or TrustProxies stops
        // recognizing it and treats "*" as an (invalid) IP to match instead.
        $trustedProxies = trim((string) env('TRUSTED_PROXIES', '*'));
        $middleware->trustProxies(
            at: $trustedProxies === '' || $trustedProxies === '*'
                ? '*'
                : array_filter(array_map('trim', explode(',', $trustedProxies))),
            headers: Request::HEADER_X_FORWARDED_FOR
                | Request::HEADER_X_FORWARDED_HOST
                | Request::HEADER_X_FORWARDED_PORT
                | Request::HEADER_X_FORWARDED_PROTO,
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
