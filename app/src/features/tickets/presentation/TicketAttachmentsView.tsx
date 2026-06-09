import type { AttachmentMetadata } from "../domain/ticket";
import styles from "./TicketAttachmentsView.module.css";

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

type Props = {
  attachments: AttachmentMetadata[];
};

// Renderiza los adjuntos originales del ticket (los que el colaborador
// subió al crear). Imágenes con downloadUrl van inline; el resto como
// link de descarga. Sin URL, mostramos solo nombre + tipo (caso edge: el
// archivo aún no terminó de subir o el bucket no está accesible).
export function TicketAttachmentsView({ attachments }: Props) {
  if (attachments.length === 0) return null;
  return (
    <div className={styles.list}>
      {attachments.map((a) => (
        <AttachmentItem key={a.id} attachment={a} />
      ))}
    </div>
  );
}

function AttachmentItem({ attachment }: { attachment: AttachmentMetadata }) {
  const isImage = IMAGE_TYPES.has(attachment.type);
  const url = attachment.downloadUrl;

  if (isImage && url) {
    return (
      <a
        className={styles.imageLink}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={attachment.name}
      >
        <img
          className={styles.image}
          src={url}
          alt={attachment.name}
          loading="lazy"
        />
        <span className={styles.imageCaption}>{attachment.name}</span>
      </a>
    );
  }

  if (url) {
    return (
      <a
        className={styles.fileLink}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        download={attachment.name}
      >
        <span className={styles.fileIcon}>📎</span>
        <span className={styles.fileMeta}>
          <span className={styles.fileName}>{attachment.name}</span>
          <span className={styles.fileSize}>
            {humanSize(attachment.size)} · {attachment.type}
          </span>
        </span>
      </a>
    );
  }

  return (
    <div className={styles.fileLink} title={attachment.name}>
      <span className={styles.fileIcon}>📎</span>
      <span className={styles.fileMeta}>
        <span className={styles.fileName}>{attachment.name}</span>
        <span className={styles.fileSize}>
          {humanSize(attachment.size)} · {attachment.type} · descarga no
          disponible
        </span>
      </span>
    </div>
  );
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
