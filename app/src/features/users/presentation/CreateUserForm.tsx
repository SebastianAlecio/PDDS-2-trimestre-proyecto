import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppHeader } from "../../../shared/ui/AppHeader";
import { Field } from "../../../shared/ui/Field";
import { Select } from "../../../shared/ui/Select";
import { HttpError } from "../../../shared/api/http-client";
import { useCreateUser } from "./use-create-user";
import styles from "./CreateUserForm.module.css";

const createUserSchema = z.object({
  name: z.string().min(1, "El nombre completo es obligatorio"),
  email: z.string().email("Debe ser un correo electrónico válido"),
  role: z.enum(["colaborador", "agente-n1", "agente-n2", "gerente"]),
});

export type CreateUserFormValues = z.infer<typeof createUserSchema>;

export function CreateUserForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    mode: "onTouched",
    defaultValues: {
      name: "",
      email: "",
      role: "colaborador",
    },
  });

  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { create } = useCreateUser();

  const onSubmit = handleSubmit(async (values) => {
    setMessage(null);

    try {
      await create(values);
      setMessage({ type: "success", text: "Usuario creado exitosamente. Se le enviará un correo con su contraseña temporal." });
      reset();
    } catch (error) {
      setMessage({ type: "error", text: humanizeApiError(error) });
    }
  });

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

      <form className={styles.form} onSubmit={onSubmit} noValidate>
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
            {...register("name")}
            error={errors.name?.message}
            />

            <Field
              label="Correo Electrónico"
              type="email"
            {...register("email")}
            error={errors.email?.message}
            />

            <Select
              label="Rol del Sistema"
              options={roleOptions}
            {...register("role")}
            error={errors.role?.message}
            />
          </section>

          <footer className={styles.footer}>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Creando..." : "Crear Usuario"}
            </button>
          </footer>
        </form>
      </main>
    </div>
  );
}

function humanizeApiError(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 401) return "Tu sesión expiró. Vuelve a iniciar sesión.";
    if (err.status === 403) return "No tienes permisos para crear usuarios.";
    if (err.status === 400) {
      const details = Array.isArray(err.details) ? err.details.join(" · ") : null;
      return details ? `${err.message}: ${details}` : err.message;
    }
    return `Error del servidor (${err.status}): ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return "Error inesperado al crear el usuario.";
}