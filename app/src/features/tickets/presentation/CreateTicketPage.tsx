import { useEffect, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field } from "../../../shared/ui/Field";
import { Select } from "../../../shared/ui/Select";
import {
  TICKET_AREAS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type TicketPriority,
} from "../domain/ticket";
import { deriveSla } from "../domain/sla";
import {
  MAX_ATTACHMENTS,
  MAX_FILE_BYTES,
  createTicketSchema,
  formatFileError,
  validateFiles,
  type CreateTicketFormValues,
} from "./schema";
import { shortId, useCreateTicket } from "./use-create-ticket";
import styles from "./CreateTicketPage.module.css";

const categoryOptions = TICKET_CATEGORIES.map((v) => ({
  value: v,
  label: capitalize(v),
}));
const areaOptions = TICKET_AREAS.map((v) => ({ value: v, label: v }));
const priorityOptions = TICKET_PRIORITIES.map((v) => ({
  value: v,
  label: capitalize(v),
}));

const PRIORITY_VALUES = new Set<string>(TICKET_PRIORITIES);

export function CreateTicketPage() {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateTicketFormValues>({
    resolver: zodResolver(createTicketSchema),
    mode: "onTouched",
    defaultValues: {
      title: "",
      category: "" as unknown as CreateTicketFormValues["category"],
      area: "" as unknown as CreateTicketFormValues["area"],
      priority: "" as unknown as CreateTicketFormValues["priority"],
      description: "",
      requester: { name: "", email: "", area: "", userId: "" },
    },
  });

  const { create } = useCreateTicket();
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<{ display: string; sla: string } | null>(
    null,
  );

  const priority = watch("priority");

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const onSubmit = handleSubmit(async (values) => {
    const ticket = await create(values, files);
    setToast({ display: shortId(ticket.id), sla: ticket.slaLabel });
    reset();
    setFiles([]);
    setFileError(undefined);
  });

  const handleFilesChange = (e: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files ?? []);
    if (incoming.length === 0) return;
    const merged = [...files, ...incoming];
    const err = validateFiles(merged);
    if (err) {
      setFileError(formatFileError(err));
    } else {
      setFiles(merged);
      setFileError(undefined);
    }
    e.target.value = "";
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setFileError(undefined);
  };

  const onCancel = () => {
    reset();
    setFiles([]);
    setFileError(undefined);
  };

  const slaHint = slaHintFor(priority);

  return (
    <div className={styles.shell}>
      <header className={styles.globalNav}>
        <span className={styles.brand}>Ticke-T</span>
        <nav className={styles.navLinks} aria-label="Primary">
          <a href="#" aria-current="page">
            Crear ticket
          </a>
          <span className={styles.navDisabled}>Mis tickets</span>
          <span className={styles.navDisabled}>Cola</span>
        </nav>
        <span className={styles.navTag}>portal interno · beta</span>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.heroEyebrow}>Soporte interno</p>
          <h1 className={styles.heroTitle}>Crear ticket</h1>
          <p className={styles.heroLead}>
            Registra una solicitud para tu equipo responsable. Recibirás
            actualizaciones en tiempo real cuando un agente la tome.
          </p>
        </section>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <section className={styles.section}>
            <header className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Información básica</h2>
              <p className={styles.sectionLead}>
                Cuanto más claro el contexto, más rápido lo resolvemos.
              </p>
            </header>

            <div className={styles.grid}>
              <div className={styles.full}>
                <Field
                  label="Título"
                  placeholder="Resume el problema en una línea"
                  {...register("title")}
                  error={errors.title?.message}
                />
              </div>
              <Select
                label="Categoría"
                options={categoryOptions}
                placeholder="Elige..."
                {...register("category")}
                error={errors.category?.message}
              />
              <Select
                label="Área del ticket"
                options={areaOptions}
                placeholder="Elige..."
                {...register("area")}
                error={errors.area?.message}
              />
              <Select
                label="Prioridad"
                options={priorityOptions}
                placeholder="Elige..."
                hint={slaHint}
                {...register("priority")}
                error={errors.priority?.message}
              />
              <div />
              <div className={styles.full}>
                <Field
                  multiline
                  label="Descripción"
                  placeholder="Detalla qué pasó, desde cuándo y cualquier paso que ya intentaste."
                  rows={5}
                  {...register("description")}
                  error={errors.description?.message}
                />
              </div>
            </div>

            <SystemDerivedBox priority={priority} />
          </section>

          <section className={styles.section}>
            <header className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Solicitante</h2>
              <p className={styles.sectionLead}>
                Por ahora cargas tus datos manualmente. Cuando exista login, se
                completan automáticamente desde tu cuenta corporativa.
              </p>
            </header>

            <div className={styles.grid}>
              <Field
                label="Nombre"
                placeholder="Nombre y apellido"
                autoComplete="name"
                {...register("requester.name")}
                error={errors.requester?.name?.message}
              />
              <Field
                label="Correo"
                type="email"
                autoComplete="email"
                placeholder="usuario@empresa.com"
                {...register("requester.email")}
                error={errors.requester?.email?.message}
              />
              <Field
                label="Área del solicitante"
                placeholder="Ej. Finanzas"
                {...register("requester.area")}
                error={errors.requester?.area?.message}
              />
              <Field
                label="Id del usuario"
                placeholder="USR-001"
                {...register("requester.userId")}
                error={errors.requester?.userId?.message}
              />
            </div>
          </section>

          <section className={styles.section}>
            <header className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Adjuntos</h2>
              <p className={styles.sectionLead}>
                Máximo {MAX_ATTACHMENTS} archivos ·{" "}
                {MAX_FILE_BYTES / 1024 / 1024} MB por archivo.
              </p>
            </header>

            <div className={styles.banner} role="status">
              Los archivos se subirán a S3 cuando el backend esté disponible.
              Por ahora solo se registra la metadata (nombre, tamaño, tipo)
              junto con el ticket.
            </div>

            <label className={styles.fileDrop}>
              <input
                type="file"
                multiple
                hidden
                onChange={handleFilesChange}
                aria-label="Seleccionar archivos para adjuntar"
              />
              <span className={styles.fileDropAction}>Elegir archivos</span>
              <span className={styles.fileDropHint}>
                {files.length}/{MAX_ATTACHMENTS} adjuntos · haz click para
                seleccionar
              </span>
            </label>

            {fileError && (
              <p className={styles.fileError} role="alert">
                {fileError}
              </p>
            )}

            {files.length > 0 && (
              <ul className={styles.fileList}>
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className={styles.fileItem}>
                    <span className={styles.fileIcon} aria-hidden="true">
                      📎
                    </span>
                    <span className={styles.fileName}>{f.name}</span>
                    <span className={styles.fileSize}>
                      {formatBytes(f.size)}
                    </span>
                    <button
                      type="button"
                      className={styles.fileRemove}
                      onClick={() => removeFile(i)}
                      aria-label={`Quitar ${f.name}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <footer className={styles.footer}>
            <button type="button" className="btn-ghost" onClick={onCancel}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creando…" : "Crear ticket"}
            </button>
          </footer>
        </form>
      </main>

      {toast && (
        <div className={styles.toast} role="status" aria-live="polite">
          <strong>{toast.display}</strong> creado · SLA {toast.sla}
        </div>
      )}
    </div>
  );
}

function SystemDerivedBox({ priority }: { priority: string }) {
  const now = new Date();
  const validPriority = PRIORITY_VALUES.has(priority)
    ? (priority as TicketPriority)
    : null;

  if (!validPriority) {
    return (
      <aside className={styles.metaBox}>
        <span className={styles.metaTitle}>Metadata del sistema</span>
        <p className={styles.metaCaption}>
          Id, fecha de creación, SLA, fecha límite, estado y responsable se
          asignan automáticamente al crear el ticket. Elige una prioridad para
          ver el SLA estimado.
        </p>
      </aside>
    );
  }

  const { label, dueAt } = deriveSla(validPriority, now);

  return (
    <aside className={styles.metaBox}>
      <span className={styles.metaTitle}>Metadata del sistema</span>
      <dl className={styles.metaList}>
        <div className={styles.metaRow}>
          <dt>Id</dt>
          <dd>se genera al crear</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Estado inicial</dt>
          <dd>Abierto</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Responsable</dt>
          <dd>Sin asignar</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Fecha de creación</dt>
          <dd>{formatDateTime(now)}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>SLA</dt>
          <dd>{label}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Fecha límite</dt>
          <dd>{formatDateTime(dueAt)}</dd>
        </div>
      </dl>
    </aside>
  );
}

function slaHintFor(priority: string): string | undefined {
  if (!PRIORITY_VALUES.has(priority)) return undefined;
  const { label, dueAt } = deriveSla(priority as TicketPriority, new Date());
  return `SLA ${label} · vence ${formatDateTime(dueAt)}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("es-ES", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
