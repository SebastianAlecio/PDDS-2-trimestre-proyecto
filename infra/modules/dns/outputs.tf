output "zone_id" {
  description = "ID de la hosted zone en Route 53."
  value       = aws_route53_zone.this.zone_id
}

output "zone_name" {
  description = "Nombre de la hosted zone (dominio raíz)."
  value       = aws_route53_zone.this.name
}

output "zone_nameservers" {
  description = "Los 4 nameservers que AWS asignó a esta hosted zone. PEGARLOS en la sección Nameservers del panel del registrador (Hostinger → Domain → Nameservers → Change Nameservers → Custom). Mientras los nameservers del registrador sigan en dns-parking, esta zone no es alcanzable desde internet."
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
