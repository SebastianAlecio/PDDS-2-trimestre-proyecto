import { useState, type FormEvent, type ChangeEvent } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { AppHeader } from "../../../shared/ui/AppHeader";
import { Field } from "../../../shared/ui/Field";
import { Select } from "../../../shared/ui/Select";
import styles from "./CreateUserForm.module.css";

export function CreateUserForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("colaborador");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Asumimos que la API se expone en la misma variable de entorno que usas en los repositorios
  const API_URL = import.meta.env.VITE_API_URL || "";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      if (!token) throw new Error("No hay sesión activa.");

      const res = await fetch(`${API_URL}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ email, name, role })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || "Error al crear el usuario en el backend.");
      }

      setMessage({ type: "success", text: "Usuario creado exitosamente. Se le enviará un correo con su contraseña temporal." });
      setEmail("");
      setName("");
      setRole("colaborador");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Error desconocido al crear usuario";
      setMessage({ type: "error", text: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const roleOptions = [
    { value: "colaborador", label: "Colaborador" },
    { value: "agente-n1", label: "Agente N1" },
    { value: "agente-n2", label: "Agente N2" },
    { value: "gerente", label: "Gerente" },
  ];

  return (
    <div className={styles.shell}>
      <AppHeader />
    
      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.heroEyebrow}>Administración</p>
          <h1 className={styles.heroTitle}>Crear usuario</h1>
          <p className={styles.heroLead}>
            Registra un nuevo usuario en el sistema. Recibirá un correo con su contraseña temporal.
          </p>
        </section>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {message && (
            <div
              className={`${styles.message} ${
                message.type === "error" ? styles.messageError : styles.messageSuccess
              }`}
              role="alert"
            >
              {message.text}
            </div>
          )}

          <section className={styles.section}>
            <Field
              label="Nombre Completo"
              type="text"
              value={name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              required
            />

            <Field
              label="Correo Electrónico"
              type="email"
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              required
            />

            <Select
              label="Rol del Sistema"
              value={role}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setRole(e.target.value)}
              options={roleOptions}
            />
          </section>

          <footer className={styles.footer}>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Creando..." : "Crear Usuario"}
            </button>
          </footer>
        </form>
      </main>
    </div>
  );
}