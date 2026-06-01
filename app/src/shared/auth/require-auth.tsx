import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./use-auth";
import type { Role } from "./types";

// Si no hay sesión, redirige a /login conservando la URL original para
// volver después del login. Mientras Amplify hidrata la sesión inicial,
// muestra un splash mínimo en vez de parpadear redirects.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status.state === "loading") return <AuthSplash />;
  if (status.state !== "signed-in") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

// Restringe el árbol al rol/roles indicados. Asume que viene anidado dentro
// de <RequireAuth> (o que el caller maneja el caso signed-out por separado).
// Si el rol no califica, redirige al home del usuario según su rol primario.
export function RequireRole({
  allow,
  children,
}: {
  allow: readonly Role[];
  children: ReactNode;
}) {
  const { status } = useAuth();

  if (status.state === "loading") return <AuthSplash />;
  if (status.state !== "signed-in") {
    return <Navigate to="/login" replace />;
  }
  const userRole = status.user.primaryRole;
  if (!userRole || !allow.includes(userRole)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function AuthSplash() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        color: "var(--ink-muted-48)",
        fontSize: 14,
      }}
    >
      Cargando…
    </div>
  );
}
