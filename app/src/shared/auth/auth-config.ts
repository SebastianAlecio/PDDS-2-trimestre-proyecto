import { Amplify } from "aws-amplify";

// Configura Amplify Auth contra el User Pool de Cognito provisionado por
// Terraform. Llamar una sola vez al boot de la app (main.tsx).
//
// Las variables VITE_* se leen en build time; si falta alguna, fallamos
// temprano en vez de pasarle "undefined" a Amplify y debuggear errores
// crípticos del SDK.

function requireEnv(key: string): string {
  const value = import.meta.env[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Missing required env var ${key}. Copy .env.example to .env.local and fill in the values from "terraform output" in infra/.`,
    );
  }
  return value;
}

export function configureAmplify(): void {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: requireEnv("VITE_COGNITO_USER_POOL_ID"),
        userPoolClientId: requireEnv("VITE_COGNITO_USER_POOL_CLIENT_ID"),
      },
    },
  });
}

export const API_BASE_URL = requireEnv("VITE_API_BASE_URL");
