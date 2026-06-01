import { useCallback, useEffect, useMemo, useState } from "react";
import type { Ticket } from "../domain/ticket";
import type { TicketRepository } from "../domain/ticket-repository";
import { HttpTicketRepository } from "../infrastructure/http-ticket-repository";
import { HttpError } from "../../../shared/api/http-client";

const defaultRepo = new HttpTicketRepository();

type State =
  | { kind: "loading" }
  | { kind: "ready"; tickets: Ticket[] }
  | { kind: "error"; message: string };

export function useMyTickets(repo: TicketRepository = defaultRepo) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const tickets = await repo.listMyTickets();
      setState({ kind: "ready", tickets });
    } catch (err) {
      setState({ kind: "error", message: humanizeApiError(err) });
    }
  }, [repo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return useMemo(() => ({ state, reload }), [state, reload]);
}

function humanizeApiError(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 401) return "Tu sesión expiró. Vuelve a iniciar sesión.";
    if (err.status === 403) return "Tu rol no permite ver esta lista.";
    return `Error del servidor (${err.status}): ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return "Error inesperado al cargar los tickets.";
}
