# Menggunakan image PHP resmi yang ringan
FROM php:8.2-apache

# Menginstal ekstensi PostgreSQL agar PHP bisa koneksi ke Neon
RUN apt-get update && apt-get install -y libpq-dev \
    && docker-php-ext-install pdo pdo_pgsql

# Menyalin file PHP Anda ke folder web server
COPY index.php /var/www/html/

# Mengatur port agar sesuai dengan aturan Render
EXPOSE 80
