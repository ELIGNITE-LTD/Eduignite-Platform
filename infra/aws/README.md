# AWS deployment (single box)

Terraform + Docker setup that runs the whole platform on one EC2 instance with a
managed Postgres database and S3 for uploads. Built to stay cheap on the free
tier (~$16/mo the first year, ~$37/mo after) and to be moved onto an autoscaling
setup later without rewriting the apps.

## What runs where

One EC2 box (Ubuntu, t3.small) runs everything under Docker Compose:

* Caddy on 80/443, handles TLS automatically
* Django API (gunicorn) behind Caddy at `api.eduignite.online`
* Next.js site at `eduignite.online` / `www`
* Celery worker + beat
* Redis (container, used as the Celery broker, Channels layer and cache)

Managed AWS pieces:

* RDS Postgres (db.t3.micro), private, only the box can reach it
* S3 bucket for Django media (private, served with signed URLs)
* SSM Parameter Store holds the app env/secrets; the box reads them at boot
* ECR holds the two images; GitHub Actions builds and pushes them

The mobile (Capacitor) and desktop (Electron) apps aren't hosted here. They're
built in CI and just talk to the API.

## Before you start

You'll need, on your own machine:

* Terraform 1.5+
* AWS CLI v2, logged in to the target account (`aws configure`)
* Session Manager plugin if you want a shell on the box without SSH

## First deploy

**1. Config**

```bash
cd infra/aws
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`: set `acme_email` and fill in `app_secrets` (Django key,
Firebase, Groq, CamPay, email). Django key:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

**2. Apply**

```bash
terraform init
terraform apply
```

The box comes up and tries its first deploy, which fails because there are no
images in ECR yet. That's expected. Next step pushes them.

**3. Build the images**

Push the repo to GitHub (the two workflows in `.github/workflows` handle builds)
and add these under Settings > Secrets and variables > Actions > Variables:

| Variable | Value |
|----------|-------|
| `AWS_ROLE_ARN` | `terraform output -raw ci_role_arn` |
| `AWS_REGION` | e.g. `us-east-1` |
| `NEXT_PUBLIC_API_URL` | `https://api.eduignite.online` |
| `NEXT_PUBLIC_APP_URL` | `https://eduignite.online` |

Trigger both workflows (push a commit or run them from the Actions tab). They
build, push to ECR, and run `deploy.sh` on the box over SSM.

Not ready for CI? Build and push by hand instead (see the bottom of this file),
then run the command from `terraform output -raw manual_redeploy_command`.

**4. DNS**

```bash
terraform output dns_records_to_create
```

Add A records at your registrar pointing the three names at the Elastic IP:

```
eduignite.online       A   <elastic-ip>
www.eduignite.online   A   <elastic-ip>
api.eduignite.online   A   <elastic-ip>
```

If the registrar won't let you put an A record on the bare `eduignite.online`,
use an ALIAS/ANAME, or make `www` the canonical host and redirect the apex.

Once DNS resolves to the box, Caddy issues the certificates on its own, usually
within a minute or two.

**5. Check it**

```bash
curl https://api.eduignite.online/api/health/     # {"status": "ok"}
```

Then open `https://eduignite.online`.

## Running it day to day

Shell on the box (no SSH):

```bash
terraform output -raw ssm_session_command | bash
sudo -i
cd /opt/eduignite
docker compose --env-file .env.compose -f docker-compose.prod.yml ps
```

Deploy new code: push to `main`. The workflows are path-filtered so a backend
change only rebuilds the backend, and likewise for the site. To force a
redeploy, use `terraform output -raw manual_redeploy_command`.

Logs:

```bash
cd /opt/eduignite
docker compose --env-file .env.compose -f docker-compose.prod.yml logs -f web
docker compose --env-file .env.compose -f docker-compose.prod.yml logs -f celery-beat
```

Change an env value or secret: edit `terraform.tfvars`, `terraform apply` (it
updates the SSM parameter), then redeploy so the box re-reads its `.env`.

Create the first Django admin user:

```bash
cd /opt/eduignite
docker compose --env-file .env.compose -f docker-compose.prod.yml exec web python manage.py createsuperuser
```

### Building images by hand

```bash
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin "$(terraform output -raw ecr_backend_repo | cut -d/ -f1)"

docker build -t "$(terraform output -raw ecr_backend_repo):latest" ./backend
docker push "$(terraform output -raw ecr_backend_repo):latest"

docker build --build-arg NEXT_PUBLIC_API_URL=https://api.eduignite.online \
  -t "$(terraform output -raw ecr_frontend_repo):latest" ./apps/website
docker push "$(terraform output -raw ecr_frontend_repo):latest"
```

## Cost

| | Year 1 (free tier) | After free tier |
|---|---|---|
| EC2 t3.small | ~$15 | ~$15 |
| RDS db.t3.micro | $0 | ~$15 |
| S3 / ECR / EIP / EBS | ~$1 | ~$7 |
| Total | ~$16/mo | ~$37/mo |

The $200 credit covers roughly the first year. `db.t3.micro` and 30 GB of EBS
stay inside the 12-month free tier.

## Still to do

A few things that aren't wired up yet, called out so they don't surprise anyone:

* **Firebase on the frontend.** The site needs the `NEXT_PUBLIC_FIREBASE_*`
  values at build time. Add matching `ARG`/`ENV` lines to
  `apps/website/Dockerfile` and pass them as `--build-arg` in the frontend
  workflow if the browser side uses Firebase auth.
* **Websockets.** gunicorn (WSGI) doesn't serve `ws://`. If the realtime
  Channels features are in use, add a daphne/uvicorn service and route `/ws` to
  it in the `Caddyfile`.
* **LibreTranslate** is off to keep RAM in check on a 2 GB box. The commented
  block in `docker-compose.prod.yml` turns it back on, but only give it a
  t3.medium or bigger.

## Moving to autoscaling later

When traffic (and budget) justify the extra ~$25/mo:

1. Put the box behind an Application Load Balancer and an Auto Scaling Group
   (min 1), with an ACM cert. HTTPS moves from Caddy to the ALB.
2. Move Redis to ElastiCache so it's shared across instances; update
   `REDIS_URL` / `CELERY_BROKER_URL` in `app_env`.
3. Switch Celery beat to `celery-redbeat` so only one beat is ever active even
   with several instances running the same containers.
4. Add CPU target-tracking policies for scale out and in.

The apps don't need changes for this. Sessions are in the DB / JWT and media is
on S3, so the instances are already stateless.

## Tearing it down

```bash
terraform destroy
```

RDS has deletion protection on and takes a final snapshot. To actually remove
it, set `deletion_protection = false` in `rds.tf`, apply, then destroy.
