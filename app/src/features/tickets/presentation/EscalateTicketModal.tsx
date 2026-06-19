import { useState } from "react";
import type { Ticket } from "../domain/ticket";
import { shortId } from "./use-create-ticket";
import styles from "./EscalateTicketModal.module.css";

// Modal de escalamiento a N2. Solo lo abre un agente-n1 sobre un ticket
// asignado a él. La razón es obligatoria (20–1000 chars) — el backend la
// guarda en el historial del ticket y la incluye en el mensaje de sistema
// que se broadcastea por WS al colaborador. Validamos los límites en el
// cliente para feedback inmediato; el backend valida también.

const MIN_LEN = 20;
const MAX_LEN = 1000;

type Props = {
  ticket: Ticket;
  isEscalating: boolean;
  onCancel: () => void;
  onConfirm: (razon: string) => void;
};

export function EscalateTicketModal({
  ticket,
  isEscalating,
  onCancel,
  onConfirm,
}: Props) {
  const [razon, setRazon] = useState("");
  const trimmed = razon.trim();
  const length = trimmed.length;
  const tooShort = length < MIN_LEN;
  const tooLong = length > MAX_LEN;
  const isValid = !tooShort && !tooLong;

  // Pista contextual debajo del textarea: el primer feedback es "faltan X
  // caracteres" (positivo, orienta al usuario), luego desaparece cuando
  // entra al rango válido. El contador a la derecha siempre visible.
  const hint = tooShort
    ? `Faltan ${MIN_LEN - length} caracteres para alcanzar el mínimo.`
    : tooLong
      ? `Excede el máximo por ${length - MAX_LEN} caracteres.`
      : "";

  // Aviso de borde cuando ya entró al rango válido pero está cerca del
  // techo — naranja sutil, no error.
  const countWarn = !tooLong && length > MAX_LEN - 50;

  const handleConfirm = () => {
    if (!isValid || isEscalating) return;
    onConfirm(trimmed);
  };

  return (
    <div
      className={styles.modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="escalate-ticket-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isEscalating) onCancel();
      }}
    >
      <div className={styles.modal}>
        <h2 id="escalate-ticket-title" className={styles.modalTitle}>
          ¿Escalar este ticket a N2?
        </h2>
        <p className={styles.modalBody}>
          Estás por escalar <strong>{shortId(ticket.id)} — {ticket.title}</strong>.
          El ticket pasa a una cola exclusiva para agentes especializados N2
          y el colaborador <strong>{ticket.requester.name}</strong> verá un
          aviso en el chat.
        </p>

        <label htmlFor="escalate-razon" className={styles.fieldLabel}>
          Razón del escalamiento
        </label>
        <textarea
          id="escalate-razon"
          className={styles.textarea}
          value={razon}
          onChange={(e) => setRazon(e.target.value)}
          placeholder="Explica por qué necesitas escalar este caso a un especialista N2 (mínimo 20 caracteres)…"
          disabled={isEscalating}
          maxLength={MAX_LEN + 200 /* tolerancia tipográfica, validamos arriba */}
          rows={5}
          aria-invalid={!isValid && length > 0}
          aria-describedby="escalate-razon-meta"
        />
        <div id="escalate-razon-meta" className={styles.metaRow}>
          <span className={tooLong ? styles.metaError : styles.metaHint}>
            {hint || `Mínimo ${MIN_LEN} caracteres · máximo ${MAX_LEN}.`}
          </span>
          <span
            className={`${styles.metaCount} ${
              tooLong ? styles.metaError : countWarn ? styles.metaCountWarn : ""
            }`}
          >
            {length} / {MAX_LEN}
          </span>
        </div>

        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.modalCancelBtn}
            onClick={onCancel}
            disabled={isEscalating}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.modalConfirmBtn}
            onClick={handleConfirm}
            disabled={!isValid || isEscalating}
          >
            {isEscalating ? "Escalando…" : "Escalar"}
          </button>
        </div>
      </div>
    </div>
  );
}
