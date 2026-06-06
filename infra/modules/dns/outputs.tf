output "hosted_zone_id" {
  description = "ID de la hosted zone en Route 53. Nombre exigido por el rubric de OYD-D3 (\"Outputs: domain_name and hosted_zone_id\")."
  value       = aws_route53_zone.this.zone_id
}

# Alias retro-compatible: código que ya referenciaba zone_id sigue funcionando.
output "zone_id" {
  description = "Alias de hosted_zone_id. Se mantiene por compatibilidad."
  value       = aws_route53_zone.this.zone_id
}

output "zone_name" {
  description = "Nombre de la hosted zone (dominio raíz)."
  value       = aws_route53_zone.this.name
}

output "domain_name" {
  description = "FQDN del custom domain del API (ej. \"api.ticke-t.lumenchat.app\"). Nombre exigido por el rubric de OYD-D3."
  value       = var.api_full_hostname
}

output "zone_nameservers" {
  description = "Los 4 nameservers que AWS asignó a esta hosted zone. Configurarlos en el registrador del dominio como Custom Nameservers. Mientras el registrador siga apuntando a los nameservers anteriores, esta zone no es alcanzable desde internet."
  value       = aws_route53_zone.this.name_servers
}

output "api_url" {
  description = "URL pública del API una vez activado el custom domain (vacío si enable_api_custom_domain = false)."
  value       = var.enable_api_custom_domain ? "https://${var.api_full_hostname}" : ""
}

output "api_certificate_arn" {
  description = "ARN del certificado wildcard ACM (vacío hasta que enable_api_custom_domain = true)."
  value       = var.enable_api_custom_domain ? aws_acm_certificate_validation.wildcard[0].certificate_arn : ""
}
