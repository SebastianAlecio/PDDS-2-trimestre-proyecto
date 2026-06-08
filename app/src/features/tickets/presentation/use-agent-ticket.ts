import { useCallback, useEffect, useMemo, useState } from "react";
import { HttpError } from "../../../shared/api/http-client";
import type { Ticket } from "../domain/ticket";
import type { TicketRepository } from "../domain/ticket-repository";
import { HttpTicketRepository } from "../infrastructure/http-ticket-repository";

const defaultRepo = new HttpTicketRepository();

type State =
  | { kind: "loading" }
  | { kind: "ready"; ticket: Ticket; isAssignedToMe: boolean }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

export type ActionState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "error"; message: string };

// Hook que resuelve un ticket por id desde la cola del agente y expone
// las acciones disponibles (tomar, cerrar). isAssignedToMe distingue
// entre "estoy viendo un ticket de otra persona / sin tomar" vs "es mio
// y puedo cerrarlo / chatear".
export function useAgentTicket(
  ticketId: string | null,
  repo: TicketRepository = defaultRepo,
) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [assignState, setAssignState] = useState<ActionState>({ kind: "idle" });
  const [closeState, setCloseState] = useState<ActionState>({ kind: "idle" });

  const reload = useCallback(async () => {
    if (!ticketId) {
      setState({ kind: "loading" });
      return;
    }
    setState({ kind: "loading" });
    try {
      const data = await repo.listQueue();
      const mine = data.mine.find((t) => t.id === ticketId);
      if (mine) {
        setState({ kind: "ready", ticket: mine, isAssignedToMe: true });
        return;
      }
      const unassigned = data.unassigned.find((t) => t.id === ticketId);
      if (unassigned) {
        setState({ kind: "ready", ticket: unassigned, isAssignedToMe: false });
        return;
      }
      setState({ kind: "not-found" });
    } catch (err) {
      setState({ kind: "error", message: humanize(err) });
    }
  }, [ticketId, repo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const assign = useCallback(async () => {
    if (state.kind !== "ready") return;
    setAssignState({ kind: "pending" });
    try {
      const updated = await repo.assignToMe(state.ticket.id);
      setAssignState({ kind: "idle" });
      // Tras tomarlo somos los asignados — actualizamos el state local
      // sin refetch para evitar el flash de loading.
      setState({ kind: "ready", ticket: updated, isAssignedToMe: true });
    } catch (err) {
      setAssignState({ kind: "error", message: humanize(err) });
    }
  }, [repo, state]);

  const close = useCallback(async () => {
    if (state.kind !== "ready") return;
    setCloseState({ kind: "pending" });
    try {
      const updated = await repo.closeTicket(state.ticket.id);
      setCloseState({ kind: "idle" });
      setState({ kind: "ready", ticket: updated, isAssignedToMe: true });
    } catch (err) {
      setCloseState({ kind: "error", message: humanize(err) });
    }
  }, [repo, state]);

  return useMemo(
    () => ({ state, assignState, closeState, reload, assign, close }),
    [state, assignState, closeState, reload, assign, close],
  );
}

function humanize(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 401) return "Tu sesión expiró. Vuelve a iniciar sesión.";
    if (err.status === 403) return "No tienes acceso a este ticket.";
    if (err.status === 404) return "El ticket ya no existe.";
    if (err.status === 409) {
      const details = err.details as { responsable?: string } | undefined;
      const who = details?.responsable;
      return who
        ? `Ese ticket ya fue tomado por ${who}.`
        : "Ese ticket ya fue tomado por otro agente.";
    }
    return `Error del servidor (${err.status}): ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return "Error inesperado.";
}
