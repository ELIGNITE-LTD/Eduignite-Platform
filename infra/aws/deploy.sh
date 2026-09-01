#!/bin/bash
# Deploy / redeploy on the box. Renders /opt/eduignite/.env from SSM, logs in to
# ECR, pulls the latest images and (re)starts the stack. Safe to run repeatedly.
# Called by: user_data on first boot, the systemd unit on reboot, CI over SSM,
# or by hand: sudo /opt/eduignite/deploy.sh
set -euo pipefail

APP_DIR=/opt/eduignite
CONF="$APP_DIR/eduignite.conf"
ENV_FILE="$APP_DIR/.env"
COMPOSE_FILE="$APP_DIR/docker-compose.prod.yml"

# shellcheck disable=SC1090
source "$CONF"

echo "==> Refreshing deploy assets from s3://$DEPLOY_BUCKET/deploy/"
aws s3 cp "s3://$DEPLOY_BUCKET/deploy/docker-compose.prod.yml" "$COMPOSE_FILE"     --region "$AWS_REGION" || true
aws s3 cp "s3://$DEPLOY_BUCKET/deploy/Caddyfile"               "$APP_DIR/Caddyfile" --region "$AWS_REGION" || true

echo "==> Rendering $ENV_FILE from SSM ($SSM_PREFIX)"
umask 077
: > "$ENV_FILE.tmp"
# Page through the params under the prefix and write KEY=VALUE lines.
NEXT_TOKEN=""
while : ; do
  if [ -z "$NEXT_TOKEN" ]; then
    RESP=$(aws ssm get-parameters-by-path --path "$SSM_PREFIX" --with-decryption --recursive \
      --region "$AWS_REGION" --max-results 10 --output json)
  else
    RESP=$(aws ssm get-parameters-by-path --path "$SSM_PREFIX" --with-decryption --recursive \
      --region "$AWS_REGION" --max-results 10 --next-token "$NEXT_TOKEN" --output json)
  fi
  # Collapse embedded newlines/CRs to literal \n so multi-line secrets (e.g. a
  # Firebase private key) stay on one KEY=VALUE line. This is also the format the
  # app expects (it converts \n back to real newlines).
  echo "$RESP" | jq -r --arg p "$SSM_PREFIX/" '.Parameters[] | (.Name | sub($p;"")) + "=" + (.Value | gsub("\r";"") | gsub("\n";"\\n"))' >> "$ENV_FILE.tmp"
  NEXT_TOKEN=$(echo "$RESP" | jq -r '.NextToken // empty')
  [ -z "$NEXT_TOKEN" ] && break
done

mv "$ENV_FILE.tmp" "$ENV_FILE"

# Small, separate file for compose interpolation, so complex secret values in
# .env can't interfere with ${...} substitution.
cat > "$APP_DIR/.env.compose" <<COMPOSEENV
IMAGE_BACKEND=$ECR_BACKEND:$IMAGE_TAG
IMAGE_FRONTEND=$ECR_FRONTEND:$IMAGE_TAG
COMPOSEENV

echo "==> Syncing app installers from S3"
mkdir -p "$APP_DIR/downloads"
aws s3 sync "s3://$DEPLOY_BUCKET/downloads/" "$APP_DIR/downloads/" --region "$AWS_REGION" || true

echo "==> Logging in to ECR"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

echo "==> Pulling images and starting the stack"
cd "$APP_DIR"
docker compose --env-file "$APP_DIR/.env.compose" -f "$COMPOSE_FILE" pull || true
docker compose --env-file "$APP_DIR/.env.compose" -f "$COMPOSE_FILE" up -d --remove-orphans

echo "==> Pruning old images"
docker image prune -f || true

echo "==> Done. Current services:"
docker compose --env-file "$APP_DIR/.env.compose" -f "$COMPOSE_FILE" ps
