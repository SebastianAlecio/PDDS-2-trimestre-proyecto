import { useCallback, useEffect, useMemo, useState } from "react";
import { HttpError } from "../../../shared/api/http-client";
import type { QueueData, TicketRepository } from "../domain/ticket-repository";
import { HttpTicketRepository } from "../infrastructure/http-ticket-repository";

const defaultRepo = new HttpTicketRepository();

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: QueueData }
  | { kind: "error"; message: string };

type AssignState =
  | { kind: "idle" }
  | { kind: "pending"; ticketId: string }
  | { kind: "error"; ticketId: string; message: string };

export type CloseState =
  | { kind: "idle" }
  | { kind: "pending"; ticketId: string }
  | { kind: "error"; ticketId: string; message: string };

export function useQueue(repo: TicketRepository = defaultRepo) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [assignState, setAssignState] = useState<AssignState>({ kind: "idle" });
  const [closeState, setCloseState] = useState<CloseState>({ kind: "idle" });

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const data = await repo.listQueue();
      setState({ kind: "ready", data });
    } catch (err) {
      setState({ kind: "error", message: humanizeApiError(err) });
    }
  }, [repo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const assign = useCallback(
    async (ticketId: string) => {
      setAssignState({ kind: "pending", ticketId });
      try {
        await repo.assignToMe(ticketId);
        setAssignState({ kind: "idle" });
        await reload();
      } catch (err) {
        setAssignState({
          kind: "error",
          ticketId,
          message: humanizeApiError(err),
        });
      }
    },
    [repo, reload],
  );

  const close = useCallback(
    async (ticketId: string) => {
      setCloseState({ kind: "pending", ticketId });
      try {
        await repo.closeTicket(ticketId);
        setCloseState({ kind: "idle" });
        await reload();
      } catch (err) {
        setCloseState({
          kind: "error",
          ticketId,
          message: humanizeApiError(err),
        });
      }
    },
    [repo, reload],
  );

  return useMemo(
    () => ({ state, assignState, closeState, reload, assign, close }),
    [state, assignState, closeState, reload, assign, close],
  );
}

function humanizeApiError(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 401) return "Tu sesión expiró. Vuelve a iniciar sesión.";
    if (err.status === 403) return "Tu rol no permite ver o cerrar este ticket.";
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
  return "Error inesperado al operar sobre la cola.";
}
