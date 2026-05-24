import { z } from "zod";
import {
  TICKET_AREAS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
} from "../domain/ticket";

export const MAX_ATTACHMENTS = 10;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const ALLOWED_MIME = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export const createTicketSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, "Mínimo 5 caracteres")
    .max(120, "Máximo 120 caracteres"),
  category: z.enum(TICKET_CATEGORIES as [string, ...string[]], {
    message: "Selecciona una categoría",
  }),
  area: z.enum(TICKET_AREAS as [string, ...string[]], {
    message: "Selecciona un área",
  }),
  priority: z.enum(TICKET_PRIORITIES as [string, ...string[]], {
    message: "Selecciona una prioridad",
  }),
  description: z
    .string()
    .trim()
    .min(20, "Mínimo 20 caracteres")
    .max(2000, "Máximo 2000 caracteres"),
  requester: z.object({
    name: z.string().trim().min(2, "Nombre requerido").max(80),
    email: z.string().trim().toLowerCase().email("Correo inválido"),
    area: z.string().trim().min(2, "Área requerida").max(80),
    userId: z.string().trim().min(1, "Id de usuario requerido").max(40),
  }),
});

export type CreateTicketFormValues = z.infer<typeof createTicketSchema>;

export type FileValidationError =
  | { kind: "too-many"; max: number }
  | { kind: "too-large"; name: string; sizeMb: number; maxMb: number }
  | { kind: "type-not-allowed"; name: string; type: string };

export function validateFiles(files: File[]): FileValidationError | null {
  if (files.length > MAX_ATTACHMENTS) {
    return { kind: "too-many", max: MAX_ATTACHMENTS };
  }
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      return {
        kind: "too-large",
        name: f.name,
        sizeMb: f.size / (1024 * 1024),
        maxMb: MAX_FILE_BYTES / (1024 * 1024),
      };
    }
    if (f.type && !ALLOWED_MIME.has(f.type)) {
      return { kind: "type-not-allowed", name: f.name, type: f.type };
    }
  }
  return null;
}

export function formatFileError(err: FileValidationError): string {
  switch (err.kind) {
    case "too-many":
      return `Máximo ${err.max} archivos.`;
    case "too-large":
      return `"${err.name}" pesa ${err.sizeMb.toFixed(1)} MB. El máximo es ${err.maxMb} MB por archivo.`;
    case "type-not-allowed":
      return `"${err.name}" (${err.type || "desconocido"}) no es un tipo permitido.`;
  }
}
