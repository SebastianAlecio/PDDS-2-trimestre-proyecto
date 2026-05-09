# Proyecto · Sistema de Gestión de Incidentes de Producción

> **Curso:** Infraestructura en la Nube · Postgrado en Diseño y Desarrollo de Software · Galileo · ciclo Mayo–Junio 2026
> **Equipo:** Sebastián Alecio · *(integrante 2)* · *(integrante 3)*
> **Documento iterativo:** este archivo crece de E1 a E5. Cada entrega agrega una capa de diseño sobre la anterior — no se reescribe.

---

## Resumen de cambios desde la entrega anterior

*Primera versión del documento (E1). En entregas siguientes esta sección listará qué cambió respecto a la versión previa.*

---

## 1. Resumen ejecutivo (E1)

Diseñamos un **sistema de gestión de incidentes de producción** que permite a equipos de ingeniería detectar, coordinar la respuesta y aprender de fallas que afectan a sus servicios en producción. El sistema reemplaza la combinación informal de *Slack + Google Doc + planilla* que muchos equipos usan hoy, centralizando en una sola plataforma: la creación del incidente (manual o vía webhook desde un sistema de monitoreo), el *paging* del *on-call*, el *timeline* en vivo de acciones tomadas, el escalamiento automático cuando un incidente queda sin respuesta, la *status page* pública para clientes, y el *postmortem* generado automáticamente a partir del *timeline*.

**A quién sirve.** A equipos de SRE/DevOps de empresas SaaS B2B medianas (50–500 ingenieros) que operan servicios críticos 24×7 y tienen compromisos de SLA con sus clientes. El usuario primario es el **ingeniero on-call**: quien recibe la primera alerta y dispara la respuesta. Los usuarios secundarios son el *engineering manager* (que necesita visibilidad de SLA y MTTR) y el cliente final (que consulta la *status page*).

**Qué evita / automatiza.** Evita que un incidente *quede colgado* porque el *on-call* no se enteró (escalamiento automático con timer). Evita la pérdida de información post-incidente (timeline persistente y *postmortem* auto-generado). Evita que el cliente sepa del problema por Twitter y no por nosotros (status page automática). Automatiza la asignación inicial al *on-call* del servicio afectado.

---

## 2. Actores (E1)

### Humanos
- **SRE on-call** *(actor primario)* — recibe la notificación, reconoce, investiga, documenta acciones, resuelve.
- **SRE escalation / segundo nivel** — recibe escalamiento automático cuando el primer nivel no reconoce o la severidad lo amerita.
- **Engineering Manager** — supervisa incidentes activos del equipo, revisa métricas de SLA y MTTR, valida postmortems.
- **Engineer (no-on-call)** — colabora en el incidente cuando es invitado al *war room*; consulta postmortems para aprender.
- **Customer** — consulta la *status page* pública para saber si una caída afecta su uso del producto.

### Sistemas externos
- **Sistema de monitoreo** (Datadog / Grafana / Prometheus Alertmanager) — emite *webhooks* al sistema cuando se dispara una alerta.
- **Slack workspace de la empresa** — canal de notificaciones del incidente y *war room* virtual.
- **Status page pública** — endpoint público que clientes consultan; se actualiza desde el sistema.
- **Repositorio de runbooks** (Confluence / Notion / GitHub) — el *on-call* consulta runbooks vinculados al servicio afectado.
- **Servicio de email transaccional** — para notificaciones que no van por Slack (ej. resumen diario al manager).

---

## 3. Casos de uso priorizados (E1)

User stories en formato *"Como X, quiero Y, para Z"* con criterio de éxito explícito y prioridad **P0** (crítica para el MVP), **P1** (importante pero no bloqueante) o **P2** (deseable).

| # | Prioridad | User story | Criterio de éxito |
|---|---|---|---|
| US-01 | **P0** | Como **on-call**, quiero **recibir una notificación inmediata por Slack y email** cuando se crea un incidente SEV1/SEV2 asignado a un servicio bajo mi rotación, para minimizar el MTTA. | Notificación entregada en ≤ 30 s desde la creación; incluye link directo al incidente, severidad y servicio. |
| US-02 | **P0** | Como **on-call**, quiero **registrar acciones tomadas en un *timeline* en vivo** del incidente, para que mi equipo y los stakeholders vean el progreso sin tener que preguntar. | Cada acción aparece con autor, timestamp y tipo (acción / observación / cambio de estado) en ≤ 2 s tras enviarla. |
| US-03 | **P0** | Como **engineering manager**, quiero que un **SEV1 sin reconocer durante 5 minutos sea escalado automáticamente** al segundo nivel y, si sigue sin reconocer otros 5 minutos, a mí, para garantizar respuesta. | Escalamiento ejecutado en ≤ 5 s tras vencer el timer; queda evento en el *timeline*; notificación enviada al siguiente nivel. |
| US-04 | **P0** | Como **customer**, quiero **ver una *status page* pública actualizada** que indique qué servicios están degradados, para saber si el problema es del proveedor antes de abrir ticket. | La página refleja el estado del incidente en ≤ 60 s tras un cambio de estado interno; soporta *components* con estados (operational / degraded / outage). |
| US-05 | **P1** | Como **SRE**, quiero **generar el postmortem automáticamente desde el *timeline*** del incidente, con secciones predefinidas (resumen, impacto, *root cause*, *action items*), para no perder información ni partir desde cero. | Al cerrar el incidente, el sistema crea un *draft* de postmortem con timeline embebido y plantilla; queda *Markdown* editable. |
| US-06 | **P1** | Como **engineering manager**, quiero **ver un dashboard con MTTA, MTTR y *count* de incidentes por servicio en la última semana / mes**, para identificar áreas problemáticas. | Dashboard carga en ≤ 3 s con datos de hasta 90 días; filtra por severidad y servicio. |
| US-07 | **P2** | Como **sistema de monitoreo**, quiero **crear incidentes vía webhook firmado**, para que las alertas automáticas se conviertan en incidentes sin intervención humana. | Endpoint acepta JSON, valida firma HMAC, crea incidente con severidad mapeada y dispara US-01; rechaza payloads inválidos con 4xx. |
| US-08 | **P2** | Como **SRE**, quiero **adjuntar evidencias** (capturas de Grafana, fragmentos de log, traces) al *timeline*, para documentar el diagnóstico. | Soporta archivos hasta 10 MB; cada adjunto queda asociado a un evento del *timeline* con preview en la UI. |

---

## 4. Funcionalidades específicas (E1)

Lo que diferencia este sistema del enunciado genérico de "tickets e incidentes":

1. **Severidad SEV1–SEV4 con auto-priorización por reglas.** Reglas declarativas tipo `if affected_traffic > 30% then SEV1` o `if customer_facing && error_rate > 1% then SEV2`. La regla aplica al crear el incidente y puede ser revisada por el *on-call*.
2. **Asignación automática al on-call activo del servicio afectado.** Cada servicio tiene una rotación; el sistema resuelve quién está *on-call* en este momento y le asigna el incidente sin intervención humana.
3. **Escalation policies configurables.** Política por servicio o por severidad: *N1 → N2 → Manager → VP*, con timers de 5/10/30 min entre niveles.
4. **War room virtual.** Al declarar un incidente, el sistema crea un canal de Slack `#inc-2026-05-XYZ` dedicado y postea el contexto inicial; cuando el incidente cierra, archiva el canal.
5. **Timeline estructurado con tipos de evento.** Eventos categorizados (`action`, `observation`, `status_change`, `comm_sent`, `attachment_added`); facilita el postmortem y el análisis post-hoc.
6. **Status page con *components*.** Servicios visibles públicamente como *components* con estado (Operational / Degraded / Partial Outage / Major Outage). Estado se infiere del incidente activo de mayor severidad sobre ese componente.
7. **Postmortem template auto-generado.** Al cerrar el incidente, se genera un *draft* en Markdown con secciones canónicas (Summary, Impact, Timeline, Root Cause, What went well, What went poorly, Action Items) pre-llenando lo que ya está en el sistema.
8. **Métricas SLO/SLA propias.** El sistema mide su propio MTTA y MTTR como *meta-métrica*; expone dashboard y emite alarma si MTTR rolling-7d > 60 min.

---

## 5. Mockups (E1)

7 mockups *low-fi* en formato HTML estático en `cloud/docs/mockups/`. Cada uno cubre uno o más casos de uso priorizados; ver `cloud/docs/mockups/README.md` para el índice detallado.

| # | Pantalla | User stories cubiertas |
|---|---|---|
| 01 | Dashboard del *on-call* | US-01, US-03 (vista de mis incidentes activos) |
| 02 | Detail view del incidente con *timeline* en vivo | US-02, US-08 |
| 03 | Crear incidente manualmente (form) | (alternativa a US-07) |
| 04 | Status page pública | US-04 |
| 05 | Servicios con métricas MTTR / MTTA | US-06 |
| 06 | Postmortem auto-generado (draft editable) | US-05 |
| 07 | Vista del Engineering Manager | US-06, US-03 (visibilidad de escalamientos) |

---

## 6. Mapeo funcionalidad → componente del curso (E1)

Cómo cada funcionalidad del sistema ejercita los siete componentes que el curso evaluará en E2–E5.

| Componente del curso | Cómo lo ejercita este proyecto |
|---|---|
| **Cómputo (API)** *(detalle en E2)* | Endpoints REST: `POST /incidents` (crea con auto-priorización + auto-asignación), `PATCH /incidents/{id}` (cambio de estado), `POST /incidents/{id}/timeline` (agregar evento), `POST /webhooks/monitoring` (receptor de alertas externas firmado), `GET /status` (status page pública). Workers asíncronos para escalamiento, notificaciones y generación de postmortem. |
| **Base de datos** *(detalle en E2)* | Tablas / colecciones: `incidents`, `timeline_events`, `services`, `users`, `on_call_schedule`, `escalation_policies`, `notifications`, `postmortems`. Patrones de acceso principales: lectura por `incident_id` con timeline, query de incidentes activos por on-call, query histórico para métricas. |
| **Almacenamiento de archivos** *(detalle en E2)* | Adjuntos del timeline (PNG/JPG de gráficos, fragmentos de log en `.txt`/`.log`), postmortems exportados a PDF, snapshots de la status page para auditoría. Separados de la BD para que el costo de storage no infle el costo de la BD. |
| **Red** *(detalle en E3)* | Capa pública: ALB con FE web, API y receptor de webhooks. Capa privada-app: cómputo y workers. Capa privada-data: BD y caché. Status page servida desde CDN para resistir picos sin tocar el origen. |
| **Procesamiento asíncrono** *(detalle en E4)* | Notificaciones (Slack, email) desacopladas vía cola; *escalation timers* implementados como mensajes diferidos; generación de postmortem como job pesado; publicación a status page como evento. Idempotencia en notificaciones (no duplicar pagos al on-call si la API se reintenta). |
| **Seguridad** *(detalle en E5)* | Roles: `on_call`, `manager`, `viewer`, `customer` (público, solo status page). Autenticación de webhook por firma HMAC con secret rotable. Auditoría de quién cambió estado de qué incidente y cuándo. |
| **Observabilidad** *(detalle en E5)* | Logs estructurados con `incident_id` como correlation ID. Métricas RED por endpoint. Métricas de negocio: MTTA, MTTR, # incidentes activos. Alarmas: si nuestro MTTR rolling-7d > 60 min, si la cola de notificaciones crece sostenidamente, si la status page no se actualiza > 5 min. |

---

## 7. Scope (in / out) (E1)

### IN — lo que el sistema SÍ hace
- Ciclo de vida completo del incidente: detección → reconocimiento → investigación → mitigación → resolución → postmortem.
- Asignación automática al *on-call* activo del servicio afectado.
- Escalamiento automático según política configurable.
- War room virtual en Slack (creación y archivado del canal).
- Status page pública con *components* y estados.
- Postmortem auto-generado como *draft* editable.
- Métricas de SLA / MTTA / MTTR por servicio y agregadas.
- Webhook receiver firmado para integración con sistemas de monitoreo.
- Adjuntos al timeline (capturas, logs).
- Roles diferenciados: on-call, manager, viewer, customer (público).

### OUT — lo que el sistema NO hace (al menos en este alcance)
- **Integración con PagerDuty / Opsgenie.** Asumimos rotación on-call interna gestionada en el sistema.
- **Correlación automática de alertas con ML / detección de incidentes duplicados.** Cada alerta = un incidente; la deduplicación queda a cargo del *on-call*.
- **Auto-ejecución de runbooks.** El sistema enlaza al runbook; no lo ejecuta.
- **Integración con sistemas de ticketing externos** (Jira, ServiceNow, Zendesk).
- **Comunicación bidireccional con el cliente** desde la status page (ni comments, ni subscripciones por email — solo lectura pública).
- **Voice paging (llamadas telefónicas).** Solo Slack + email en este alcance.
- **Análisis predictivo o detección de anomalías.** Es un sistema reactivo, no proactivo.
- **Mobile app nativa.** Web responsive es suficiente para el MVP.

---

## 8. Preguntas abiertas (E1)

Decisiones técnicas que aún no tomamos. Conscientes y honestas — se cierran en las entregas correspondientes:

- **Cómputo:** ¿Lambda con API Gateway, ECS Fargate detrás de ALB, o EC2 con Auto Scaling? *(E2)* Trade-off: Lambda escala a cero pero tiene cold starts que pueden impactar US-01; Fargate da control sobre el runtime pero cuesta más en idle.
- **Base de datos:** ¿BD relacional (RDS Postgres) para el modelo principal, o documental (DynamoDB) por los patrones de timeline append-only? *(E2)* Trade-off: el timeline es append-heavy y pide DynamoDB; los joins de métricas piden Postgres. Posible solución híbrida.
- **State machine del incidente:** ¿estados explícitos en BD o derivados del último timeline event? Implica decisiones sobre concurrencia y consistencia.
- **Verificación de webhooks:** ¿HMAC compartido con cada origen, o JWT firmado por un IdP intermedio? *(E5)*
- **SLO propios objetivo:** ¿qué MTTA/MTTR nos comprometemos a cumplir como sistema? Necesario para definir alarmas.
- **¿Multi-tenant o single-tenant?** Para el alcance del curso asumimos single-tenant (una sola empresa lo opera para sí misma); multi-tenant agrega complejidad de seguridad significativa.
- **Persistencia del war room en Slack:** ¿qué pasa si Slack está caído cuando declaramos un incidente?

---

## 9. Cómputo y datos *(pendiente — E2, jue 21 may 2026)*

*Esta sección se completa en la Entrega 2: diagrama de contexto, decisión de cómputo (Lambda / Fargate / EC2 con trade-offs y desventaja reconocida), modelo de datos (estructura del dominio, patrones de acceso, BD vs storage de objetos, decisión de caché si aplica).*

---

## 10. Red *(pendiente — E3, dom 31 may 2026)*

*Esta sección se completa en la Entrega 3: VPC con CIDR explícito, subnets públicas (ALB, NAT) y privadas (compute, BD), Availability Zones justificadas, NAT vs VPC endpoints. Incluye primera versión del diagrama de contenedores.*

---

## 11. Procesamiento asíncrono *(pendiente — E4, dom 7 jun 2026)*

*Esta sección se completa en la Entrega 4: lista de eventos/mensajes con productor, consumidor, formato del payload, manejo de fallos (DLQ con threshold de reintentos), idempotencia. Diagrama de contenedores actualizado con queues / topics.*

---

## 12. Seguridad, observabilidad y costos *(pendiente — E5, jue 11 jun 2026)*

*Esta sección se completa en la Entrega 5: modelo de seguridad detallado (IAM por servicio con mínimo privilegio, secretos con dueño y rotación, KMS keys con alcance, cifrado en tránsito y reposo); plan de observabilidad (logs estructurados con correlation IDs, métricas RED, ≥ 2 alarmas con threshold y acción, comportamiento ante degradación); estimado de costo mensual con supuestos explícitos; riesgos y decisiones pendientes; detalle del componente más complejo del sistema (probablemente la state machine de incidentes + escalamiento).*

---

## 13. Anexo IA (E1)

Reflexión sobre uso de inteligencia artificial en esta entrega — ver archivo separado `cloud/docs/anexo-ia.md`.

---

## Coordinación con curso de Automatización

El curso paralelo (Automatización con IaC) consume las decisiones de este documento para construir la infraestructura real con Terraform. La tabla de mapeo:

| Delivery Automatización | Fecha | Insumo desde Cloud Infra |
|---|---|---|
| D1 — Workspace Terraform y CI baseline | dom 10 may | E1 (mismo día) — proveedor AWS, naming, región. *Ya entregado en `infra/`.* |
| D2 — Módulos cómputo / almacenamiento / BD | jue 21 may | E2 — decisión de cómputo, esquema BD, qué va a S3 vs BD |
| D3 — Capa de red automatizada | dom 7 jun | E3 — CIDR, subnets, NAT vs endpoints |
| D4 — Infraestructura asíncrona + pipeline CD | dom 21 jun | E4 + E5 — eventos, payloads, DLQ, ambientes |
| D5 — Seguridad, observabilidad, deployment one-click | jue 25 jun | E5 — IAM, secretos, métricas, alarmas |

**Decisiones de E1 ya consumidas por D1 (curso de Automatización):**
- Proveedor: **AWS**.
- Región principal: **us-east-1**.
- Naming convention: ver `infra/README.md`.
