import { describe, expect, it } from "vitest";
import { buildTicketFromInput } from "./build-ticket-from-input";
import type { CreateTicketInput } from "./ticket";

const baseInput: CreateTicketInput = {
  title: "  No puedo acceder al sistema  ",
  category: "incidente",
  area: "IT",
  priority: "media",
  description:
    "  Desde las 09:00 me sale un error 401 al ingresar al portal de facturación.  ",
  requester: {
    name: "  Sebastián A.  ",
    email: "  Sebastian@Empresa.com  ",
    area: "Finanzas",
    userId: "USR-001",
  },
  attachments: [
    { id: "att-1", name: "captura.png", size: 1234, type: "image/png" },
  ],
};

describe("buildTicketFromInput", () => {
  it("genera un Ticket con todos los campos derivados", () => {
    const now = new Date("2026-05-22T12:00:00.000Z");
    const ticket = buildTicketFromInput(baseInput, now);

    expect(ticket.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(ticket.status).toBe("Abierto");
    expect(ticket.responsible).toBe("Sin asignar");
    expect(ticket.createdAt).toBe("2026-05-22T12:00:00.000Z");
    expect(ticket.dueAt).toBe("2026-05-22T16:00:00.000Z");
    expect(ticket.slaLabel).toBe("4 horas hábiles");
  });

  it("normaliza espacios en texto y baja-case el correo", () => {
    const ticket = buildTicketFromInput(baseInput, new Date());

    expect(ticket.title).toBe("No puedo acceder al sistema");
    expect(ticket.description.startsWith("Desde las 09:00")).toBe(true);
    expect(ticket.description.endsWith("facturación.")).toBe(true);
    expect(ticket.requester.name).toBe("Sebastián A.");
    expect(ticket.requester.email).toBe("sebastian@empresa.com");
  });

  it("preserva los adjuntos tal cual (solo metadata)", () => {
    const ticket = buildTicketFromInput(baseInput, new Date());
    expect(ticket.attachments).toEqual(baseInput.attachments);
  });

  it("emite ids distintos en llamadas sucesivas", () => {
    const a = buildTicketFromInput(baseInput, new Date());
    const b = buildTicketFromInput(baseInput, new Date());
    expect(a.id).not.toBe(b.id);
  });
});
