#!/usr/bin/env bash
# Imprime o IP desta máquina na rede local (interface da rota padrão), para LAN_HOST.
# Uso: LAN_HOST=$(scripts/lan-ip.sh) docker compose up -d --build
set -euo pipefail
if command -v ipconfig >/dev/null 2>&1 && command -v route >/dev/null 2>&1 && [ "$(uname)" = "Darwin" ]; then
  iface=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
  ipconfig getifaddr "${iface:-en0}"
elif command -v ip >/dev/null 2>&1; then
  ip route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }}'
else
  hostname -I 2>/dev/null | awk '{print $1}'
fi
