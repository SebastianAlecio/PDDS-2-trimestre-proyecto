import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Field } from "../../../shared/ui/Field";
import { useAuth } from "../../../shared/auth/use-auth";
import styles from "./LoginPage.module.css";

type LocationState = { from?: string } | null;

export function LoginPage() {
  const { status, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState)?.from ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Si la sesión llegó a "signed-in" mientras estábamos en /login (por refresh
  // del navegador o por un signIn exitoso), salir de aquí.
  useEffect(() => {
    if (status.state === "new-password-required") {
      navigate("/new-password", { replace: true });
    }
  }, [status, navigate]);

  if (status.state === "signed-in") {
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const outcome = await signIn(email.trim(), password);
    setSubmitting(false);
    if (outcome.kind === "error") {
      setError(outcome.message);
      return;
    }
    if (outcome.kind === "new-password-required") {
      navigate("/new-password", { replace: true });
    }
    // si "signed-in", el useEffect / Navigate de arriba se encarga.
  };

  return (
    <div className={styles.shell}>
      <header className={styles.globalNav}>
        <span className={styles.brand}>Ticke-T</span>
        <nav className={styles.navLinks} aria-label="Primary">
          <span>Producto</span>
          <span>Empresas</span>
          <span>Soporte</span>
          <span>Recursos</span>
        </nav>
        <span className={styles.navTag}>portal interno · beta</span>
      </header>

      <main className={styles.main}>
        <article className={styles.card}>
          <h1 className={styles.heading}>Inicia sesión.</h1>
          <p className={styles.subheading}>
            Ingresa con tu cuenta corporativa para crear tickets o atender la cola
            del equipo de soporte.
          </p>

          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <Field
              label="Correo corporativo"
              type="email"
              autoComplete="email"
              required
              placeholder="usuario@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Field
              label="Contraseña"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              type="submit"
              className={`btn-primary ${styles.submit}`}
              disabled={submitting}
            >
              {submitting ? "Ingresando…" : "Continuar"}
            </button>
          </form>

          {error && (
            <p className={styles.alert} role="alert">
              {error}
            </p>
          )}

          <div className={styles.footer}>
            <a className={styles.footerLink} href="#" onClick={(e) => e.preventDefault()}>
              ¿Olvidaste tu contraseña?
            </a>
          </div>
        </article>
      </main>
    </div>
  );
}
