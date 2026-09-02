# GitHub Actions role via OIDC (on by default). Lets CI get short-lived creds
# to push images to ECR and trigger a redeploy over SSM, with no stored keys.

data "tls_certificate" "github" {
  count = var.create_github_oidc ? 1 : 0
  url   = "https://token.actions.githubusercontent.com/.well-known/openid-configuration"
}

resource "aws_iam_openid_connect_provider" "github" {
  count           = var.create_github_oidc ? 1 : 0
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github[0].certificates[0].sha1_fingerprint]
}

data "aws_iam_policy_document" "ci_assume" {
  count = var.create_github_oidc ? 1 : 0
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github[0].arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Restrict to this repo, any branch. Accept both the default sub and the
    # immutable-id sub (some orgs enforce the latter).
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = compact([
        "repo:${var.github_repo}:*",
        var.github_immutable_sub_prefix != "" ? "${var.github_immutable_sub_prefix}:*" : "",
      ])
    }
  }
}

resource "aws_iam_role" "ci" {
  count              = var.create_github_oidc ? 1 : 0
  name               = "${local.name_prefix}-ci-role"
  assume_role_policy = data.aws_iam_policy_document.ci_assume[0].json
}

data "aws_iam_policy_document" "ci" {
  count = var.create_github_oidc ? 1 : 0

  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid = "EcrPushPull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
    ]
    resources = [
      aws_ecr_repository.backend.arn,
      aws_ecr_repository.frontend.arn,
    ]
  }

  # Find the app box by tag before deploying (DescribeInstances has no
  # resource-level scoping, so it must be "*").
  statement {
    sid       = "Ec2Describe"
    actions   = ["ec2:DescribeInstances"]
    resources = ["*"]
  }

  # Publish built app installers (APK/EXE) to the download host.
  statement {
    sid       = "UploadInstallers"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.media.arn}/downloads/*"]
  }

  # Kick off deploy.sh on the box and read the result.
  statement {
    sid     = "SsmSendCommand"
    actions = ["ssm:SendCommand"]
    resources = [
      "arn:aws:ssm:${var.aws_region}::document/AWS-RunShellScript",
      aws_instance.app.arn,
    ]
  }
  statement {
    sid       = "SsmReadCommand"
    actions   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "ci" {
  count  = var.create_github_oidc ? 1 : 0
  name   = "${local.name_prefix}-ci-policy"
  role   = aws_iam_role.ci[0].id
  policy = data.aws_iam_policy_document.ci[0].json
}
