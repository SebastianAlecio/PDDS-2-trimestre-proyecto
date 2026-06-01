// Roles del sistema. Deben coincidir EXACTAMENTE con los nombres de los
// aws_cognito_user_group en infra/modules/security/main.tf. El output
// `cognito_user_group_names` de Terraform es la fuente de verdad.
export type Role = "colaborador" | "agente-n1" | "agente-n2" | "gerente";

export const ROLES: readonly Role[] = [
  "colaborador",
  "agente-n1",
  "agente-n2",
  "gerente",
] as const;

// "Rol principal" del usuario cuando pertenece a varios grupos. Sigue el
// orden de privilegio del campo `precedence` declarado en Terraform
// (gerente=0 > agente-n2=10 > agente-n1=20 > colaborador=40, donde menor
// precedence gana).
const ROLE_PRECEDENCE: Record<Role, number> = {
  gerente: 0,
  "agente-n2": 10,
  "agente-n1": 20,
  colaborador: 40,
};

export function primaryRole(groups: readonly string[]): Role | null {
  const valid = groups.filter((g): g is Role => (ROLES as readonly string[]).includes(g));
  if (valid.length === 0) return null;
  return valid.reduce((best, g) =>
    ROLE_PRECEDENCE[g] < ROLE_PRECEDENCE[best] ? g : best,
  );
}

export type AuthUser = {
  username: string; // = sub (UUID de Cognito)
  email: string;
  name: string;
  groups: readonly string[];
  primaryRole: Role | null;
};

export type AuthStatus =
  | { state: "loading" }
  | { state: "signed-out" }
  | { state: "new-password-required"; username: string }
  | { state: "signed-in"; user: AuthUser };
