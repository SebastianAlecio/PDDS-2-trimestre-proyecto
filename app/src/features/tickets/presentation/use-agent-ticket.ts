import { useCallback, useEffect, useMemo, useState } from "react";
import { HttpError } from "../../../shared/api/http-client";
import type { Ticket } from "../domain/ticket";
import type { TicketRepository } from "../domain/ticket-repository";
import { HttpTicketRepository } from "../infrastructure/http-ticket-repository";

const defaultRepo = new HttpTicketRepository();

type State =
  | { kind: "loading" }
  | { kind: "ready"; ticket: Ticket }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

export type CloseActionState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "error"; message: string };

// Hook que resuelve un ticket por id desde la cola del agente. Si el
// ticket no está en la cola (no está asignado al caller, fue cerrado y
// removido del backend, etc.), devuelve "not-found".
export function useAgentTicket(
  ticketId: string | null,
  repo: TicketRepository = defaultRepo,
) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [closeState, setCloseState] = useState<CloseActionState>({ kind: "idle" });

  const reload = useCallback(async () => {
    if (!ticketId) {
      setState({ kind: "loading" });
      return;
    }
    setState({ kind: "loading" });
    try {
      const data = await repo.listQueue();
      const all = [...data.unassigned, ...data.mine];
      const found = all.find((t) => t.id === ticketId);
      if (found) {
        setState({ kind: "ready", ticket: found });
      } else {
        setState({ kind: "not-found" });
      }
    } catch (err) {
      setState({ kind: "error", message: humanize(err) });
    }
  }, [ticketId, repo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const close = useCallback(async () => {
    if (state.kind !== "ready") return;
    setCloseState({ kind: "pending" });
    try {
      const updated = await repo.closeTicket(state.ticket.id);
      setCloseState({ kind: "idle" });
      setState({ kind: "ready", ticket: updated });
    } catch (err) {
      setCloseState({ kind: "error", message: humanize(err) });
    }
  }, [repo, state]);

  return useMemo(
    () => ({ state, closeState, reload, close }),
    [state, closeState, reload, close],
  );
}

function humanize(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 401) return "Tu sesión expiró. Vuelve a iniciar sesión.";
    if (err.status === 403) return "No tienes acceso a este ticket.";
    if (err.status === 404) return "El ticket ya no existe.";
    return `Error del servidor (${err.status}): ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return "Error inesperado.";
}
