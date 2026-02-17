#!/bin/bash
mkdir -p /root/.vnc

# 1. Đặt password (Hardcode để khớp với Backend)
echo "123456" | vncpasswd -f > /root/.vnc/passwd
chmod 600 /root/.vnc/passwd

# 2. [FIX] Xóa sạch lock file và PID cũ để tránh lỗi "A VNC server is already running"
rm -rf /tmp/.X1-lock /tmp/.X11-unix/X1 /root/.vnc/*.pid

# 3. Khởi động VNC Server
# USER=root là cần thiết để tránh một số lỗi permission trên Ubuntu mới
USER=root vncserver :1 -geometry 1280x720 -depth 24

# 4. [FIX] Giữ container sống an toàn
# Dùng tail -f /dev/null chắc chắn hơn là tail file log (vì file log có thể chưa kịp tạo ra)
tail -f /dev/null