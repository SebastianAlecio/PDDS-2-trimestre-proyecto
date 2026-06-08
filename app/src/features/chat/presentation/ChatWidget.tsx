import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../shared/auth/use-auth";
import { ChatPane } from "./ChatPane";
import { useChat } from "./use-chat";
import { getActiveTicketId } from "./chat-session-storage";
import styles from "./ChatWidget.module.css";

// Widget flotante del colaborador. Renderiza por encima de cualquier
// página, anclado a bottom-right, y SIEMPRE visible para colaboradores
// signed-in. Solo se puede minimizar — no hay "cerrar" destructivo
// (perderia el ticket activo y dejaria al usuario sin acceso al chat).
// Si no hay ticket activo en sessionStorage muestra un placeholder
// invitando a crear uno.
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

  return (
    <div className={styles.frame}>
      <header className={styles.header}>
        <div className={styles.title}>
          <strong>Chat de soporte</strong>
          <small>
            {activeTicketId
              ? `Ticket #${activeTicketId.slice(0, 8)}`
              : "Sin conversación activa"}
          </small>
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
        {activeTicketId ? (
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
          <EmptyState />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon}>💬</span>
      <p className={styles.emptyTitle}>Sin conversación activa</p>
      <p className={styles.emptyBody}>
        Cuando crees un ticket, el chat con el agente que lo tome se abrirá
        acá automáticamente.
      </p>
      <Link to="/crear" className={styles.emptyAction}>
        Crear ticket
      </Link>
    </div>
  );
}
