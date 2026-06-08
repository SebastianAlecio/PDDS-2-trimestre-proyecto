import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../shared/auth/use-auth";
import { ChatPane } from "./ChatPane";
import { useChat, type ChatTicketClosedSignal } from "./use-chat";
import {
  clearActiveTicketId,
  getActiveTicketId,
} from "./chat-session-storage";
import styles from "./ChatWidget.module.css";

// Widget flotante del colaborador. Renderiza por encima de cualquier
// página, anclado a bottom-right. Se abre automáticamente cuando hay
// un ticket activo en sessionStorage y se cierra al recibir el evento
// ticket_closed (o cuando el usuario clickea cerrar).
export function ChatWidget() {
  const { status } = useAuth();
  const [activeTicketId, setActiveTicketId] = useState<string | null>(() => getActiveTicketId());
  const [collapsed, setCollapsed] = useState(false);

  // Re-leer sessionStorage cuando la página dispare el evento custom
  // (lo hace CreateTicketPage al crear ticket).
  useEffect(() => {
    const reload = () => setActiveTicketId(getActiveTicketId());
    window.addEventListener("ticke-t:active-ticket-changed", reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener("ticke-t:active-ticket-changed", reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  const onTicketClosed = useCallback((_signal: ChatTicketClosedSignal) => {
    // El widget no se auto-cierra — mostramos el banner read-only y
    // dejamos que el usuario lea el chat. Tiene que clickear "Cerrar"
    // para limpiar la sessionStorage y deshacerse del widget.
  }, []);

  const chat = useChat(activeTicketId, { onTicketClosed });

  const dismissWidget = () => {
    clearActiveTicketId();
    setActiveTicketId(null);
    setCollapsed(false);
  };

  // No mostrar el widget si el usuario no es colaborador signed-in o
  // si no hay ticket activo.
  if (status.state !== "signed-in") return null;
  if (status.user.primaryRole !== "colaborador") return null;
  if (!activeTicketId) return null;

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

  return (
    <div className={styles.frame}>
      <header className={styles.header}>
        <div className={styles.title}>
          <strong>Chat de soporte</strong>
          <small>Ticket #{activeTicketId.slice(0, 8)}</small>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setCollapsed(true)}
            aria-label="Minimizar chat"
          >
            ⤵
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={dismissWidget}
            aria-label="Cerrar chat"
          >
            ✕
          </button>
        </div>
      </header>
      <div className={styles.body}>
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
      </div>
    </div>
  );
}
