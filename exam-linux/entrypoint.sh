#!/bin/bash
set -e

echo "🔧 Setting up RDP (xrdp) Environment..."

mkdir -p /var/run/xrdp
chown xrdp:xrdp /var/run/xrdp
rm -rf /var/run/xrdp/xrdp.pid /var/run/xrdp/xrdp-sesman.pid /var/run/xrdp/xrdp_chansrv_audio_out_socket

/etc/init.d/dbus start || true

# =================================================================
# [TRÙM CUỐI] TẠO CHỨNG CHỈ TLS CHO XRDP
# Xử lý dứt điểm lỗi "Server refused connection" do thiếu SSL trong Docker
if [ ! -f /etc/xrdp/cert.pem ]; then
    echo "🔐 Generating TLS Certificate for xrdp..."
    openssl req -x509 -newkey rsa:2048 -nodes -keyout /etc/xrdp/key.pem -out /etc/xrdp/cert.pem -days 365 -subj "/C=US/ST=None/L=None/O=None/OU=None/CN=localhost"
    chmod 600 /etc/xrdp/key.pem
    chown xrdp:xrdp /etc/xrdp/key.pem /etc/xrdp/cert.pem
fi

# Trả xrdp về chuẩn bảo mật mặc định (để nó dùng TLS vừa tạo)
sed -i 's/security_layer=rdp/security_layer=negotiate/g' /etc/xrdp/xrdp.ini
sed -i 's/crypt_level=none/crypt_level=high/g' /etc/xrdp/xrdp.ini
# =================================================================

echo "🚀 Starting xrdp-sesman..."
/usr/sbin/xrdp-sesman
echo "🚀 Starting xrdp..."
/usr/sbin/xrdp

sleep 2
if ! netstat -tuln | grep -q ":3389 "; then
    echo "❌ CRITICAL: xrdp failed to start on port 3389!"
    exit 1
fi
echo "✅ RDP Listening on Port 3389 (TLS Enabled)"

tail -f /dev/null