import type { Ticket } from "../domain/ticket";
import { shortId } from "./use-create-ticket";
import styles from "./CloseTicketConfirmModal.module.css";

// Modal de confirmación para cerrar un ticket. El cierre dispara un email
// automático al colaborador + broadcast por WS — irreversible desde la UI.
// Por eso pedimos confirmación explícita.
//
// Reutilizable: QueuePage tenía esto inline para probar el pipeline de
// notificaciones; ahora vive en AgentTicketPage (Task 20).

type Props = {
  ticket: Ticket;
  isClosing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function CloseTicketConfirmModal({
  ticket,
  isClosing,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <div
      className={styles.modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-ticket-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isClosing) onCancel();
      }}
    >
      <div className={styles.modal}>
        <h2 id="close-ticket-title" className={styles.modalTitle}>
          ¿Cerrar este ticket?
        </h2>
        <p className={styles.modalBody}>
          Estás por cerrar <strong>{shortId(ticket.id)} — {ticket.title}</strong>.
          El solicitante <strong>{ticket.requester.name}</strong> recibirá un
          correo automático notificándole el cierre. Esta acción no se puede
          deshacer desde el portal.
        </p>
        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.modalCancelBtn}
            onClick={onCancel}
            disabled={isClosing}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.modalConfirmBtn}
            onClick={onConfirm}
            disabled={isClosing}
          >
            {isClosing ? "Cerrando…" : "Cerrar ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}
