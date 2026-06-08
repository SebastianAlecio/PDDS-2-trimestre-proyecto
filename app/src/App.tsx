import { Navigate, Route, Routes } from "react-router-dom";
import { AgentTicketPage } from "./features/tickets/presentation/AgentTicketPage";
import { CreateTicketPage } from "./features/tickets/presentation/CreateTicketPage";
import { MyTicketsPage } from "./features/tickets/presentation/MyTicketsPage";
import { QueuePage } from "./features/tickets/presentation/QueuePage";
import { LoginPage } from "./features/auth/presentation/LoginPage";
import { NewPasswordPage } from "./features/auth/presentation/NewPasswordPage";
import { CreateUserForm } from "./features/users/presentation/CreateUserForm";
import { ChatWidget } from "./features/chat/presentation/ChatWidget";
import { useAuth } from "./shared/auth/use-auth";
import { RequireAuth, RequireRole } from "./shared/auth/require-auth";

export function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/new-password" element={<NewPasswordPage />} />

        <Route
          path="/"
          element={
            <RequireAuth>
              <HomeRedirect />
            </RequireAuth>
          }
        />

        <Route
          path="/crear"
          element={
            <RequireAuth>
              <RequireRole allow={["colaborador"]}>
                <CreateTicketPage />
              </RequireRole>
            </RequireAuth>
          }
        />

        <Route
          path="/mis-tickets"
          element={
            <RequireAuth>
              <RequireRole allow={["colaborador"]}>
                <MyTicketsPage />
              </RequireRole>
            </RequireAuth>
          }
        />

        <Route
          path="/cola"
          element={
            <RequireAuth>
              <RequireRole allow={["agente-n1", "agente-n2"]}>
                <QueuePage />
              </RequireRole>
            </RequireAuth>
          }
        />

        <Route
          path="/agente/ticket/:id"
          element={
            <RequireAuth>
              <RequireRole allow={["agente-n1", "agente-n2"]}>
                <AgentTicketPage />
              </RequireRole>
            </RequireAuth>
          }
        />

        <Route
          path="/crear-usuario"
          element={
            <RequireAuth>
              <RequireRole allow={["gerente"]}>
                <CreateUserForm />
              </RequireRole>
            </RequireAuth>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ChatWidget />
    </>
  );
}

// Decide a dónde mandar al usuario tras /. Cada rol va a su pantalla principal.
function HomeRedirect() {
  const { status } = useAuth();
  if (status.state !== "signed-in") return <Navigate to="/login" replace />;

  const role = status.user.primaryRole;
  if (role === "colaborador") return <Navigate to="/mis-tickets" replace />;
  if (role === "agente-n1" || role === "agente-n2") return <Navigate to="/cola" replace />;
  if (role === "gerente") return <Navigate to="/crear-usuario" replace />;
  return <ComingSoon title={titleForRole(role)} caption={captionForRole(role)} />;
}

function titleForRole(role: string | null): string {
  switch (role) {
    case "gerente":
      return "Dashboard del gerente";
    default:
      return "Tu vista";
  }
}

function captionForRole(role: string | null): string {
  switch (role) {
    case "gerente":
      return "Aún no implementada en esta tanda. Próximamente: KPIs del equipo, tickets vencidos por SLA y desgloses por categoría.";
    default:
      return "Tu cuenta no tiene un rol asignado. Pide a un administrador que te agregue a un grupo de Cognito.";
  }
}

function ComingSoon({ title, caption }: { title: string; caption: string }) {
  const { signOut, status } = useAuth();
  const userEmail = status.state === "signed-in" ? status.user.email : "";

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "var(--canvas-parchment)",
      }}
    >
      <header
        style={{
          background: "var(--surface-black)",
          color: "var(--on-dark)",
          height: 44,
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        <span style={{ fontFamily: "var(--type-display)", fontSize: 14, fontWeight: 600 }}>
          Ticke-T
        </span>
        <span style={{ flex: 1, fontSize: 12, color: "#cccccc" }}>{userEmail}</span>
        <button
          type="button"
          onClick={() => void signOut()}
          style={{
            background: "var(--ink)",
            color: "var(--on-dark)",
            border: "none",
            padding: "8px 15px",
            borderRadius: "var(--r-sm)",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Cerrar sesión
        </button>
      </header>
      <main style={{ flex: 1, display: "grid", placeItems: "center", padding: "80px 24px" }}>
        <div
          style={{
            maxWidth: 520,
            textAlign: "center",
            padding: "48px 40px",
            background: "var(--canvas)",
            border: "1px solid var(--hairline)",
            borderRadius: "var(--r-lg)",
          }}
        >
          <h1
            style={{
              fontFamily: "var(--type-display)",
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: "-0.4px",
              marginBottom: 12,
            }}
          >
            {title}
          </h1>
          <p style={{ color: "var(--ink-muted-48)", fontSize: 15, lineHeight: 1.5 }}>{caption}</p>
        </div>
      </main>
    </div>
  );
}
