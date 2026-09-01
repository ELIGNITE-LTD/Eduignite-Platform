#!/bin/bash
# First-boot setup for the app box (Ubuntu 22.04). Installs Docker, adds swap,
# then runs /opt/eduignite/deploy.sh (pulled from S3), which renders .env from
# SSM and brings the stack up.
set -euxo pipefail
exec > >(tee /var/log/eduignite-bootstrap.log | logger -t eduignite -s 2>/dev/console) 2>&1

export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y ca-certificates curl gnupg jq unzip

# AWS CLI v2
if ! command -v aws >/dev/null 2>&1; then
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
  unzip -q /tmp/awscliv2.zip -d /tmp
  /tmp/aws/install
fi

# Docker Engine + Compose plugin
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$${VERSION_CODENAME}") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
usermod -aG docker ubuntu || true

# Make sure the SSM agent is up (Session Manager / Run Command deploys).
snap install amazon-ssm-agent --classic || true
systemctl enable --now snap.amazon-ssm-agent.amazon-ssm-agent.service 2>/dev/null || \
  systemctl enable --now amazon-ssm-agent 2>/dev/null || true

# Swap, so a 2 GB box can absorb build/PDF memory spikes.
if [ ! -f /swapfile ]; then
  fallocate -l ${swap_gb}G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$((${swap_gb}*1024))
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Machine config that deploy.sh reads.
mkdir -p /opt/eduignite
cat > /opt/eduignite/eduignite.conf <<CONF
AWS_REGION=${aws_region}
SSM_PREFIX=${ssm_prefix}
ACCOUNT_ID=${account_id}
DEPLOY_BUCKET=${bucket}
ECR_BACKEND=${ecr_backend}
ECR_FRONTEND=${ecr_frontend}
IMAGE_TAG=latest
CONF

# Deploy assets (uploaded by Terraform).
aws s3 cp "s3://${bucket}/deploy/docker-compose.prod.yml" /opt/eduignite/docker-compose.prod.yml --region ${aws_region}
aws s3 cp "s3://${bucket}/deploy/Caddyfile"               /opt/eduignite/Caddyfile               --region ${aws_region}
aws s3 cp "s3://${bucket}/deploy/deploy.sh"               /opt/eduignite/deploy.sh               --region ${aws_region}
chmod +x /opt/eduignite/deploy.sh

# Bring the stack back up after a reboot.
cat > /etc/systemd/system/eduignite.service <<'UNIT'
[Unit]
Description=EduIgnite platform (docker compose)
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/eduignite
ExecStart=/opt/eduignite/deploy.sh
ExecStop=/usr/bin/docker compose --env-file /opt/eduignite/.env.compose -f /opt/eduignite/docker-compose.prod.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable eduignite.service

# First deploy. Fails until CI has pushed images; that's fine.
/opt/eduignite/deploy.sh || echo "Initial deploy failed (images may not be pushed yet). Run: sudo /opt/eduignite/deploy.sh after CI pushes images."
