FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# 1. Cài đặt XFCE4, xrdp và các tiện ích
RUN apt-get update && apt-get install -y \
    xfce4 xfce4-goodies \
    xrdp dbus-x11 xfonts-base \
    net-tools curl wget git nano sudo \
    software-properties-common \
    build-essential gdb \
    python3 python3-pip \
    default-jdk default-jre \
    libgbm-dev libnss3 libasound2 \
    fonts-liberation libu2f-udev xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# 2. Cài Code::Blocks
RUN add-apt-repository universe && apt-get update && \
    apt-get install -y codeblocks codeblocks-contrib && \
    rm -rf /var/lib/apt/lists/*

# 3. Cài Google Chrome
RUN wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && \
    apt-get update && \
    apt-get install -y ./google-chrome-stable_current_amd64.deb || apt-get install -f -y && \
    rm google-chrome-stable_current_amd64.deb && \
    rm -rf /var/lib/apt/lists/*

# 4. Cài VS Code
RUN wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > packages.microsoft.gpg && \
    install -D -o root -g root -m 644 packages.microsoft.gpg /etc/apt/keyrings/packages.microsoft.gpg && \
    echo "deb [arch=amd64,arm64,armhf signed-by=/etc/apt/keyrings/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main" > /etc/apt/sources.list.d/vscode.list && \
    rm -f packages.microsoft.gpg && \
    apt-get update && apt-get install -y code && \
    rm -rf /var/lib/apt/lists/*

# 5. Tạo User 'student' (Mật khẩu: 123456)
RUN useradd -m -s /bin/bash student && \
    echo "student:123456" | chpasswd && \
    adduser student sudo

# 6. Cấu hình xrdp
# Cho phép user student kết nối xrdp
RUN adduser xrdp ssl-cert
# Cấu hình để xrdp khởi động XFCE4
RUN echo "xfce4-session" > /home/student/.xsession && \
    chown student:student /home/student/.xsession

# 7. Setup Desktop Shortcut (Bỏ qua cho ngắn gọn, bạn có thể copy lại phần cũ)
# ...

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Chạy entrypoint dưới quyền root để start xrdp service
CMD ["/entrypoint.sh"]