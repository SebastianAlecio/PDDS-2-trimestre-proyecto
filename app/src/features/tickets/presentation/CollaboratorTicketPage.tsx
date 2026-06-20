import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { AppHeader } from "../../../shared/ui/AppHeader";
import { useAuth } from "../../../shared/auth/use-auth";
import { ChatPane } from "../../chat/presentation/ChatPane";
import { useChat } from "../../chat/presentation/use-chat";
import { setActiveTicketId } from "../../chat/presentation/chat-session-storage";
import { TicketAttachmentsView } from "./TicketAttachmentsView";
import { TicketHistoryView } from "./TicketHistoryView";
import { useMyTickets } from "./use-my-tickets";
import { shortId } from "./use-create-ticket";
import styles from "./CollaboratorTicketPage.module.css";

// Página por-ticket del colaborador. Mirror estructural de AgentTicketPage
// pero con un panel de estado de asignación distinto: si nadie tomó el
// ticket todavía mostramos un banner de espera en lugar del chat (porque
// no hay con quien hablar).
export function CollaboratorTicketPage() {
  const params = useParams<{ id: string }>();
  const ticketId = params.id ?? null;
  const { status } = useAuth();
  const { state } = useMyTickets();

  const ticket =
    state.kind === "ready"
      ? state.tickets.find((t) => t.id === ticketId) ?? null
      : null;

  // Sincronizá el "active ticket" del widget con el ticket que estamos
  // viendo — así si el usuario minimiza la página o navega, el widget
  // sigue apuntando a este ticket.
  useEffect(() => {
    if (ticketId) setActiveTicketId(ticketId);
  }, [ticketId]);

  const isAssigned =
    ticket !== null && ticket.responsible !== "Sin asignar";
  const isClosed = ticket !== null && ticket.status === "Cerrado";

  // Cargamos history + WS para cualquier ticket con agente, incluso
  // cerrados — queremos mostrar la conversación archivada. El closedNotice
  // (derivado abajo) bloquea el input cuando el ticket ya está cerrado.
  const chat = useChat(isAssigned ? ticketId : null);

  // closedNotice combinado: persistente desde el status del ticket o
  // efímero desde el evento WS. El persistente sobrevive a navegaciones.
  const closedNotice =
    isClosed && ticket
      ? { closedByName: ticket.responsible, closedAt: "" }
      : chat.ticketClosed
        ? {
            closedByName: chat.ticketClosed.closedByName,
            closedAt: chat.ticketClosed.closedAt,
          }
        : null;

  const viewerSub =
    status.state === "signed-in" ? status.user.username : "";

  return (
    <div className={styles.shell}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.backRow}>
          <Link to="/mis-tickets" className={styles.backLink}>
            ← Volver a mis tickets
          </Link>
        </div>

        {state.kind === "loading" && (
          <p className={styles.note}>Cargando ticket…</p>
        )}

        {state.kind === "error" && (
          <p className={styles.errorBox} role="alert">
            {state.message}
          </p>
        )}

        {state.kind === "ready" && !ticket && (
          <div className={styles.notFound}>
            <h2>Ticket no encontrado</h2>
            <p>
              No tienes un ticket con ese identificador. Puede que haya sido
              cerrado o que la URL esté mal copiada.
            </p>
          </div>
        )}

        {ticket && (
          <div className={styles.layout}>
            <section className={styles.detailsCol}>
              <header className={styles.detailsHeader}>
                <div>
                  <p className={styles.ticketId}>{shortId(ticket.id)}</p>
                  <h1 className={styles.ticketTitle}>{ticket.title}</h1>
                </div>
                <span
                  className={`${styles.statusTag} ${ticket.status === "Cerrado" ? styles.statusClosed : styles.statusOpen}`}
                >
                  {ticket.status}
                </span>
              </header>

              <AssignmentBanner
                isAssigned={isAssigned}
                responsible={ticket.responsible}
              />

              <dl className={styles.metaGrid}>
                <div className={styles.metaItem}>
                  <dt>Categoría</dt>
                  <dd>{ticket.category}</dd>
                </div>
                <div className={styles.metaItem}>
                  <dt>Área</dt>
                  <dd>{ticket.area}</dd>
                </div>
                <div className={styles.metaItem}>
                  <dt>Prioridad</dt>
                  <dd>{ticket.priority}</dd>
                </div>
                <div className={styles.metaItem}>
                  <dt>SLA</dt>
                  <dd>{ticket.slaLabel}</dd>
                </div>
              </dl>

              <section className={styles.description}>
                <h3>Descripción</h3>
                <p>{ticket.description}</p>
              </section>

              {ticket.attachments.length > 0 && (
                <section className={styles.description}>
                  <h3>Adjuntos del ticket</h3>
                  <TicketAttachmentsView attachments={ticket.attachments} />
                </section>
              )}

              <TicketHistoryView
                ticketId={ticket.id}
                ticketCreatedAt={ticket.createdAt}
                ticketRequesterName={ticket.requester.name}
              />
            </section>

            <section className={styles.chatCol}>
              {isAssigned ? (
                <ChatPane
                  viewerSub={viewerSub}
                  messages={chat.messages}
                  systemMessages={chat.systemMessages}
                  connectionState={chat.connectionState}
                  sendState={chat.sendState}
                  historyLoading={chat.historyState.kind === "loading"}
                  historyError={
                    chat.historyState.kind === "error"
                      ? chat.historyState.message
                      : null
                  }
                  closedNotice={closedNotice}
                  onSend={chat.send}
                  onDismissSendError={chat.dismissSendError}
                />
              ) : (
                <WaitingForAgentCard />
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function AssignmentBanner({
  isAssigned,
  responsible,
}: {
  isAssigned: boolean;
  responsible: string;
}) {
  if (isAssigned) {
    return (
      <div className={`${styles.banner} ${styles.bannerAssigned}`}>
        <strong>Atendido por {responsible}</strong>
        <small>Puedes chatear directamente con tu agente.</small>
      </div>
    );
  }
  return (
    <div className={`${styles.banner} ${styles.bannerWaiting}`}>
      <strong>Esperando que un agente tome tu ticket</strong>
      <small>El chat se habilitará cuando alguien lo tome.</small>
    </div>
  );
}

function WaitingForAgentCard() {
  return (
    <div className={styles.waitingCard}>
      <span className={styles.waitingIcon}>⏳</span>
      <h3>Aún sin agente</h3>
      <p>
        Cuando un agente tome tu ticket, este panel se convertirá en el chat
        para comunicarte directamente con esa persona. Mientras tanto, podes
        seguir trabajando — vamos a notificarte cuando haya novedades.
      </p>
    </div>
  );
}
