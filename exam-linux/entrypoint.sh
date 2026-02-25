#!/bin/bash
set -euo pipefail

echo "🔧 Setting up RDP (xrdp) Environment..."

EXAM_VM_USERNAME="${EXAM_VM_USERNAME:-student}"
EXAM_VM_PASSWORD="${EXAM_VM_PASSWORD:-123456}"
echo "${EXAM_VM_USERNAME}:${EXAM_VM_PASSWORD}" | chpasswd

mkdir -p /var/run/xrdp
chown xrdp:xrdp /var/run/xrdp
rm -rf /var/run/xrdp/xrdp.pid /var/run/xrdp/xrdp-sesman.pid /var/run/xrdp/xrdp_chansrv_audio_out_socket
rm -rf /tmp/.X11-unix /tmp/.X*-lock
mkdir -p /tmp/.X11-unix
chmod 1777 /tmp/.X11-unix

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
sed -i 's/^max_bpp=.*/max_bpp=24/g' /etc/xrdp/xrdp.ini
sed -i 's/^xserverbpp=.*/xserverbpp=24/g' /etc/xrdp/sesman.ini

# Tự động đăng nhập vào session Xorg, bỏ màn hình login xrdp cho thí sinh
safe_user="$(printf '%s' "${EXAM_VM_USERNAME}" | sed 's/[\/&]/\\&/g')"
safe_pass="$(printf '%s' "${EXAM_VM_PASSWORD}" | sed 's/[\/&]/\\&/g')"
sed -i 's/^autorun=.*/autorun=Xorg/g' /etc/xrdp/xrdp.ini
sed -i "/^\[Xorg\]/,/^\[/ s/^username=.*/username=${safe_user}/" /etc/xrdp/xrdp.ini
sed -i "/^\[Xorg\]/,/^\[/ s/^password=.*/password=${safe_pass}/" /etc/xrdp/xrdp.ini
# =================================================================

echo "🚀 Starting XRDP services..."
if [ -x /etc/init.d/xrdp ]; then
    /etc/init.d/xrdp start || true
else
    /usr/sbin/xrdp-sesman || true
    /usr/sbin/xrdp || true
fi

# XRDP trong container có thể mất vài giây để bind port.
echo "⏳ Waiting for xrdp to listen on port 3389..."
for i in $(seq 1 30); do
    if netstat -tuln | grep -qE "[:.]3389[[:space:]]"; then
        echo "✅ RDP Listening on Port 3389 (TLS Enabled)"
        break
    fi
    sleep 1
done

if ! netstat -tuln | grep -qE "[:.]3389[[:space:]]"; then
    echo "❌ CRITICAL: xrdp failed to start on port 3389 after 30s!"
    echo "--- xrdp.log ---"
    cat /var/log/xrdp.log 2>/dev/null || true
    echo "--- xrdp-sesman.log ---"
    cat /var/log/xrdp-sesman.log 2>/dev/null || true
    echo "--- process list ---"
    ps aux | grep -E "xrdp|sesman" || true
    exit 1
fi

tail -f /dev/null
