#!/bin/bash
set -euo pipefail

echo "🔧 Setting up RDP (xrdp) Environment..."

EXAM_VM_USERNAME="${EXAM_VM_USERNAME:-student}"
EXAM_VM_PASSWORD="${EXAM_VM_PASSWORD:-123456}"
EXAM_BROWSER_URL="${EXAM_BROWSER_URL:-https://sot.umtoj.edu.vn}"
EXAM_BROWSER_AUTOSTART="${EXAM_BROWSER_AUTOSTART:-true}"
EXAM_BROWSER_PREWARM="${EXAM_BROWSER_PREWARM:-true}"
echo "${EXAM_VM_USERNAME}:${EXAM_VM_PASSWORD}" | chpasswd

cat >/etc/default/exam-browser <<EOF
EXAM_BROWSER_URL=${EXAM_BROWSER_URL}
EXAM_BROWSER_AUTOSTART=${EXAM_BROWSER_AUTOSTART}
EXAM_BROWSER_PREWARM=${EXAM_BROWSER_PREWARM}
EOF

mkdir -p /var/run/xrdp
chown xrdp:xrdp /var/run/xrdp
rm -rf /var/run/xrdp/xrdp.pid /var/run/xrdp/xrdp-sesman.pid /var/run/xrdp/xrdp_chansrv_audio_out_socket
rm -rf /tmp/.X11-unix /tmp/.X*-lock
mkdir -p /tmp/.X11-unix
chmod 1777 /tmp/.X11-unix

/etc/init.d/dbus start || true

apply_exam_firewall() {
    local restrict_raw="${EXAM_RESTRICT_INTERNET:-true}"
    restrict_raw="$(echo "${restrict_raw}" | tr '[:upper:]' '[:lower:]')"
    if [[ "${restrict_raw}" == "0" || "${restrict_raw}" == "false" || "${restrict_raw}" == "no" ]]; then
        echo "🌐 EXAM_RESTRICT_INTERNET=false -> skip firewall lockdown"
        return 0
    fi

    if ! command -v iptables >/dev/null 2>&1; then
        echo "❌ iptables not found in exam VM image."
        return 1
    fi

    local allowed_domains_csv="${EXAM_ALLOWED_DOMAINS:-sot.umtoj.edu.vn}"
    local allowed_cidrs_csv="${EXAM_ALLOWED_CIDRS:-}"
    local allowed_ips_csv="${EXAM_ALLOWED_IPS:-}"
    local origin_ip="${EXAM_ORIGIN_IP:-203.210.213.198}"

    declare -a allowed_cidrs=()
    declare -a allowed_ips=()

    if [[ -n "${allowed_cidrs_csv}" ]]; then
        while IFS=',' read -ra parts; do
            for item in "${parts[@]}"; do
                item="$(echo "${item}" | xargs)"
                [[ -z "${item}" ]] || allowed_cidrs+=("${item}")
            done
        done <<< "${allowed_cidrs_csv}"
    fi

    if [[ -n "${allowed_ips_csv}" ]]; then
        while IFS=',' read -ra parts; do
            for item in "${parts[@]}"; do
                item="$(echo "${item}" | xargs)"
                [[ -z "${item}" ]] || allowed_ips+=("${item}")
            done
        done <<< "${allowed_ips_csv}"
    fi

    if [[ -n "${origin_ip}" ]]; then
        allowed_ips+=("${origin_ip}")
    fi

    # Resolve domain(s) to IPv4 and append as /32 allows.
    while IFS=',' read -ra domains; do
        for domain in "${domains[@]}"; do
            domain="$(echo "${domain}" | xargs)"
            [[ -z "${domain}" ]] && continue
            mapfile -t resolved_ips < <(getent ahostsv4 "${domain}" | awk '{print $1}' | sort -u || true)
            if [[ "${#resolved_ips[@]}" -eq 0 ]]; then
                echo "⚠️ Cannot resolve domain: ${domain}"
                continue
            fi
            for ip in "${resolved_ips[@]}"; do
                allowed_ips+=("${ip}")
            done
        done
    done <<< "${allowed_domains_csv}"

    if [[ "${#allowed_cidrs[@]}" -eq 0 && "${#allowed_ips[@]}" -eq 0 ]]; then
        echo "❌ No allowlist targets from EXAM_ALLOWED_*"
        return 1
    fi

    echo "🔒 Applying outbound firewall policy for exam VM..."
    iptables -F OUTPUT
    iptables -P OUTPUT DROP
    iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -A OUTPUT -o lo -j ACCEPT

    # Allow DNS to configured resolvers.
    while read -r ns; do
        [[ -z "${ns}" ]] && continue
        iptables -A OUTPUT -p udp -d "${ns}" --dport 53 -j ACCEPT
        iptables -A OUTPUT -p tcp -d "${ns}" --dport 53 -j ACCEPT
    done < <(awk '/^nameserver/{print $2}' /etc/resolv.conf | sort -u)

    # Allow https/http to WAF/CD CIDRs.
    for cidr in "${allowed_cidrs[@]}"; do
        iptables -A OUTPUT -p tcp -d "${cidr}" -m multiport --dports 80,443 -j ACCEPT
    done

    # Allow https/http to exact IPs (resolved domains + origin IPs).
    for ip in "${allowed_ips[@]}"; do
        iptables -A OUTPUT -p tcp -d "${ip}" -m multiport --dports 80,443 -j ACCEPT
    done

    echo "✅ Firewall policy applied. Allowed domains=${allowed_domains_csv}"
    echo "✅ Allowed CIDRs=${allowed_cidrs_csv}"
    echo "✅ Allowed IPs=${allowed_ips_csv}, origin=${origin_ip}"
    iptables -S OUTPUT || true

    return 0
}

if ! apply_exam_firewall; then
    strict_raw="${EXAM_FIREWALL_ENFORCE_STRICT:-true}"
    strict_raw="$(echo "${strict_raw}" | tr '[:upper:]' '[:lower:]')"
    if [[ "${strict_raw}" == "0" || "${strict_raw}" == "false" || "${strict_raw}" == "no" ]]; then
        echo "⚠️ Firewall setup failed but EXAM_FIREWALL_ENFORCE_STRICT=false, continue."
    else
        echo "❌ Firewall setup failed and strict mode enabled. Stop container."
        exit 1
    fi
fi

warm_exam_portal() {
    local prewarm_raw="${EXAM_BROWSER_PREWARM:-true}"
    prewarm_raw="$(echo "${prewarm_raw}" | tr '[:upper:]' '[:lower:]')"
    if [[ "${prewarm_raw}" == "0" || "${prewarm_raw}" == "false" || "${prewarm_raw}" == "no" ]]; then
        return 0
    fi

    local target_url="${EXAM_BROWSER_URL:-https://sot.umtoj.edu.vn}"
    echo "⚡ Pre-warming exam portal: ${target_url}"
    getent ahostsv4 sot.umtoj.edu.vn >/dev/null 2>&1 || true
    curl -k -I --connect-timeout 3 --max-time 8 "${target_url}" >/dev/null 2>&1 || true
}

warm_exam_portal

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
