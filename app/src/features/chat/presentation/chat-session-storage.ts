// Storage centralizado del "ticket activo" del colaborador. Single key,
// sin schema versioning — si en el futuro cambia el shape lo migramos
// limpiando la entry y resetting.

const ACTIVE_TICKET_KEY = "ticke-t:active-ticket";

export function getActiveTicketId(): string | null {
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_TICKET_KEY);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function setActiveTicketId(ticketId: string): void {
  try {
    window.sessionStorage.setItem(ACTIVE_TICKET_KEY, ticketId);
    // Notifica a otros componentes en el mismo tab (storage event nativo
    // solo dispara entre tabs). El widget escucha esto para abrir.
    window.dispatchEvent(new CustomEvent("ticke-t:active-ticket-changed"));
  } catch {
    // sessionStorage no disponible (Safari private, etc.) — ignoramos.
  }
}

export function clearActiveTicketId(): void {
  try {
    window.sessionStorage.removeItem(ACTIVE_TICKET_KEY);
    window.dispatchEvent(new CustomEvent("ticke-t:active-ticket-changed"));
  } catch {
    // ignore
  }
}
