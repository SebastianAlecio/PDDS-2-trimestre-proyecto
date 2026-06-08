import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../shared/auth/use-auth";
import { useMyTickets } from "../../tickets/presentation/use-my-tickets";
import { shortId } from "../../tickets/presentation/use-create-ticket";
import type { Ticket } from "../../tickets/domain/ticket";
import { ChatPane } from "./ChatPane";
import { useChat } from "./use-chat";
import {
  getActiveTicketId,
  setActiveTicketId,
} from "./chat-session-storage";
import styles from "./ChatWidget.module.css";

// Widget flotante del colaborador. Estados:
//   - Sin tickets activos → empty state con CTA "Crear ticket"
//   - Con tickets activos y NINGUNO seleccionado → lista clickeable
//   - Con ticket seleccionado → chat de ese ticket + boton "Volver a la lista"
// Siempre visible para colaboradores signed-in; solo se puede minimizar.
export function ChatWidget() {
  const { status } = useAuth();
  const [activeTicketId, setActiveTicketIdLocal] = useState<string | null>(() => getActiveTicketId());
  const [collapsed, setCollapsed] = useState(false);
  const { state: ticketsState, reload } = useMyTickets();

  useEffect(() => {
    const sync = () => setActiveTicketIdLocal(getActiveTicketId());
    window.addEventListener("ticke-t:active-ticket-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("ticke-t:active-ticket-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const chat = useChat(activeTicketId);

  if (status.state !== "signed-in") return null;
  if (status.user.primaryRole !== "colaborador") return null;

  if (collapsed) {
    return (
      <button
        type="button"
        className={styles.collapsedButton}
        onClick={() => setCollapsed(false)}
        aria-label="Abrir chat de soporte"
      >
        💬 Chat de soporte
      </button>
    );
  }

  // Tickets activos del colaborador (excluye cerrados).
  const activeTickets =
    ticketsState.kind === "ready"
      ? ticketsState.tickets.filter((t) => t.status !== "Cerrado")
      : [];

  const selectedTicket =
    activeTickets.find((t) => t.id === activeTicketId) ?? null;

  const handleSelectTicket = (ticketId: string) => {
    setActiveTicketId(ticketId);
    setActiveTicketIdLocal(ticketId);
  };

  const handleBackToList = () => {
    // No limpiamos sessionStorage — solo cambiamos la vista del widget.
    setActiveTicketIdLocal(null);
  };

  const showChat = selectedTicket !== null;

  return (
    <div className={styles.frame}>
      <header className={styles.header}>
        <div className={styles.title}>
          {showChat ? (
            <>
              <button
                type="button"
                className={styles.backInlineBtn}
                onClick={handleBackToList}
                aria-label="Volver a la lista de tickets"
                title="Volver a la lista"
              >
                ←
              </button>
              <div className={styles.titleText}>
                <strong>{selectedTicket.title}</strong>
                <small>{shortId(selectedTicket.id)} · {selectedTicket.status}</small>
              </div>
            </>
          ) : (
            <div className={styles.titleText}>
              <strong>Chat de soporte</strong>
              <small>
                {activeTickets.length > 0
                  ? `${activeTickets.length} ticket${activeTickets.length === 1 ? "" : "s"} activo${activeTickets.length === 1 ? "" : "s"}`
                  : "Sin tickets activos"}
              </small>
            </div>
          )}
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setCollapsed(true)}
            aria-label="Minimizar chat"
            title="Minimizar"
          >
            ⤵
          </button>
        </div>
      </header>
      <div className={styles.body}>
        {showChat ? (
          <ChatPane
            viewerSub={status.user.username}
            messages={chat.messages}
            connectionState={chat.connectionState}
            sendState={chat.sendState}
            historyLoading={chat.historyState.kind === "loading"}
            historyError={
              chat.historyState.kind === "error" ? chat.historyState.message : null
            }
            closedNotice={
              chat.ticketClosed
                ? {
                    closedByName: chat.ticketClosed.closedByName,
                    closedAt: chat.ticketClosed.closedAt,
                  }
                : null
            }
            onSend={chat.send}
            onDismissSendError={chat.dismissSendError}
          />
        ) : (
          <TicketsList
            state={ticketsState.kind}
            tickets={activeTickets}
            errorMessage={ticketsState.kind === "error" ? ticketsState.message : null}
            onSelect={handleSelectTicket}
            onReload={() => void reload()}
          />
        )}
      </div>
    </div>
  );
}

type TicketsListState = "loading" | "ready" | "error";

function TicketsList({
  state,
  tickets,
  errorMessage,
  onSelect,
  onReload,
}: {
  state: TicketsListState;
  tickets: Ticket[];
  errorMessage: string | null;
  onSelect: (ticketId: string) => void;
  onReload: () => void;
}) {
  if (state === "loading") {
    return <div className={styles.listPlaceholder}>Cargando tickets…</div>;
  }
  if (state === "error") {
    return (
      <div className={styles.listError}>
        <p>{errorMessage}</p>
        <button type="button" className={styles.reloadBtn} onClick={onReload}>
          Reintentar
        </button>
      </div>
    );
  }
  if (tickets.length === 0) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon}>💬</span>
        <p className={styles.emptyTitle}>Sin conversación activa</p>
        <p className={styles.emptyBody}>
          Cuando crees un ticket, el chat con el agente que lo tome aparecerá
          acá.
        </p>
        <Link to="/crear" className={styles.emptyAction}>
          Crear ticket
        </Link>
      </div>
    );
  }
  return (
    <div className={styles.ticketsList}>
      {tickets.map((t) => {
        const assigned = t.responsible !== "Sin asignar";
        return (
          <button
            key={t.id}
            type="button"
            className={styles.ticketRow}
            onClick={() => onSelect(t.id)}
          >
            <div className={styles.ticketRowMain}>
              <strong className={styles.ticketRowTitle}>{t.title}</strong>
              <span className={styles.ticketRowMeta}>
                {shortId(t.id)} · {t.status}
              </span>
            </div>
            <span
              className={`${styles.ticketRowBadge} ${assigned ? styles.badgeAssigned : styles.badgeWaiting}`}
            >
              {assigned ? `Con ${t.responsible}` : "Sin agente"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
