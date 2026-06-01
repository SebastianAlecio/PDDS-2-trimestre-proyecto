import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/use-auth";
import styles from "./AppHeader.module.css";

// Header común a todas las pantallas autenticadas. Muestra el nombre del
// usuario, su rol primario, el set de tabs visibles según rol, y el botón
// de logout. Para esta tanda el set de tabs es chico (Crear / Mis tickets)
// y solo aplica al colaborador; las próximas tandas van a sumar tabs por
// rol (Cola para agentes, Métricas para gerente).

export function AppHeader() {
  const { status, signOut } = useAuth();
  if (status.state !== "signed-in") return null;
  const { user } = status;

  return (
    <header className={styles.bar}>
      <span className={styles.brand}>Ticke-T</span>

      <nav className={styles.nav} aria-label="Primary">
        {user.primaryRole === "colaborador" && (
          <>
            <NavLink
              to="/crear"
              className={({ isActive }) =>
                isActive ? `${styles.link} ${styles.linkActive}` : styles.link
              }
            >
              Crear ticket
            </NavLink>
            <NavLink
              to="/mis-tickets"
              className={({ isActive }) =>
                isActive ? `${styles.link} ${styles.linkActive}` : styles.link
              }
            >
              Mis tickets
            </NavLink>
          </>
        )}
        {(user.primaryRole === "agente-n1" || user.primaryRole === "agente-n2") && (
          <NavLink
            to="/cola"
            className={({ isActive }) =>
              isActive ? `${styles.link} ${styles.linkActive}` : styles.link
            }
          >
            Cola
          </NavLink>
        )}
        {user.primaryRole === "gerente" && (
          <span className={styles.disabled}>Vistas próximamente</span>
        )}
      </nav>

      <div className={styles.user}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
          <span className={styles.userLabel}>{user.email}</span>
          {user.primaryRole && <span className={styles.userRole}>{user.primaryRole}</span>}
        </div>
        <button type="button" className={styles.logout} onClick={() => void signOut()}>
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}
