<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('portal');
})->name('portal');

Route::get('/portal', function () {
    return view('portal');
})->name('portal.alias');
