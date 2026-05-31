import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Field } from "../../../shared/ui/Field";
import { useAuth } from "../../../shared/auth/use-auth";
import styles from "./LoginPage.module.css";

// Cognito impone NEW_PASSWORD_REQUIRED en el primer login después de que un
// admin crea al usuario con contraseña temporal. Esta pantalla cierra ese
// challenge: pide la nueva contraseña dos veces y la confirma con Amplify.

export function NewPasswordPage() {
  const { status, completeNewPassword } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Si el usuario navegó aquí directo sin venir del flujo, mandarlo al login.
  if (status.state === "signed-in") {
    return <Navigate to="/" replace />;
  }
  if (status.state === "signed-out") {
    return <Navigate to="/login" replace />;
  }
  if (status.state === "loading") {
    return null;
  }

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSubmitting(true);
    const outcome = await completeNewPassword(password);
    setSubmitting(false);
    if (outcome.kind === "error") {
      setError(outcome.message);
      return;
    }
    if (outcome.kind === "signed-in") {
      navigate("/", { replace: true });
    }
  };

  return (
    <div className={styles.shell}>
      <header className={styles.globalNav}>
        <span className={styles.brand}>Ticke-T</span>
        <nav className={styles.navLinks} aria-label="Primary">
          <span>Producto</span>
          <span>Empresas</span>
          <span>Soporte</span>
        </nav>
        <span className={styles.navTag}>portal interno · beta</span>
      </header>

      <main className={styles.main}>
        <article className={styles.card}>
          <h1 className={styles.heading}>Define tu contraseña.</h1>
          <p className={styles.subheading}>
            Es la primera vez que ingresas. Elige una contraseña nueva para
            reemplazar la temporal.
          </p>

          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <Field
              label="Nueva contraseña"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              hint="Mínimo 8 caracteres, con mayúscula, minúscula y número."
            />
            <Field
              label="Repetir contraseña"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />

            <button
              type="submit"
              className={`btn-primary ${styles.submit}`}
              disabled={submitting}
            >
              {submitting ? "Guardando…" : "Guardar y continuar"}
            </button>
          </form>

          {error && (
            <p className={styles.alert} role="alert">
              {error}
            </p>
          )}
        </article>
      </main>
    </div>
  );
}
