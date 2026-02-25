FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# 1) Desktop + RDP + toolchain + editor
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates gnupg software-properties-common apt-transport-https \
    xfce4 xfce4-goodies \
    xrdp xorg xorgxrdp dbus-x11 xfonts-base \
    net-tools netcat-openbsd curl wget git nano sudo \
    build-essential gcc g++ make gdb \
    python3 python3-pip python3-venv python-is-python3 \
    openjdk-17-jdk \
    codeblocks codeblocks-contrib \
    geany geany-plugins \
    adwaita-icon-theme-full gnome-icon-theme hicolor-icon-theme \
    xterm xfce4-terminal \
    libgbm-dev libnss3 libasound2 \
    fonts-liberation libu2f-udev xdg-utils \
    fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji \
    epiphany-browser \
    falkon \
    && rm -rf /var/lib/apt/lists/*

# 2) Browser (Epiphany) + font rendering
RUN fc-cache -f

# 3) User sinh vien
RUN useradd -m -s /bin/bash student && \
    echo "student:123456" | chpasswd && \
    adduser student sudo

RUN mkdir -p /home/student/Desktop /home/student/workspace && \
    chown -R student:student /home/student

# 4) Cấu hình XRDP
RUN adduser xrdp ssl-cert
RUN echo "xfce4-session" > /home/student/.xsession && \
    chown student:student /home/student/.xsession

RUN printf '%s\n' \
    '#!/bin/sh' \
    'if [ -r /etc/profile ]; then . /etc/profile; fi' \
    'if [ -r "$HOME/.profile" ]; then . "$HOME/.profile"; fi' \
    'if [ -z "${XDG_RUNTIME_DIR:-}" ]; then' \
    '  export XDG_RUNTIME_DIR="/tmp/runtime-${USER}"' \
    'fi' \
    'mkdir -p "$XDG_RUNTIME_DIR"' \
    'chmod 700 "$XDG_RUNTIME_DIR"' \
    'if command -v dbus-launch >/dev/null 2>&1; then' \
    '  eval "$(dbus-launch --sh-syntax)"' \
    'fi' \
    'export DESKTOP_SESSION=xfce' \
    'export XDG_CURRENT_DESKTOP=XFCE' \
    'exec startxfce4' \
    > /etc/xrdp/startwm.sh && chmod +x /etc/xrdp/startwm.sh

RUN printf '%s\n' \
    'allowed_users=anybody' \
    'needs_root_rights=yes' \
    > /etc/X11/Xwrapper.config

# 5) Browser launcher safe trong container
RUN printf '%s\n' \
    '#!/bin/bash' \
    'set -e' \
    'if command -v epiphany-browser >/dev/null 2>&1; then' \
    '  if epiphany-browser "$@"; then exit 0; fi' \
    'fi' \
    'if command -v falkon >/dev/null 2>&1; then' \
    '  exec falkon "$@"' \
    'fi' \
    'if command -v google-chrome-stable >/dev/null 2>&1; then' \
    '  exec google-chrome-stable --no-sandbox --disable-dev-shm-usage "$@"' \
    'fi' \
    'if command -v xdg-open >/dev/null 2>&1; then' \
    '  exec xdg-open "${1:-about:blank}"' \
    'fi' \
    'echo "No compatible browser found in exam container." >&2' \
    'exit 1' \
    > /usr/local/bin/browser-safe && chmod +x /usr/local/bin/browser-safe

# 6) Geany config cho Python/Java
RUN mkdir -p /home/student/.config/geany/filedefs && \
    chown -R student:student /home/student/.config

RUN printf '%s\n' \
    '[build-menu]' \
    'FT_00_LB=_Execute' \
    'FT_00_CM=python3 "%f"' \
    'FT_00_WD=%d' \
    'EX_00_LB=_Execute' \
    'EX_00_CM=python3 "%f"' \
    'EX_00_WD=%d' \
    > /home/student/.config/geany/filedefs/filetypes.python.conf && \
    chown student:student /home/student/.config/geany/filedefs/filetypes.python.conf

RUN printf '%s\n' \
    '[build-menu]' \
    'FT_02_LB=_Compile' \
    'FT_02_CM=javac "%f"' \
    'FT_02_WD=%d' \
    'EX_00_LB=_Execute' \
    'EX_00_CM=java "%e"' \
    'EX_00_WD=%d' \
    > /home/student/.config/geany/filedefs/filetypes.java.conf && \
    chown student:student /home/student/.config/geany/filedefs/filetypes.java.conf

# 7) Mẫu file trong workspace
RUN printf '%s\n' \
    'print("Hello from Python")' \
    > /home/student/workspace/main.py && \
    printf '%s\n' \
    'public class Main {' \
    '  public static void main(String[] args) {' \
    '    System.out.println("Hello from Java");' \
    '  }' \
    '}' \
    > /home/student/workspace/Main.java && \
    printf '%s\n' \
    '#include <iostream>' \
    'int main() {' \
    '  std::cout << "Hello from C++" << std::endl;' \
    '  return 0;' \
    '}' \
    > /home/student/workspace/main.cpp && \
    chown -R student:student /home/student/workspace

# 8) Desktop shortcuts
RUN mkdir -p /home/student/Desktop && \
    cp /usr/share/applications/geany.desktop /home/student/Desktop/Geany.desktop && \
    cp /usr/share/applications/codeblocks.desktop /home/student/Desktop/CodeBlocks.desktop && \
    sed -i 's|^Exec=.*|Exec=geany /home/student/workspace|' /home/student/Desktop/Geany.desktop && \
    printf '%s\n' \
    '[Desktop Entry]' \
    'Version=1.0' \
    'Type=Application' \
    'Name=Web Browser' \
    'Comment=Open exam portal' \
    'Exec=/usr/local/bin/browser-safe %U' \
    'Icon=web-browser' \
    'Terminal=false' \
    'Categories=Network;WebBrowser;' \
    > /home/student/Desktop/WebBrowser.desktop && \
    chmod +x /home/student/Desktop/Geany.desktop /home/student/Desktop/CodeBlocks.desktop /home/student/Desktop/WebBrowser.desktop && \
    chown -R student:student /home/student/Desktop

# 9) Script verify toolchain
RUN printf '%s\n' \
    '#!/bin/bash' \
    'set -e' \
    'echo "=== TOOLCHAIN CHECK ==="' \
    'echo "[C]   $(gcc --version | head -n 1)"' \
    'echo "[C++] $(g++ --version | head -n 1)"' \
    'echo "[Py]  $(python3 --version)"' \
    'echo "[Java] $(javac -version 2>&1)"' \
    'echo "[Geany] $(geany --version | head -n 1)"' \
    'echo "[Code::Blocks] $(codeblocks --version 2>/dev/null | head -n 1 || echo installed)"' \
    > /usr/local/bin/verify-toolchain && chmod +x /usr/local/bin/verify-toolchain

RUN printf '%s\n' \
    '[Desktop Entry]' \
    'Version=1.0' \
    'Type=Application' \
    'Name=Verify Toolchain' \
    'Comment=Kiem tra nhanh compiler C/C++ Python Java' \
    'Exec=xfce4-terminal --hold -e /usr/local/bin/verify-toolchain' \
    'Icon=utilities-terminal' \
    'Terminal=false' \
    'Categories=Development;' \
    > /home/student/Desktop/VerifyToolchain.desktop && \
    chmod +x /home/student/Desktop/VerifyToolchain.desktop && \
    chown student:student /home/student/Desktop/VerifyToolchain.desktop

# 10) Build-time verification
RUN command -v geany && \
    command -v codeblocks && \
    command -v epiphany-browser && \
    command -v falkon && \
    command -v /usr/local/bin/browser-safe && \
    command -v python3 && \
    command -v javac && \
    command -v java && \
    command -v gcc && \
    command -v g++ && \
    command -v Xorg

RUN dpkg -l | grep -q '^ii\s\+xorgxrdp\s'
RUN su - student -c 'test -f /home/student/Desktop/Geany.desktop && test -f /home/student/Desktop/CodeBlocks.desktop && test -f /home/student/Desktop/WebBrowser.desktop && test -f /home/student/workspace/main.py && test -f /home/student/workspace/Main.java'

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3389
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=6 CMD nc -z 127.0.0.1 3389 || exit 1

CMD ["/entrypoint.sh"]
