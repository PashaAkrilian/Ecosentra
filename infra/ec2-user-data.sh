#!/bin/bash
# User-data EC2 (Amazon Linux 2023, t3.nano): Docker, swap, lalu menjalankan web + Caddy (HTTP :80) dari ECR.
# Prasyarat: image di ECR (tag v1), instance profile dengan kebijakan minimal (docs/deployment.md 2.3 + ECR pull),
# IMDS hop limit 2 (agar container bisa memakai role instance). Log: /var/log/ecosentra-init.log
# Untuk HTTPS ganti ':80' di Caddyfile dengan domain (dan DNS harus sudah menunjuk ke server).
set -euxo pipefail
exec > /var/log/ecosentra-init.log 2>&1

# GANTI sebelum dipakai sebagai user-data EC2 (nilai bukan rahasia, tapi spesifik akun):
REGION=ap-southeast-2; ACC=<ID-AKUN-AWS>
POOL=<USER-POOL-ID>; CLIENT=<APP-CLIENT-ID>
IMAGE=$ACC.dkr.ecr.$REGION.amazonaws.com/ecosentra-web:v1

# RAM instance kecil (0,5 GB): swap HARUS ada sebelum dnf (dnf memuat metadata repo ±90 MB dan bisa dimatikan OOM).
fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

dnf install -y docker
systemctl enable --now docker

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACC.dkr.ecr.$REGION.amazonaws.com
docker network create ecosentra

# Tanpa -p: hanya Caddy yang menerima trafik; X-Forwarded-For ditulis ulang Caddy (dipakai batas laju).
docker run -d --name web --network ecosentra --restart unless-stopped --memory 420m \
  -e AWS_REGION=$REGION -e COGNITO_USER_POOL_ID=$POOL -e COGNITO_CLIENT_ID=$CLIENT -e DYNAMODB_TABLE=ecosentra \
  $IMAGE

cat > /etc/ecosentra.Caddyfile <<'CADDY'
:80 {
	encode zstd gzip
	reverse_proxy web:8080 {
		header_up X-Forwarded-For {remote_host}
	}
}
CADDY
docker run -d --name caddy --network ecosentra --restart unless-stopped -p 80:80 -p 443:443 \
  -v /etc/ecosentra.Caddyfile:/etc/caddy/Caddyfile:ro caddy:2-alpine
echo "SELESAI $(date -Is)"
