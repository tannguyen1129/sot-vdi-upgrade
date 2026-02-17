FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive

# 1. Cài giao diện XFCE & VNC
RUN apt-get update && apt-get install -y \
    xfce4 xfce4-goodies tightvncserver \
    net-tools curl git wget gnupg build-essential gdb \
    && apt-get clean

# 2. Cài VS Code
RUN wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > packages.microsoft.gpg && \
    install -D -o root -g root -m 644 packages.microsoft.gpg /etc/apt/keyrings/packages.microsoft.gpg && \
    sh -c 'echo "deb [arch=amd64,arm64,armhf signed-by=/etc/apt/keyrings/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main" > /etc/apt/sources.list.d/vscode.list' && \
    rm -f packages.microsoft.gpg && \
    apt-get update && apt-get install -y code

# 3. Cài ngôn ngữ lập trình (C/C++, Python...)
RUN apt-get install -y python3 python3-pip g++ gcc

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5901
CMD ["/entrypoint.sh"]