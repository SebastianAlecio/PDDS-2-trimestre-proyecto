# Final Course Presentation — Candidate Application-Behavior Areas

Lista de áreas candidatas para el live change de la presentación final (Segment D / Section 4 del PDF). Cada candidato es surgical, observable en el response del endpoint, y atraviesa el CD pipeline completo (PR → required checks → review approval → merge → auto-deploy a dev → gated deploy a staging).

**Stack note:** la app es Lambda + zip. El "Docker pipeline" del PDF se interpreta como nuestro pipeline equivalente (`terraform-apply.yml`: archive del code + `aws_lambda_function` update). El spirit del requirement — pasar por el CD real con todas las guardrails — se cumple igual.

---

## Candidate 1 — Filtro por prioridad en la cola del agente

**Title:** Query param `?priority=` en `GET /tickets/queue`.

**Observable behavior:** hoy `GET /tickets/queue` devuelve el conjunto completo de tickets `unassigned` + `mine` (+ `escalated` / `escalated_by_me` según rol) sin posibilidad de filtrar. El agente que quiere atender primero las urgencias filtra en el frontend. Cambio: aceptar query param `priority` con valores `alta | media | baja`. Si presente, los arrays devueltos solo contienen tickets cuyo campo `prioridad` matchea. Si ausente, comportamiento idéntico al actual (backwards-compatible). Valor inválido → HTTP 400 con `{code: "INVALID_PRIORITY"}`.

**Affected endpoint and handler:** `GET /tickets/queue` → función `handleQueue` en `infra/modules/compute/src/index.js`. El filtrado se aplica en memoria después del Query a GSI2/GSI3/GSI4 (no requiere índice nuevo en DDB).

**Verification method:**
```bash
# Comportamiento previo
curl -H "Authorization: Bearer $JWT" https://api.ticke-t.lumenchat.app/tickets/queue
# → {"unassigned":[<todos>], "mine":[<todos>], ...}

# Comportamiento nuevo
curl -H "Authorization: Bearer $JWT" "https://api.ticke-t.lumenchat.app/tickets/queue?priority=alta"
# → {"unassigned":[<solo alta>], "mine":[<solo alta>], ...}

# Validación
curl -H "Authorization: Bearer $JWT" "https://api.ticke-t.lumenchat.app/tickets/queue?priority=critical"
# → 400 {"code":"INVALID_PRIORITY"}
```

**Rough scope:** ~10 líneas. Parse del query (`event.queryStringParameters?.priority`), validación contra set `{alta, media, baja}`, `.filter(t => t.prioridad === priority)` aplicado a los arrays del response. Sin cambios en TF, sin cambios en API Gateway (query params no requieren declaración explícita en REST API), sin cambios en el frontend.

---

## Candidate 2 — Campo derivado `sla_remaining_min` en respuestas de ticket

**Title:** Field calculado de tiempo restante de SLA en `GET /tickets/me` y `GET /tickets/queue`.

**Observable behavior:** hoy cada ticket devuelto incluye `fecha_limite` (ISO 8601 timestamp). Calcular cuántos minutos faltan para vencer queda en el frontend. Cambio: agregar field nuevo `sla_remaining_min` (number) calculado en el handler como `Math.round((Date.parse(fecha_limite) - Date.now()) / 60000)`. Positivo si el ticket aún tiene tiempo, negativo si ya se pasó el SLA (útil para el agente: -15 = vencido hace 15 min). Se devuelve `null` si el ticket no tiene `fecha_limite` (closed sin SLA aplicado).

**Affected endpoint and handler:** `GET /tickets/me` (`handleListMyTickets`) y `GET /tickets/queue` (`handleQueue`) en `infra/modules/compute/src/index.js`. Ambos llaman a un mapper común que arma el shape del ticket de respuesta — el field se agrega ahí para que aparezca en los dos endpoints con un solo edit.

**Verification method:**
```bash
# Crear un ticket nuevo (prioridad alta → SLA 1h)
curl -X POST -H "Authorization: Bearer $JWT" https://api.ticke-t.lumenchat.app/tickets \
  -d '{"titulo":"test sla","categoria":"incidente","prioridad":"alta","descripcion":"x","area":"IT"}'

# Listar — el ticket nuevo debe tener sla_remaining_min cerca de 60
curl -H "Authorization: Bearer $JWT" https://api.ticke-t.lumenchat.app/tickets/me \
  | jq '.[0].sla_remaining_min'
# → 59 (o un valor cercano)

# Volver a curl 1 min después → valor decreciente confirma cálculo dinámico
```

**Rough scope:** ~5 líneas. Una const con el cálculo + agregar el field al objeto mapeado. Sin cambios en DDB (no se persiste, se calcula on-read), sin cambios en TF, sin cambios en el frontend.

---

## Candidate 3 — Input validation de `titulo` en `POST /tickets`

**Title:** Validación de longitud de `titulo` con HTTP 400 estructurado.

**Observable behavior:** hoy `POST /tickets` acepta cualquier `titulo` no-null (la única validación es que el campo exista). Strings vacíos, de 1 caracter, o de 10k caracteres se persisten igual. Cambio: rechazar si `titulo.trim().length < 5` o `> 200` con HTTP 400 y body `{code: "INVALID_TITLE", message: "titulo debe tener entre 5 y 200 caracteres", got: <length>}`. Bordes válidos siguen retornando `201 Created` con el ticket creado.

**Affected endpoint and handler:** `POST /tickets` → función `handleCreateTicket` en `infra/modules/compute/src/index.js`. La validación va antes del `PutCommand` a DDB, junto a las validaciones existentes de `categoria`, `prioridad`, `area`.

**Verification method:**
```bash
# Título demasiado corto
curl -X POST -H "Authorization: Bearer $JWT" https://api.ticke-t.lumenchat.app/tickets \
  -d '{"titulo":"ab","categoria":"incidente","prioridad":"alta","descripcion":"x","area":"IT"}'
# → 400 {"code":"INVALID_TITLE","message":"...","got":2}

# Título válido
curl -X POST -H "Authorization: Bearer $JWT" https://api.ticke-t.lumenchat.app/tickets \
  -d '{"titulo":"problema impresora","categoria":"incidente","prioridad":"alta","descripcion":"x","area":"IT"}'
# → 201 {"id":"...","item":{...}}
```

**Rough scope:** ~8 líneas. Bloque if con la condición + `return badRequest(...)` (helper que ya existe en `index.js`). Sin cambios en DDB, TF, ni frontend.

---

**Rough scope:** ~10 líneas. Parse + validación + `agents.sort((a,b) => b.tickets_resueltos - a.tickets_resueltos).slice(0, top)`. Sin cambios en Cognito calls (la lista completa se sigue trayendo igual; solo cambia el shape del response), sin cambios en TF, sin cambios en el frontend (el frontend no usa el param hoy — ignora el comportamiento nuevo).
