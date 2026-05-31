import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  confirmSignIn,
  fetchAuthSession,
  getCurrentUser,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
} from "aws-amplify/auth";
import { primaryRole, type AuthStatus, type AuthUser } from "./types";

type AuthContextValue = {
  status: AuthStatus;
  signIn: (email: string, password: string) => Promise<SignInOutcome>;
  completeNewPassword: (newPassword: string) => Promise<SignInOutcome>;
  signOut: () => Promise<void>;
  /** Devuelve el ID token actual (refrescándolo si está vencido) o null si no hay sesión. */
  getIdToken: () => Promise<string | null>;
};

export type SignInOutcome =
  | { kind: "signed-in" }
  | { kind: "new-password-required" }
  | { kind: "error"; message: string };

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>({ state: "loading" });

  // Al boot, intentar restaurar la sesión existente desde Amplify (localStorage).
  // Si hay una sesión válida, hidratamos el usuario y los grupos.
  const refreshUser = useCallback(async (): Promise<void> => {
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;
      if (!idToken) {
        setStatus({ state: "signed-out" });
        return;
      }
      const current = await getCurrentUser();
      const payload = idToken.payload;
      const groups = parseGroups(payload["cognito:groups"]);
      const user: AuthUser = {
        username: current.username,
        email: stringClaim(payload.email),
        name: stringClaim(payload.name),
        groups,
        primaryRole: primaryRole(groups),
      };
      setStatus({ state: "signed-in", user });
    } catch {
      setStatus({ state: "signed-out" });
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const signIn = useCallback<AuthContextValue["signIn"]>(async (email, password) => {
    try {
      const result = await amplifySignIn({
        username: email,
        password,
        options: { authFlowType: "USER_PASSWORD_AUTH" },
      });
      if (result.isSignedIn) {
        await refreshUser();
        return { kind: "signed-in" };
      }
      if (result.nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
        setStatus({ state: "new-password-required", username: email });
        return { kind: "new-password-required" };
      }
      // Otros pasos (MFA, etc.) no están habilitados en esta config —
      // los reportamos como error explícito en vez de quedar colgados.
      return {
        kind: "error",
        message: `Paso de autenticación no soportado: ${result.nextStep.signInStep}`,
      };
    } catch (err) {
      return { kind: "error", message: humanizeAuthError(err) };
    }
  }, [refreshUser]);

  const completeNewPassword = useCallback<AuthContextValue["completeNewPassword"]>(
    async (newPassword) => {
      try {
        const result = await confirmSignIn({ challengeResponse: newPassword });
        if (result.isSignedIn) {
          await refreshUser();
          return { kind: "signed-in" };
        }
        return {
          kind: "error",
          message: `Paso de autenticación no soportado: ${result.nextStep.signInStep}`,
        };
      } catch (err) {
        return { kind: "error", message: humanizeAuthError(err) };
      }
    },
    [refreshUser],
  );

  const signOut = useCallback(async () => {
    await amplifySignOut();
    setStatus({ state: "signed-out" });
  }, []);

  const getIdToken = useCallback(async () => {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.idToken?.toString() ?? null;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, signIn, completeNewPassword, signOut, getIdToken }),
    [status, signIn, completeNewPassword, signOut, getIdToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function stringClaim(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// El claim cognito:groups suele venir como string[] desde Amplify, pero
// defendemos contra el formato string-bracketed que API Gateway expone.
function parseGroups(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((g): g is string => typeof g === "string");
  if (typeof raw === "string") {
    const trimmed = raw.replace(/^\[/, "").replace(/\]$/, "").trim();
    if (!trimmed) return [];
    return trimmed.split(/[,\s]+/).filter(Boolean);
  }
  return [];
}

// Mensajes de error de Amplify/Cognito traducidos al usuario final. Lo
// importante es no exponer el nombre técnico del error (NotAuthorizedException,
// UserNotFoundException) — Cognito ya respeta prevent_user_existence_errors.
function humanizeAuthError(err: unknown): string {
  if (!(err instanceof Error)) return "Error inesperado al iniciar sesión.";
  const name = err.name ?? "";
  const message = err.message ?? "";
  if (name === "NotAuthorizedException") return "Correo o contraseña incorrectos.";
  if (name === "UserNotConfirmedException") return "Tu cuenta aún no fue confirmada.";
  if (name === "PasswordResetRequiredException")
    return "Debes cambiar tu contraseña antes de continuar.";
  if (name === "InvalidPasswordException")
    return "La contraseña no cumple los requisitos (8+ caracteres, mayúscula, minúscula, número).";
  if (name === "UserNotFoundException") return "Correo o contraseña incorrectos.";
  if (name === "LimitExceededException")
    return "Demasiados intentos. Espera unos minutos e intenta de nuevo.";
  return message || "Error inesperado al iniciar sesión.";
}
