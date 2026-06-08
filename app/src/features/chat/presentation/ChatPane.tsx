import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  ChatConnectionState,
} from "../domain/chat-repository";
import type { ChatMessage } from "../domain/message";
import type { SendState } from "./use-chat";
import { MessageAttachmentView } from "./MessageAttachmentView";
import styles from "./ChatPane.module.css";

type Props = {
  // Identidad del viewer — para alinear los burbujas (mine vs theirs).
  viewerSub: string;
  messages: ChatMessage[];
  connectionState: ChatConnectionState;
  sendState: SendState;
  // Si está presente, deshabilita el input y muestra banner read-only.
  closedNotice?: { closedByName: string; closedAt: string } | null;
  historyLoading?: boolean;
  historyError?: string | null;
  onSend: (input: { body: string; files: File[] }) => void;
  onDismissSendError: () => void;
};

export function ChatPane({
  viewerSub,
  messages,
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

  // Auto-scroll al bottom cuando llega un mensaje nuevo.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const isClosed = closedNotice !== null;
  const canSend = !isClosed && connectionState === "open" && sendState.kind !== "pending";

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSend) return;
    onSend({ body, files });
    setBody("");
    setFiles([]);
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
        {!historyLoading && !historyError && messages.length === 0 && (
          <div className={styles.placeholder}>
            Todavía no hay mensajes. Escribe para empezar la conversación.
          </div>
        )}
        {messages.map((m) => (
          <MessageRow key={m.messageId} message={m} isMine={m.authorId === viewerSub} />
        ))}
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
