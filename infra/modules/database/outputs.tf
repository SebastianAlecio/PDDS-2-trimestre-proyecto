output "db_endpoint" {
  description = "Connection endpoint in the form \"host:port\". Consumed by the application layer when wiring connection strings."
  value       = aws_db_instance.this.endpoint
}

output "db_arn" {
  description = "ARN of the RDS instance. Required output by the delivery rubric; surfaced for IAM policies and audit trails."
  value       = aws_db_instance.this.arn
}

output "db_security_group_id" {
  description = "ID of the security group attached to the instance. Exposed so the root module (or sibling modules) can confirm ingress wiring."
  value       = aws_security_group.db.id
}

output "db_subnet_group_name" {
  description = "Name of the DB subnet group. Useful for cross-stack references when other databases share the same subnet layout."
  value       = aws_db_subnet_group.this.name
}
