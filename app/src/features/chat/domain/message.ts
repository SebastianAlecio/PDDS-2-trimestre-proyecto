// Tipos del dominio chat. No depende de HTTP, WS, ni React — sólo describe
// la forma de un mensaje y sus adjuntos como los entiende el resto de la app.

export type ChatAuthorRole = "colaborador" | "agente";

export type ChatAttachment = {
  key: string;
  contentType: string;
  filename: string;
  size: number | null;
  // Presigned GET de S3, válida por unos minutos. El frontend la usa como
  // `src` de <img> si es imagen y como `href` de <a download> si no.
  // Vacío hasta que el backend la devuelva (mensajes recién enviados por
  // WS no incluyen el URL — el frontend lo solicita al refetch del history).
  downloadUrl: string;
};

export type ChatMessage = {
  messageId: string;
  authorId: string;
  authorName: string;
  authorRole: ChatAuthorRole;
  body: string;
  attachments: ChatAttachment[];
  createdAt: string;
};

// Input al subir un adjunto antes de mandar el mensaje. Flujo:
//   1) frontend pide presigned URL al backend (POST /messages/attachments)
//   2) frontend hace PUT directo a S3 con el archivo
//   3) frontend manda sendMessage por WS con attachments: [AttachmentInput]
export type AttachmentInput = {
  key: string;
  contentType: string;
  filename: string;
  size: number;
};
