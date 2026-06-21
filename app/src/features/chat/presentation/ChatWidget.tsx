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
  // Arranca colapsado: evitamos abrir conexión WS antes de que el usuario
  // demuestre intención de chatear. También evita el flash de "sesión expirada"
  // que aparecía cuando el WS intentaba conectarse antes de que el JWT estuviera
  // disponible en el primer render post-login.
  const [collapsed, setCollapsed] = useState(true);
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

  // No abrir el WS si el ticket no tiene agente — no hay con quien chatear
  // y evitamos consumir una conexión inútil. El widget detecta esto desde
  // el shape del Ticket (responsible) y muestra una card de espera.
  const selectedTicketForCheck = activeTicketId;
  const ticketsList =
    ticketsState.kind === "ready" ? ticketsState.tickets : [];
  const matched =
    ticketsList.find((t) => t.id === selectedTicketForCheck) ?? null;
  const isMatchedAssigned =
    matched !== null && matched.responsible !== "Sin asignar";
  const isMatchedClosed = matched !== null && matched.status === "Cerrado";

  // Refetch inmediato al abrir el widget — útil tras un long minimize donde
  // el state local quedó stale. Sólo depende de `collapsed` (no de
  // `isMatchedAssigned`) para evitar loops: si dependiera de
  // isMatchedAssigned, cada vez que reload pone ticketsState en "loading"
  // y el bool oscila, este effect re-correría llamando reload incondicionalmente.
  useEffect(() => {
    if (collapsed) return;
    void reload();
  }, [collapsed, reload]);

  // Polling de la lista de tickets cuando el widget está abierto pero NO
  // hay una conversación activa con agente. Mantiene la lista al día con
  // cambios disparados desde otras pantallas (un agente toma el ticket →
  // cambia "responsable", o el watchdog marca uno vencido). 8s es balance
  // entre latencia de UX y costo de polling.
  //
  // IMPORTANTE: se pausa cuando hay agente asignado. El refetch puede
  // causar un flap momentáneo en `isMatchedAssigned` que desmonta el
  // ChatPane y pierde el texto que el usuario está escribiendo. Mientras
  // hay chat activo, el WS sincroniza mensajes en tiempo real.
  useEffect(() => {
    if (collapsed) return;
    if (isMatchedAssigned) return;
    const intervalId = window.setInterval(() => {
      void reload();
    }, 8000);
    return () => window.clearInterval(intervalId);
  }, [collapsed, reload, isMatchedAssigned]);
  // Cargamos history (y WS) para cualquier ticket con agente, incluso
  // cerrados — queremos mostrar la conversación archivada. La conexión WS
  // extra es benigna (no llegarán mensajes); el closedNotice bloquea
  // el input cuando corresponde.
  //
  // Si el widget está colapsado, NO abrimos WS — evita el flash de "sesión
  // expirada" pre-login y ahorra una conexión hasta que el usuario abra el chat.
  const chatTargetTicketId = collapsed
    ? null
    : isMatchedAssigned
      ? activeTicketId
      : null;
  const chat = useChat(chatTargetTicketId);

  // Si llega el evento ticket_closed por WS mientras estamos viendo el
  // chat, refetcheamos la lista para que el ticket cerrado salga del
  // listado activo (que filtra Cerrado).
  useEffect(() => {
    if (chat.ticketClosed) void reload();
  }, [chat.ticketClosed, reload]);

  // closedNotice combinado: persistente desde el ticket (status Cerrado) o
  // efímero desde el broadcast WS. El primero sobrevive a re-montajes.
  const persistedClosedNotice =
    isMatchedClosed && matched
      ? { closedByName: matched.responsible, closedAt: "" }
      : null;
  const liveClosedNotice = chat.ticketClosed
    ? {
        closedByName: chat.ticketClosed.closedByName,
        closedAt: chat.ticketClosed.closedAt,
      }
    : null;
  const closedNotice = persistedClosedNotice ?? liveClosedNotice;

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
        {showChat && isMatchedAssigned ? (
          <ChatPane
            viewerSub={status.user.username}
            messages={chat.messages}
            systemMessages={chat.systemMessages}
            connectionState={chat.connectionState}
            sendState={chat.sendState}
            historyLoading={chat.historyState.kind === "loading"}
            historyError={
              chat.historyState.kind === "error" ? chat.historyState.message : null
            }
            closedNotice={closedNotice}
            onSend={chat.send}
            onDismissSendError={chat.dismissSendError}
          />
        ) : showChat && !isMatchedAssigned ? (
          <WaitingForAgentMini onBack={handleBackToList} />
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

function WaitingForAgentMini({ onBack }: { onBack: () => void }) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon}>⏳</span>
      <p className={styles.emptyTitle}>Esperando agente</p>
      <p className={styles.emptyBody}>
        Aún nadie tomó este ticket. Cuando un agente lo tome, vas a poder
        chatear con él desde acá.
      </p>
      <button type="button" className={styles.emptyAction} onClick={onBack}>
        Volver a la lista
      </button>
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
