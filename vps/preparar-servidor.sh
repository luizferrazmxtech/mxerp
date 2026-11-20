#!/usr/bin/env bash
# Prepara uma VPS Ubuntu 24.04 nova para o MXERP (rode uma vez, como root):
#   Docker, firewall (só SSH, 80 e 443), fuso de São Paulo, memória extra (swap),
#   atualizações de segurança automáticas e bloqueio de quem erra a senha do SSH.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Rode como root (sudo)."; exit 1; }
export DEBIAN_FRONTEND=noninteractive

timedatectl set-timezone America/Sao_Paulo
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl git openssl ufw fail2ban unattended-upgrades

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

# memória extra no disco: evita o sistema cair se a RAM encher na hora de montar uma versão nova
if ! swapon --show | grep -q .; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 && echo 'vm.swappiness=10' > /etc/sysctl.d/99-mxerp.conf
fi

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

dpkg-reconfigure -f noninteractive unattended-upgrades
systemctl enable --now fail2ban

echo
echo "Servidor pronto. Próximo passo: ./vps/mxerp.sh instalar"
