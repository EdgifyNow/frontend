# EdgifyNow frontend (Laravel) - portal + public widget.
#
# Build:
#   docker build -t edgifynow-frontend .
#
# Run (staging example - override with real values / a mounted .env):
#   docker run -p 8080:80 \
#     -e APP_KEY=base64:xxxxx \
#     -e ENVIRONMENT_NAME=staging \
#     -e API_BASE_URL=https://api-dev.edgifynow.com \
#     -e APP_BASE_URL=https://app-dev.edgifynow.com \
#     -e WIDGET_BASE_URL=https://app-dev.edgifynow.com/widget \
#     edgifynow-frontend
#
# Health check: GET /up (returns "Application up" with HTTP 200 when healthy)

FROM php:8.3-apache

# Laravel's required/recommended PHP extensions.
RUN apt-get update && apt-get install -y \
        libzip-dev libicu-dev libonig-dev libxml2-dev unzip git \
    && docker-php-ext-install \
        pdo_mysql mysqli bcmath intl zip opcache \
    && a2enmod rewrite \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html
COPY . .

# Point Apache's document root at Laravel's public/ directory, not the
# project root -- this is required, not optional (see README).
ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf \
    && sed -ri -e 's!/var/www/!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

RUN composer install --no-dev --optimize-autoloader --no-interaction \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

EXPOSE 80
