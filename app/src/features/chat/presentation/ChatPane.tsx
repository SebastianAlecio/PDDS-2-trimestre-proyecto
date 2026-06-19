import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type {
  ChatConnectionState,
} from "../domain/chat-repository";
import type { ChatMessage } from "../domain/message";
import type { ChatSystemMessage, SendState } from "./use-chat";
import { MessageAttachmentView } from "./MessageAttachmentView";
import styles from "./ChatPane.module.css";

type Props = {
  // Identidad del viewer — para alinear los burbujas (mine vs theirs).
  viewerSub: string;
  messages: ChatMessage[];
  // Eventos del ticket (escalado, etc.) que se renderizan inline en el
  // feed como banners centrados. Vacío si nunca pasó nada.
  systemMessages?: ChatSystemMessage[];
  connectionState: ChatConnectionState;
  sendState: SendState;
  // Si está presente, deshabilita el input y muestra banner read-only.
  closedNotice?: { closedByName: string; closedAt: string } | null;
  historyLoading?: boolean;
  historyError?: string | null;
  onSend: (input: { body: string; files: File[] }) => void;
  onDismissSendError: () => void;
};

// Item del feed combinado: mensaje regular o banner de sistema. Lo
// armamos en el render ordenando por createdAt para que los banners
// queden entre los mensajes que los rodean cronológicamente.
type FeedItem =
  | { kind: "msg"; key: string; createdAt: string; message: ChatMessage }
  | { kind: "sys"; key: string; createdAt: string; system: ChatSystemMessage };

export function ChatPane({
  viewerSub,
  messages,
  systemMessages = [],
  connectionState,
  sendState,
  closedNotice = null,
  historyLoading = false,
  historyError = null,
  onSend,
  onDismissSendError,
}: Props) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Feed combinado: mensajes + system events ordenados cronológicamente.
  // Si createdAt es vacío o inválido, lo dejamos al final (case raro:
  // mensaje recién enviado por WS sin server timestamp todavía).
  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [
      ...messages.map<FeedItem>((m) => ({
        kind: "msg",
        key: `msg-${m.messageId}`,
        createdAt: m.createdAt,
        message: m,
      })),
      ...systemMessages.map<FeedItem>((s) => ({
        kind: "sys",
        key: s.id,
        createdAt: s.createdAt,
        system: s,
      })),
    ];
    items.sort((a, b) => {
      const ta = Date.parse(a.createdAt);
      const tb = Date.parse(b.createdAt);
      const va = Number.isNaN(ta) ? Number.POSITIVE_INFINITY : ta;
      const vb = Number.isNaN(tb) ? Number.POSITIVE_INFINITY : tb;
      return va - vb;
    });
    return items;
  }, [messages, systemMessages]);

  // Auto-scroll al bottom cuando llega un item nuevo (mensaje o evento).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [feed.length]);

  const isClosed = closedNotice !== null;
  const canSend = !isClosed && connectionState === "open" && sendState.kind !== "pending";

  const trySend = () => {
    if (!canSend) return;
    onSend({ body, files });
    setBody("");
    setFiles([]);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    trySend();
  };

  // Enter envia, Shift+Enter inserta salto de linea (convencion estandar
  // de chats — Slack, WhatsApp Web, etc.). IME composition (acentos en
  // teclados muertos, IME asiaticos) usa Enter para confirmar — no
  // interferimos en ese caso.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.nativeEvent.isComposing) return;
    e.preventDefault();
    trySend();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list) return;
    setFiles(Array.from(list));
  };

  return (
    <div className={styles.pane}>
      <div className={styles.statusBar}>
        <ConnectionBadge state={connectionState} />
        {isClosed && (
          <span className={styles.closedBadge}>
            Ticket cerrado por {closedNotice.closedByName}
          </span>
        )}
      </div>

      <div ref={listRef} className={styles.list}>
        {historyLoading && (
          <div className={styles.placeholder}>Cargando historial…</div>
        )}
        {historyError && (
          <div className={styles.errorRow}>{historyError}</div>
        )}
        {!historyLoading && !historyError && feed.length === 0 && (
          <div className={styles.placeholder}>
            Todavía no hay mensajes. Escribe para empezar la conversación.
          </div>
        )}
        {feed.map((item) =>
          item.kind === "msg" ? (
            <MessageRow
              key={item.key}
              message={item.message}
              isMine={item.message.authorId === viewerSub}
            />
          ) : (
            <SystemRow key={item.key} system={item.system} />
          ),
        )}
      </div>

      {sendState.kind === "error" && (
        <div className={styles.sendError}>
          <span>{sendState.message}</span>
          <button
            type="button"
            className={styles.dismiss}
            onClick={onDismissSendError}
          >
            Cerrar
          </button>
        </div>
      )}

      <form className={styles.form} onSubmit={handleSubmit}>
        <textarea
          className={styles.textarea}
          placeholder={
            isClosed
              ? "Este ticket está cerrado."
              : connectionState === "open"
              ? "Escribe un mensaje…"
              : "Conectando al chat…"
          }
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isClosed}
          rows={2}
        />
        <div className={styles.actions}>
          <label className={styles.fileLabel}>
            Adjuntar
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              disabled={isClosed}
              className={styles.fileInput}
            />
          </label>
          {files.length > 0 && (
            <span className={styles.fileCount}>
              {files.length} archivo{files.length === 1 ? "" : "s"}
            </span>
          )}
          <button
            type="submit"
            className={styles.sendButton}
            disabled={!canSend}
          >
            {sendState.kind === "pending" ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ConnectionBadge({ state }: { state: ChatConnectionState }) {
  const label = labelFor(state);
  return (
    <span className={`${styles.connBadge} ${styles[`conn_${state}`] ?? ""}`}>
      {label}
    </span>
  );
}

function labelFor(state: ChatConnectionState): string {
  switch (state) {
    case "idle":
      return "Inactivo";
    case "connecting":
      return "Conectando…";
    case "open":
      return "Conectado";
    case "reconnecting":
      return "Reconectando…";
    case "closed":
      return "Desconectado";
  }
}

function MessageRow({ message, isMine }: { message: ChatMessage; isMine: boolean }) {
  return (
    <div className={`${styles.row} ${isMine ? styles.rowMine : styles.rowTheirs}`}>
      {!isMine && (
        <div className={styles.author}>
          {message.authorName}
          <span className={styles.authorRole}> · {message.authorRole}</span>
        </div>
      )}
      <div className={`${styles.bubble} ${isMine ? styles.bubbleMine : styles.bubbleTheirs}`}>
        {message.body && <p className={styles.body}>{message.body}</p>}
        {message.attachments.length > 0 && (
          <div className={styles.attachments}>
            {message.attachments.map((a) => (
              <MessageAttachmentView key={a.key} attachment={a} />
            ))}
          </div>
        )}
      </div>
      <div className={styles.timestamp}>{formatTime(message.createdAt)}</div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// Banner de evento del sistema. Por ahora soporta "escalated"; visual
// distinto al chat regular: centrado, gris claro, sin avatar/role/burbuja
// — comunica algo que el ticket hizo, no algo que dijo una persona.
function SystemRow({ system }: { system: ChatSystemMessage }) {
  if (system.kind === "escalated") {
    return (
      <div className={styles.systemRow} role="status">
        <div className={styles.systemBubble}>
          <span className={styles.systemIcon} aria-hidden="true">⬆</span>
          <div className={styles.systemBody}>
            <p className={styles.systemTitle}>
              Este ticket fue escalado a un agente especializado N2 por{" "}
              <strong>{system.byName}</strong>
            </p>
            {system.reason && (
              <p className={styles.systemReason}>“{system.reason}”</p>
            )}
            {system.createdAt && (
              <p className={styles.systemTimestamp}>
                {formatDateTime(system.createdAt)}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }
  return null;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
