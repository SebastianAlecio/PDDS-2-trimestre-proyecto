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
  const [escalateState, setEscalateState] = useState<ActionState>({ kind: "idle" });

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
      // Historial son tickets que YO cerré — siempre fueron míos, así que
      // `isAssignedToMe: true`. El AgentTicketPage usa ese flag para
      // mostrar el chat (read-only en cerrados) y NO el botón "Tomar".
      const archived = data.historial.find((t) => t.id === ticketId);
      if (archived) {
        setState({ kind: "ready", ticket: archived, isAssignedToMe: true });
        return;
      }
      // Cola N2 — tickets escalados por algún N1, esperando que un N2 los
      // tome. Solo aparecen acá cuando el caller es agente-n2.
      // `isAssignedToMe: false` para que se muestre el botón "Tomar".
      const escalated = data.escalated.find((t) => t.id === ticketId);
      if (escalated) {
        setState({ kind: "ready", ticket: escalated, isAssignedToMe: false });
        return;
      }
      // Escalados por mí (N1) — tickets que el N1 escaló y aún no fueron
      // cerrados por un N2. Modo read-only: el N1 puede ver el estado
      // actual y el chat archivado pero no puede tomar acciones.
      const escalatedByMe = data.escalated_by_me.find((t) => t.id === ticketId);
      if (escalatedByMe) {
        setState({ kind: "ready", ticket: escalatedByMe, isAssignedToMe: false });
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

  // Escala el ticket a la cola N2. Tras el PUT exitoso, el ticket deja
  // de pertenecer al agente N1 actual — refetcheamos la cola para que el
  // panel transicione a "not-found" (ya no aparece en mis tickets) y el
  // usuario pueda volver a /cola. Si lo dejamos en "ready" el panel
  // mostraría datos stale (responsable = el N1 anterior).
  const escalate = useCallback(
    async (razon: string) => {
      if (state.kind !== "ready") return;
      setEscalateState({ kind: "pending" });
      try {
        await repo.escalateTicket(state.ticket.id, razon);
        setEscalateState({ kind: "idle" });
        await reload();
      } catch (err) {
        setEscalateState({ kind: "error", message: humanize(err) });
      }
    },
    [repo, state, reload],
  );

  return useMemo(
    () => ({
      state,
      assignState,
      closeState,
      escalateState,
      reload,
      assign,
      close,
      escalate,
    }),
    [
      state,
      assignState,
      closeState,
      escalateState,
      reload,
      assign,
      close,
      escalate,
    ],
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
