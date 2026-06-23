# Final Course Presentation — Candidate Application-Behavior Areas

Lista de áreas candidatas para el live change de la presentación final (Segment D / Section 4 del PDF). Cada candidato es surgical, observable en el response del endpoint, y atraviesa el CD pipeline completo (PR → required checks → review approval → merge → auto-deploy a dev → gated deploy a staging).

**Stack note:** la app es Lambda + zip. El "Docker pipeline" del PDF se interpreta como nuestro pipeline equivalente (`terraform-apply.yml`: archive del code + `aws_lambda_function` update). El spirit del requirement — pasar por el CD real con todas las guardrails — se cumple igual.

---

## Candidate 1 — Ordenamiento por prioridad en la cola del agente

**Title:** Sort estable por prioridad (`alta → media → baja`) en `GET /tickets/queue`.

**Observable behavior:** hoy `GET /tickets/queue` devuelve los arrays `unassigned`, `mine` (+ `escalated` / `escalated_by_me` según rol) en el orden que la sort key del GSI les da — efectivamente cronológico — con prioridades mezcladas. El agente que quiere atender primero las urgencias las identifica visualmente por el color del `<PriorityTag>` (el frontend no filtra ni ordena por prioridad: pinta los arrays tal cual vienen). Cambio: el handler aplica un sort estable por prioridad antes de retornar, con peso `{alta:0, media:1, baja:2}`. Los tickets de igual prioridad mantienen su orden cronológico actual (sort estable). Resultado: el agente abre la cola y ve los rojos arriba, amarillos en el medio, verdes al final, sin que el frontend cambie nada.

**Affected endpoint and handler:** `GET /tickets/queue` → función `handleQueue` en `infra/modules/compute/src/index.js`. El sort se aplica en memoria a cada uno de los 4 arrays del response después del Query a los GSIs (sin índice nuevo en DDB, sin cambios en TF).

**Verification method:**
```bash
# Pre-deploy: prioridades intercaladas en el orden cronológico del GSI
curl -s -H "Authorization: Bearer $JWT" https://api.ticke-t.lumenchat.app/tickets/queue | jq '.unassigned | map(.prioridad)'
# → ["media","alta","baja","alta","media","baja"]

# Post-deploy (mismo dataset, después del terraform-apply en main)
curl -s -H "Authorization: Bearer $JWT" https://api.ticke-t.lumenchat.app/tickets/queue | jq '.unassigned | map(.prioridad)'
# → ["alta","alta","media","media","baja","baja"]

# Visual: refrescar https://app.ticke-t.lumenchat.app/agente — los tickets
# con tag rojo (alta) quedan arriba del todo en cada sección de la tabla.
```

**Rough scope:** ~5 líneas. Un mapa `{alta:0, media:1, baja:2}` + `.sort((a,b) => weight[a.prioridad] - weight[b.prioridad])` aplicado a los 4 arrays antes del return. Sin cambios en TF, en API Gateway, en DDB ni en el frontend.

---

## Candidate 2 — Campo derivado `sla_remaining_min` en respuestas de ticket

**Title:** Field calculado de tiempo restante de SLA en `GET /tickets/me` y `GET /tickets/queue`.

**Observable behavior:** hoy cada ticket devuelto incluye `fecha_limite` (ISO 8601 timestamp) y `sla_etiqueta` (`"1 hora"`, `"4 horas"`, `"1 día"` según prioridad). Calcular cuántos minutos faltan para vencer queda en el frontend. Cambio: agregar field nuevo `sla_remaining_min` (number) a cada ticket del response, calculado on-read como `Math.round((Date.parse(fecha_limite) - Date.now()) / 60000)`. Positivo si el ticket aún tiene tiempo, negativo si ya se pasó el SLA (-15 = vencido hace 15 min).

**Affected endpoint and handler:** `GET /tickets/me` (`handleListMyTickets`, línea 488) y `GET /tickets/queue` (`handleQueue`, línea 531) en `infra/modules/compute/src/index.js`. Ambos handlers devuelven los items de DynamoDB tal cual los enriquecen con presigned URLs — NO existe un mapper común, así que el field se calcula y agrega en cada handler por separado (en el `Array.prototype.map` previo al `return ok({...})`). El response shape es distinto entre los dos: `/tickets/me` devuelve `{ items: [...], count: N }`; `/tickets/queue` devuelve `{ unassigned, mine, historial, escalated, escalated_by_me }`.

**Verification method:**
```bash
# Pre-deploy: el field no existe en el response
curl -s -H "Authorization: Bearer $JWT" https://api.ticke-t.lumenchat.app/tickets/me | jq '.items[0].sla_remaining_min'
# → null

# Post-deploy: el field aparece, calculado dinámicamente
curl -s -H "Authorization: Bearer $JWT" https://api.ticke-t.lumenchat.app/tickets/me | jq '.items[0].sla_remaining_min'
# → 47   (47 min restantes para vencer el SLA del primer ticket)

# Verificar también contra la cola del agente (mismo JWT debe estar en grupo agente)
curl -s -H "Authorization: Bearer $JWT-agente" https://api.ticke-t.lumenchat.app/tickets/queue | jq '.unassigned[0].sla_remaining_min'
# → -12  (negativo = ticket vencido hace 12 min)

# Re-correr 1 min después contra el mismo ticket → valor decreciente confirma cálculo dinámico (no caché)
```

**Rough scope:** ~6 líneas. En cada handler: un helper `withSlaRemaining = (t) => ({...t, sla_remaining_min: Math.round((Date.parse(t.fecha_limite) - Date.now()) / 60000)})`. Aplicarlo a cada array antes del return — 1 línea en `handleListMyTickets` (`items.map(withSlaRemaining)`), 4 líneas en `handleQueue` (sobre `unassignedEnriched`, `mineEnriched`, `escalatedEnriched`, `escalatedByMeEnriched`). Sin cambios en DDB (no se persiste, se calcula on-read), sin cambios en TF, sin cambios en el frontend (el field es ignorado por el mapper actual — visible solo vía curl).

---

## Candidate 3 — Input validation de `title` en `POST /tickets`

**Title:** Validación de longitud de `title` con HTTP 400.

**Observable behavior:** hoy `POST /tickets` valida que `title` sea string no-vacío después de `trim()` (línea 209 de `index.js`, helper `requireNonEmptyString`). Strings de 1 caracter, 200 caracteres, o 10k caracteres se persisten igual. Cambio: rechazar si `title.trim().length < 5` o `> 120` (mismo rango que el frontend en `app/src/features/tickets/presentation/schema.ts`, líneas 28-32) con HTTP 400 y body `{ error: "invalid payload", details: ["\"title\" must be between 5 and 120 characters"] }`. Reutiliza el helper `badRequest(message, details)` existente (línea 127) para mantener el shape uniforme del resto de errores 4xx del archivo. Bordes válidos siguen retornando `201 Created`.

**Affected endpoint and handler:** `POST /tickets` → función `validateCreateTicketBody` (línea 196) en `infra/modules/compute/src/index.js`. La validación de longitud se agrega justo después del `requireNonEmptyString("title", body)` existente, antes de las validaciones de `category`, `area`, `priority`. Como el frontend ya valida 5/120 con Zod, el guardrail nuevo del backend solo se observa llamando la API directamente (curl/Postman) — clientes que usan el form ya quedan bloqueados antes del POST.

**Verification method:**
```bash
# Pre-deploy: título de 2 chars se acepta (200 Created)
curl -s -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" https://api.ticke-t.lumenchat.app/tickets -d '{"title":"ab","category":"incidente","priority":"alta","description":"descripcion suficientemente larga para pasar la validacion existente","area":"IT","requester":{"area":"IT"}}'
# → 201 {"id":"...","item":{"titulo":"ab",...}}

# Post-deploy: mismo request ahora rebota con 400
curl -s -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" https://api.ticke-t.lumenchat.app/tickets -d '{"title":"ab","category":"incidente","priority":"alta","description":"descripcion suficientemente larga para pasar la validacion existente","area":"IT","requester":{"area":"IT"}}'
# → 400 {"error":"invalid payload","details":["\"title\" must be between 5 and 120 characters"]}

# Título válido sigue retornando 201
curl -s -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" https://api.ticke-t.lumenchat.app/tickets -d '{"title":"problema impresora","category":"incidente","priority":"alta","description":"descripcion suficientemente larga para pasar la validacion existente","area":"IT","requester":{"area":"IT"}}'
# → 201 {"id":"...","item":{...}}
```

**Rough scope:** ~5 líneas. Un bloque `if (typeof body.title === "string" && (body.title.trim().length < 5 || body.title.trim().length > 120)) { errors.push("\"title\" must be between 5 and 120 characters"); }` agregado en `validateCreateTicketBody`. Reutiliza el array `errors` que ya existe y termina en el `return badRequest("invalid payload", errors)` del handler. Sin cambios en DDB, TF, ni frontend. Valores aceptados por la API hoy: `category ∈ {incidente, solicitud, mejora}`, `area ∈ {RRHH, IT, Legal, Finanzas}`, `priority ∈ {alta, media, baja}`.

---

**Rough scope:** ~10 líneas. Parse + validación + `agents.sort((a,b) => b.tickets_resueltos - a.tickets_resueltos).slice(0, top)`. Sin cambios en Cognito calls (la lista completa se sigue trayendo igual; solo cambia el shape del response), sin cambios en TF, sin cambios en el frontend (el frontend no usa el param hoy — ignora el comportamiento nuevo).
