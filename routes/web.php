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
