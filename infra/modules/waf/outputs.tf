output "web_acl_id" {
  description = "ID del Web ACL."
  value       = aws_wafv2_web_acl.this.id
}

output "web_acl_arn" {
  description = "ARN del Web ACL. Útil para auditoría y para asociar a más recursos en el futuro."
  value       = aws_wafv2_web_acl.this.arn
}

output "web_acl_capacity" {
  description = "Web ACL Capacity Units (WCU) consumidas por las reglas. AWS cobra por WCU; útil para monitorear si el conjunto de reglas crece."
  value       = aws_wafv2_web_acl.this.capacity
}
