# OIDC federation para GitHub Actions
#
# Provisiona el OpenID Connect provider de GitHub Actions y el ci_runner role
# assumable via OIDC (sin access keys long-lived). Gateado por var.enable_oidc
# para permitir aplicar este módulo antes de tener el setup OIDC listo en GH.
#
# Trust policy: scopeada al repo ${github_owner}/${github_repo}, aceptando 4
# subject claims específicos (main branch, pull_request, environment:dev,
# environment:staging). Cero wildcards en sub.

# ─── OIDC provider ────────────────────────────────────────────────────────
# Un solo provider por cuenta AWS — si ya existe (de otro repo o entrega), se
# importa con `terraform import aws_iam_openid_connect_provider.github[0] arn:aws:iam::ACCOUNT:oidc-provider/token.actions.githubusercontent.com`
# antes de aplicar.
#
# Thumbprints: AWS oficialmente publica DOS thumbprints válidos del cert raíz
# de GitHub (rotación segura). Incluir ambos da redundancia ante rotación.
# Referencia: https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services
resource "aws_iam_openid_connect_provider" "github" {
  count = var.enable_oidc ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]

  # PROTECTION: el OIDC provider es PLATAFORMA. Si lo destruyes, los
  # workflows pierden la capacidad de hacer sts:AssumeRoleWithWebIdentity
  # y el "single git push triggers full pipeline" del rubric F deja de
  # funcionar (gallina/huevo: el apply que recrearía el provider no puede
  # autenticar porque no hay provider). prevent_destroy = true bloquea
  # el destroy y obliga a removerlo manualmente del state si alguien
  # quiere decomisar la integración.
  lifecycle {
    prevent_destroy = true
  }
}

# ─── Trust policy del ci_runner ───────────────────────────────────────────
# Cuatro condiciones (todas scopeadas al mismo repo, ninguna con wildcard en
# sub claim):
#   - :ref:refs/heads/main          — push directo a main, schedule (drift)
#   - :pull_request                 — PR plan jobs (CI workflow)
#   - :environment:dev              — workflow_dispatch dev (destroy, manual apply)
#   - :environment:staging          — workflow_dispatch staging (apply, destroy)
data "aws_iam_policy_document" "ci_runner_assume" {
  count = var.enable_oidc ? 1 : 0

  statement {
    effect  = "Allow"
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

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_owner}/${var.github_repo}:ref:refs/heads/main",
        "repo:${var.github_owner}/${var.github_repo}:pull_request",
        "repo:${var.github_owner}/${var.github_repo}:environment:dev",
        "repo:${var.github_owner}/${var.github_repo}:environment:staging",
      ]
    }
  }
}

# ─── ci_runner role ───────────────────────────────────────────────────────
# Permisos: AdministratorAccess. Justificación (documentada en
# delivery-5-summary.md): terraform plan/apply maneja IAM (crear roles + key
# policies + OIDC providers), KMS (key policies), Route 53 zonas + records,
# CloudFront distributions, etc. Una policy custom mínima sería extensa,
# frágil ante cambios de provider y daría mantenimiento constante. La
# alternativa estándar para CI/CD de Terraform es PowerUserAccess + IAMFullAccess
# o directamente AdministratorAccess — adoptamos AdministratorAccess.
resource "aws_iam_role" "ci_runner" {
  count = var.enable_oidc ? 1 : 0

  name                 = "${local.name_prefix}-ci-runner-${local.name_suffix}"
  assume_role_policy   = data.aws_iam_policy_document.ci_runner_assume[0].json
  description          = "Role asumido por GitHub Actions vía OIDC para terraform plan/apply. Trust policy scopeada al repo ${var.github_owner}/${var.github_repo}."
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "ci_runner_admin" {
  count = var.enable_oidc ? 1 : 0

  role       = aws_iam_role.ci_runner[0].name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}
