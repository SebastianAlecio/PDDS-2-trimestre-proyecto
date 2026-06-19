import type { ChatAttachment } from "../domain/message";
import styles from "./MessageAttachmentView.module.css";

// Heurística para detectar imagenes:
//   - Por content type: cualquier "image/*" (case insensitive).
//   - Por extension del filename como fallback cuando el server no manda el
//     content type correcto (ej. octet-stream).
// Cubrir ambos casos porque algunos clientes upload con content type generico.
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

function isImageAttachment(attachment: ChatAttachment): boolean {
  const ct = (attachment.contentType || "").toLowerCase().trim();
  if (ct.startsWith("image/")) return true;
  if (IMAGE_EXTENSIONS.test(attachment.filename || "")) return true;
  return false;
}

type Props = {
  attachment: ChatAttachment;
};

export function MessageAttachmentView({ attachment }: Props) {
  const isImage = isImageAttachment(attachment);
  const hasUrl = attachment.downloadUrl.length > 0;

  if (isImage && hasUrl) {
    return (
      <a
        className={styles.imageLink}
        href={attachment.downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={attachment.filename}
      >
        <img
          className={styles.image}
          src={attachment.downloadUrl}
          alt={attachment.filename}
          loading="lazy"
        />
      </a>
    );
  }

  // Imágenes recién recibidas por WS (sin download_url) muestran un placeholder.
  if (isImage && !hasUrl) {
    return (
      <div className={styles.imagePlaceholder} title={attachment.filename}>
        <span className={styles.placeholderIcon}>🖼</span>
        <span className={styles.placeholderText}>
          {attachment.filename}
          <small> · imagen disponible al recargar</small>
        </span>
      </div>
    );
  }

  // Otros tipos: link de descarga.
  if (hasUrl) {
    return (
      <a
        className={styles.fileLink}
        href={attachment.downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        download={attachment.filename}
      >
        <span className={styles.fileIcon}>📎</span>
        <span className={styles.fileMeta}>
          <span className={styles.fileName}>{attachment.filename}</span>
          {attachment.size !== null && (
            <span className={styles.fileSize}>{humanSize(attachment.size)}</span>
          )}
        </span>
      </a>
    );
  }

  return (
    <div className={styles.fileLink} title={attachment.filename}>
      <span className={styles.fileIcon}>📎</span>
      <span className={styles.fileMeta}>
        <span className={styles.fileName}>{attachment.filename}</span>
        <small> · descarga disponible al recargar</small>
      </span>
    </div>
  );
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
