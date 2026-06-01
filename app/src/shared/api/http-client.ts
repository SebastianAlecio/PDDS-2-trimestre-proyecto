import { fetchAuthSession } from "aws-amplify/auth";
import { API_BASE_URL } from "../auth/auth-config";

// Wrapper sobre fetch que:
//  - resuelve rutas relativas contra VITE_API_BASE_URL
//  - inyecta el ID token de Cognito en Authorization (Amplify lo refresca)
//  - parsea JSON con un contrato común { ok, data, error }
//
// El authorizer JWT de API Gateway rechaza tokens vencidos con 401, así que
// dejamos que el SDK haga el refresh automático y nunca cacheamos el token.

export class HttpError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

type FetchOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
};

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { method = "GET", body, query } = options;

  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  if (!idToken) {
    throw new HttpError(401, "Sesión expirada. Vuelve a iniciar sesión.");
  }

  // Concatenamos manualmente (no usamos new URL(path, base) porque cuando
  // path empieza con "/" reemplaza el path del base — perdiendo el segmento
  // /prod del stage).
  const baseUrl = API_BASE_URL.replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${baseUrl}${cleanPath}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // 204 No Content y similares no traen body parseable.
  const text = await response.text();
  const parsed = text.length > 0 ? safeJsonParse(text) : null;

  if (!response.ok) {
    const message =
      (parsed && typeof parsed === "object" && "error" in parsed && typeof parsed.error === "string"
        ? parsed.error
        : null) ?? `HTTP ${response.status}`;
    const details =
      parsed && typeof parsed === "object" && "details" in parsed ? parsed.details : undefined;
    throw new HttpError(response.status, message, details);
  }

  return parsed as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
