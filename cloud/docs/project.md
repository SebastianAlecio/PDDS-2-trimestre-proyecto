# Ticke-T — Plataforma de tickets con chat en vivo propio

> **Curso:** Infraestructura en la Nube · Postgrado en Diseño y Desarrollo de Software · Universidad Galileo · ciclo Mayo–Junio 2026
> **Entrega:** 1 — Pitch, scope y mockups · dom 17 may 2026
> **Equipo:** Alessandro Alecio · David Garcia · Joaquin Marroquin

---

## 1. Resumen ejecutivo

### El problema

Las startups y empresas *mid-market* manejan un alto volumen de interacciones de soporte y, en etapas tempranas, suelen depender de canales externos (email, redes sociales, mensajería de terceros) para responder a sus clientes. Eso fragmenta la conversación, deja al equipo sin métricas accionables, y entrega la experiencia del usuario a una plataforma de un tercero — con sus limitaciones, su rate-limiting, y su modelo de privacidad. Centralizar la atención en una página propia con un chat integrado le permite a la empresa controlar la experiencia y la privacidad de los datos sin pelearse con SDKs ajenos.

### La solución

**Ticke-T** es un sistema de gestión de tickets basado en la nube que ingiere mensajes desde un **widget de chat en vivo propio** incrustado en la página web de la empresa. Cada conversación con un cliente se convierte automáticamente en un ticket auditable. El equipo de soporte trabaja desde una bandeja de entrada compartida con SLAs por prioridad, categorización del incidente y escalamiento explícito de N1 a N2. La comunicación entre el cliente y el agente es en tiempo real vía WebSockets — el cliente escribe en el widget de la web, el agente responde desde el panel, y el mensaje aparece en el widget del cliente sin recargar la página.

### Cómo funciona, en seis pasos

1. **El cliente abre el widget** desde cualquier página de la empresa que lo tiene incrustado y escribe su mensaje. No necesita crear cuenta — opcionalmente puede dejar su email para que la conversación quede ligada a él.
2. **El sistema crea el ticket** automáticamente con la categoría y prioridad inferidas de palabras clave o de una selección pre-chat (ej. *"problema con un pago"*).
3. **El ticket aparece en la cola del equipo de soporte** en menos de 3 segundos. Si la prioridad es Alta, además se publica una notificación al canal de alertas del equipo.
4. **Un agente toma el ticket** desde el panel y responde. La respuesta viaja por WebSocket al widget del cliente en tiempo real.
5. **La conversación continúa en el widget** del lado del cliente y en el panel del lado del agente, registrando cada mensaje como un evento en el timeline del ticket.
6. **Cuando el caso se resuelve**, el agente cierra el ticket con una resolución. Si en algún momento el agente excede el SLA sin responder, el sistema marca el ticket como *Vencido* y dispara una alerta al gerente.

### A quién sirve

A startups y empresas *mid-market* (50–500 empleados) que ya tienen su propia presencia web y quieren ofrecer soporte interactivo desde ahí, sin delegarle el canal a un proveedor externo. Casos típicos: fintechs, e-commerces, SaaS B2B, plataformas educativas. El usuario primario del lado interno es el **agente de soporte**; el usuario primario del lado externo es el **cliente final** que visita la página y necesita ayuda.

### Glosario rápido

Términos que aparecen a lo largo del documento. Sirve como referencia.

| Término | Qué es |
|---|---|
| **Widget de chat** | Pieza de UI flotante (típicamente en la esquina inferior derecha) que la empresa embebe en su página web. Permite al cliente conversar con soporte sin salir del sitio. |
| **Agente** | Persona del equipo de soporte que atiende los tickets desde el panel web. Puede ser N1 (primera línea) o N2 (especialista). |
| **N1 / N2** | Niveles de soporte. **N1** es el primer contacto y resuelve la mayoría de los casos básicos; **N2** es el equipo especializado al que se escalan los casos que N1 no puede resolver. |
| **Cola de tickets** | Lista de todos los tickets activos que el equipo tiene pendientes de atender. Ordenada por prioridad y antigüedad. |
| **SLA** | *Service Level Agreement.* Compromiso de tiempo en el que el equipo se compromete a responder o resolver. Ej.: "tickets de prioridad alta se responden en máx. 1 hora hábil". |
| **Escalamiento** | Pasar el ticket al siguiente nivel (de N1 a N2, eventualmente al gerente) cuando el nivel actual no puede o no debe resolverlo. |
| **WebSocket** | Conexión persistente bidireccional entre navegador y servidor que permite empujar mensajes en tiempo real sin que el cliente tenga que estar preguntando "¿hay algo nuevo?". |
| **SSE** | *Server-Sent Events.* Mecanismo alternativo a WebSocket para que el servidor empuje mensajes al cliente, pero unidireccional (server → client). Más simple, menos potente. |
| **Timeline** | Secuencia ordenada de eventos del ticket (mensaje del cliente, respuesta del agente, cambio de estado, adjunto, escalamiento). |
| **Watchdog** | Trabajo automático en segundo plano que revisa periódicamente si un ticket excedió su SLA sin respuesta y lo marca como *Vencido*. |
| **Adjunto** | Archivo (imagen, documento) que el cliente o el agente sube al chat para dar contexto. Se guarda en un almacenamiento de objetos, no en la base de datos. |

---

## 2. Actores

### Humanos

- **Cliente final** *(actor primario)* — visitante de la página web de la empresa que abre el widget de chat para pedir ayuda. No necesita registrarse; opcionalmente identifica su email para que la conversación quede ligada a su sesión y pueda retomarla después.
- **Agente de soporte N1** *(actor primario)* — miembro del equipo de soporte que atiende la cola de tickets de primera línea. Lee la cola, toma tickets, responde por chat, cambia estados, resuelve, o escala a N2 si lo amerita.
- **Agente N2 / Especialista** *(actor secundario)* — recibe tickets escalados por N1 cuando requieren conocimiento más profundo (problemas de infraestructura, casos legales, excepciones financieras).
- **Administrador / Gerente** *(actor secundario)* — supervisa al equipo. Ve métricas agregadas (tickets abiertos, tiempo promedio de resolución, distribución por categoría), gestiona accesos del equipo y audita los tickets vencidos.

### Sistemas externos

- **Almacenamiento de objetos** — guarda los adjuntos del chat (imágenes, PDFs) separados de la base de datos. Implementación: Amazon S3.
- **Servicio de notificaciones** — empuja alertas prioritarias al equipo cuando se escala un ticket o cuando se vence un SLA. Implementación: Amazon SNS hacia email/Slack del equipo.

---

## 3. Niveles de prioridad

Clasificación que el sistema asigna automáticamente al ticket al crearlo, según palabras clave del mensaje inicial o una categoría que el cliente elige antes de abrir el chat. El agente puede revisarla y ajustarla. La prioridad determina el SLA y el orden de la cola.

| Prioridad | Cuándo aplica | SLA de primera respuesta |
|---|---|---|
| **Alta** | Algo está bloqueando una operación del cliente o de muchos a la vez. Ej.: no se puede procesar un pago, está caído un servicio crítico, hay sospecha de fraude. | 1 hora hábil |
| **Media** | Algo no funciona bien pero hay un workaround o el impacto es limitado a un cliente. Ej.: pregunta sobre el estado de una transferencia, error puntual al iniciar sesión. | 4 horas hábiles |
| **Baja** | Consulta general, pedido de información, solicitud no urgente. Ej.: dudas sobre comisiones, instrucciones de uso, agradecimientos. | 1 día hábil |

Si el SLA se vence sin respuesta, el sistema marca el ticket como **Vencido** en la cola y dispara una alerta al gerente.

---

## 4. Casos de uso priorizados

User stories en formato *"Como X, quiero Y, para Z"* con criterio de éxito explícito y prioridad **P0** (crítica para el MVP), **P1** (importante pero no bloqueante) o **P2** (deseable).

| # | Prioridad | User story | Criterio de éxito |
|---|---|---|---|
| US-01 | **P0** | Como **sistema**, quiero **recibir una carga útil (payload) desde el widget de chat web** y transformarla en un ticket en la base de datos, para que los agentes puedan verlo en la cola sin intervención manual. | El mensaje del cliente aparece en el panel del agente en ≤ 3 s tras enviarlo desde el widget. |
| US-02 | **P0** | Como **agente**, quiero **escribir una respuesta en el panel** del ticket, para que el cliente la reciba directamente en su widget de chat en la web. | El texto enviado cambia el estado del ticket a *Esperando cliente* y aparece en el widget del cliente en ≤ 2 s. |
| US-03 | **P1** | Como **cliente final**, quiero **enviar una foto** (ej. captura de un error) por el chat web, para que el agente pueda diagnosticar el problema sin tener que pedírmela por otro canal. | La imagen se almacena en S3 con URL firmada y se renderiza con preview en la vista del ticket del agente. |
| US-04 | **P1** | Como **administrador**, quiero **configurar un temporizador que cambie el estado del ticket a *Vencido*** si no hay respuesta en el SLA configurado, para detectar tickets desatendidos. | Un ticket sin respuesta del agente por más del SLA cambia su etiqueta visual en la cola y dispara una alerta al gerente. |
| US-05 | **P2** | Como **agente N1**, quiero **presionar *Escalar*** para que el ticket pase a Nivel 2, enviando una alerta prioritaria al equipo técnico, para no quedarme bloqueado y para que el caso llegue al equipo correcto. | El equipo N2 recibe la notificación vía SNS y asume la propiedad del ticket; queda evento en el timeline con la nota técnica del N1. |

---

## 5. Funcionalidades específicas

Lo que diferencia a Ticke-T de un email genérico o un chat embebido de terceros:

1. **Widget de chat en vivo propio.** Pieza embebible en cualquier página de la empresa, optimizada para cargar rápido y mantener la conversación en tiempo real vía WebSocket. Diseño minimal, sin frames de terceros, sin trackers externos.
2. **Manejo seguro de anexos.** Las imágenes y archivos que el cliente sube por el chat viajan a S3 con URLs firmadas, desvinculando la base de datos del peso de los archivos. La BD solo guarda el puntero y la metadata.
3. **Priorización por metadatos.** Asignación automática de severidad (Alta / Media / Baja) según palabras clave del primer mensaje (*"no funciona", "pago", "urgente"*) o según la categoría que el cliente elige antes de iniciar el chat. El agente puede ajustarla.
4. **Temporizadores de inactividad (watchdogs).** Jobs de fondo que revisan constantemente si un agente dejó un ticket desatendido más allá del SLA. Afectan métricas individuales del agente y disparan alertas al gerente.

---

## 6. Mockups

6 mockups *low-fi* de las pantallas principales del MVP. Los archivos `.html` están en `mockups/` (abren en cualquier navegador); las grabaciones `.webp` se embeben a continuación.

### 6.1 · Login

<img src="mockups/recordings/01-login.webp" width="100%" alt="Pantalla de login común para agentes y administradores">

Acceso al panel para agentes y administradores. Los clientes finales no necesitan login — interactúan vía el widget directamente desde la página de la empresa.
**Cubre:** entrada al sistema del lado del equipo de soporte.

### 6.2 · Cola de tickets (vista agente)

<img src="mockups/recordings/02-cola-agente.webp" width="100%" alt="Cola de tickets del equipo de soporte">

Pantalla principal del agente al iniciar sesión: tabla tipo bandeja de entrada con ID, cliente, asunto (último mensaje), tiempo transcurrido, estado y prioridad con código de colores. Card de atención arriba con el ticket por vencer SLA. Filtros por estado, categoría, prioridad y agente.
**Cubre:** US-04 (visualización de tickets vencidos) y soporta a todas las demás US como pantalla de entrada.

### 6.3 · Detalle del ticket (vista agente, split-view)

<img src="mockups/recordings/03-detalle-agente.webp" width="100%" alt="Detalle del ticket con conversación a la izquierda y panel de acciones a la derecha">

Vista split del ticket: a la izquierda, el historial completo de la conversación con el cliente en formato timeline; a la derecha, panel de metadatos (cliente, asignado a, categoría, prioridad, SLA restante) y botones de acción (responder, reasignar, escalar a N2, cerrar).
**Cubre:** US-02 (respuesta desde el panel).

### 6.4 · Modal de escalamiento

<img src="mockups/recordings/04-modal-escalamiento.webp" width="100%" alt="Modal para escalar un ticket a Nivel 2">

Ventana modal que aparece sobre la vista de detalle al hacer click en *Escalar a N2*. Pide al agente elegir el equipo destino (Aplicaciones core, Infraestructura, Bases de datos, Seguridad, Cumplimiento) y agregar una nota técnica obligatoria. Al confirmar, el ticket pasa a la cola del equipo destino y se publica un mensaje en SNS.
**Cubre:** US-05.

### 6.5 · Widget de chat (vista cliente)

<img src="mockups/recordings/05-widget-cliente.webp" width="100%" alt="Widget de chat flotante en la página web de la empresa">

Pieza embebible que vive en cualquier página de la empresa que contrata Ticke-T. El cliente la abre desde la esquina inferior, escribe su mensaje y mantiene la conversación con el agente en tiempo real. Acepta texto y adjuntos (imagen, PDF). Muestra el estado *"María está escribiendo…"* mientras el agente compone su respuesta.
**Cubre:** US-01 (creación del ticket) y US-03 (adjuntar evidencias).

### 6.6 · Dashboard de métricas (gerente)

<img src="mockups/recordings/06-metricas-gerente.webp" width="100%" alt="Dashboard de métricas del equipo de soporte">

Vista ejecutiva con KPIs del período (tickets recibidos, resueltos, tiempo promedio de resolución, SLA cumplido), gráfico de pendientes vs resueltos para detectar picos, y desgloses por categoría y por agente. Filtros por categoría y agente cambian todos los gráficos a la vez.
**Cubre:** gestión operativa del equipo (no es un user story explícito pero apoya US-04 y la detección de cuellos de botella).

---

## 7. Mapeo funcionalidad → componente del curso

Cómo cada funcionalidad de Ticke-T ejercita los siete componentes que el curso evalúa en las entregas siguientes.

| Componente del curso | Cómo lo ejercita este proyecto (funcionalidad) |
|---|---|
| **Cómputo (API)** | Funciones serverless (AWS Lambda) detrás de API Gateway (REST + WebSocket). Los endpoints REST manejan login, lista de tickets, cambios de estado y carga de adjuntos. El WebSocket maneja el chat en tiempo real entre el widget y el panel del agente. Workers Lambda separados para el watchdog de SLA y los envíos a SNS. |
| **Base de datos** | Instancia administrada (RDS Postgres o DynamoDB) que guarda el esquema con `tickets`, `mensajes`, `clientes`, `agentes`, `historial_de_estados` y `categorías`. Las relaciones son frecuentes (ticket → mensajes, ticket → cliente) lo que favorece relacional; la decisión final queda flaggeada en §9. |
| **Almacenamiento de archivos** | Las capturas y archivos que el cliente sube por el chat se guardan como objetos en Amazon S3 con URLs firmadas y expiración corta. La BD solo guarda el key del objeto y su metadata. |
| **Red** | VPC con subredes públicas para exponer la API/Frontend y subredes privadas para resguardar la base de datos sin acceso a internet directo. El bucket S3 se accede vía VPC endpoint para evitar tráfico inter-AZ por internet pública. |
| **Procesamiento asíncrono** | Amazon SQS para la cola de tareas diferidas (envío de notificaciones, watchdog de SLA); Amazon SNS para el fan-out de alertas prioritarias al equipo N2 cuando se escala un ticket, sin bloquear el frontend. |
| **Seguridad** | Políticas de IAM con roles estrictos que separan permisos de lectura y escritura entre clientes, agentes y administradores. URLs firmadas para los adjuntos con expiración corta. Encryption at rest en RDS y S3. Audit log de todos los cambios de estado de tickets. |
| **Observabilidad** | Amazon CloudWatch para recolectar métricas RED por endpoint (Requests, Errors, Duration). Alarmas configuradas: si la tasa de errores del WebSocket supera 1%, si la cola de notificaciones SQS crece más allá de un umbral, si hay más de 10 tickets vencidos sin atender. |

---

## 8. Scope (in / out)

### IN — lo que el sistema SÍ hace

- API REST + WebSocket para la recepción y envío de mensajes en tiempo real.
- Widget de chat web propio embebible en la página de la empresa.
- Panel de agentes con cola filtrable, detalle split-view y conversación tipo timeline.
- Almacenamiento seguro de imágenes y archivos adjuntos en S3.
- Escalamiento asíncrono de casos de N1 a N2 con notificación prioritaria al equipo destino.
- SLAs por nivel de prioridad con watchdog automático que marca tickets vencidos.
- Roles diferenciados: cliente final (sin login), agente N1, agente N2, gerente/administrador.
- Métricas básicas del equipo y alarmas de infraestructura.

### OUT — lo que el sistema NO hace

- **Integración con WhatsApp, redes sociales u otros canales de mensajería externa.** El canal único es el widget propio en la web de la empresa.
- **Chatbot de IA conversacional complejo.** El sistema puede inferir categoría/prioridad por palabras clave, pero no responde automáticamente al cliente — siempre lo hace un agente humano.
- **Integraciones de facturación.** Cobrar al cliente por usar el chat o cobrar a la empresa que contrata Ticke-T queda fuera del scope del MVP.

---

## 9. Preguntas abiertas

Decisiones técnicas que aún no tomamos. Conscientes y honestas — se cierran en las entregas correspondientes:

- **Base de datos:** ¿RDS Postgres o DynamoDB? El esquema de mensajes de chat puede variar en estructura (algunos mensajes tienen adjuntos, otros no; algunos tienen metadata de geolocalización del cliente, otros no), lo que favorece DynamoDB. Pero los joins entre `tickets`, `clientes` y `agentes` para armar la cola del panel son naturales en SQL y costosos de simular en DynamoDB. Decisión en E2.
- **Conexión persistente:** ¿WebSockets (vía API Gateway WebSocket API) o Server-Sent Events (SSE)? WebSocket es bidireccional y permite features como *"agente está escribiendo…"*; SSE es más simple y suficiente si solo el servidor empuja al cliente. Decisión en E3 cuando definamos la red.
- **Identificación de invitados:** ¿cómo identificamos de manera única al cliente final si abre el chat como invitado (sin cuenta)? Opciones: cookie con UUID, fingerprint de navegador, email opcional al iniciar la conversación, o todas combinadas. Afecta cómo retomamos una conversación si el cliente cierra y vuelve a abrir la página.

---

## 10. Anexo IA

### Qué le pedimos a la IA

Trabajamos con **Claude Code (Opus 4.7)** durante una sesión iterativa de definición del sub-dominio del proyecto. El proceso no fue lineal: pivoteamos varias veces antes de llegar a Ticke-T con widget de chat propio.

1. **Primera dirección — sistema de incidentes SRE.** La IA inicialmente nos sugirió un *sistema de gestión de incidentes de producción para equipos SRE/DevOps*. Lo descartamos porque exigía mucho conocimiento previo del rol SRE para entender el problema.
2. **Segunda dirección — helpdesk empresarial enterprise.** La IA propuso un helpdesk corporativo con integraciones a AD/Okta, AI para auto-categorización, SSO complejo. Lo descartamos por estar sobreingenierado para un proyecto académico.
3. **Tercera dirección — WhatsApp como canal de ingesta.** Diseñamos una versión que ingiere mensajes desde la API de WhatsApp Business de Meta vía webhooks. La descartamos por feasibility: la WhatsApp Cloud API requiere Business Verification, número WhatsApp Business y onboarding con Meta que no es viable con cuenta personal de AWS.
4. **Cuarta dirección — formulario web + email.** Diseñamos una versión donde el solicitante creaba tickets desde un formulario web y la conversación viajaba por email. La descartamos porque perdía el atractivo de "experiencia controlada por la empresa" — el email es un canal genérico y rompe la sensación de soporte interactivo.
5. **Versión final — Ticke-T con widget de chat en vivo propio.** Convergimos en un sistema autocontenido: una pieza embebible en la página de la empresa, comunicación en tiempo real vía WebSocket, sin canales externos, sin AI generativa, sin dependencias de terceros. Mantiene la simplicidad pedagógica del MVP y le da un argumento de venta concreto: "controlás el canal, controlás la experiencia".

### Qué descartamos y por qué

- **Dominio SRE.** Bueno técnicamente pero abrumador como pitch. Demasiados términos del rol como prerrequisito.
- **Helpdesk enterprise.** Demasiados componentes opcionales (SSO con AD/Okta, AI classifier, KB sugerida, integración con Jira/Intune) que distraían del core y no sumaban puntaje proporcional al esfuerzo.
- **WhatsApp como canal.** Funcionalidad linda pero sin garantías de poder implementarse en E2+. Mejor un canal que controlamos (widget propio) que uno que depende de aprobación externa.
- **Formulario web + email.** Funcional pero genérico — cualquiera tiene email; el widget de chat es el diferencial que justifica construir un sistema en lugar de usar Zendesk de terceros.
- **Copiloto generativo de respuestas.** La IA lo propuso. Lo descartamos porque excede el alcance pedagógico de un curso de infraestructura.

### Qué aceptamos sin cambios sustanciales

- **Estructura del documento.** Las 11 secciones (Resumen, Actores, Prioridades, US, Funcionalidades, Mockups, Mapeo, Scope, Preguntas abiertas, Anexo IA, Coordinación D1) las sugirió la IA y las mantuvimos.
- **Mapeo a los componentes del curso.** Las elecciones de servicios AWS (Lambda + API Gateway con WebSocket, RDS o DynamoDB, S3, VPC, SQS+SNS, IAM, CloudWatch) las propuso la IA y las validamos como apropiadas para Ticke-T.
- **Sistema de diseño Apple-language de los mockups.** El `styles.css` y la dirección visual (esquinas suaves, hairlines, paleta neutral con un único acento azul) se mantuvo de la iteración anterior.

### Cómo verificamos cada parte

Política del curso: **cada miembro del equipo puede explicar cualquier parte del documento sin la IA presente.** Para asegurarlo:

- Revisamos cada user story preguntándonos *"¿qué métrica concreta usamos para verificar que se cumplió?"* — vaguedades reescritas.
- Cada mockup tiene una caption con qué cubre y por qué se ve así; si no podemos defenderla, rehacemos el mockup.
- El glosario rápido de §1 cubre todos los términos técnicos que aparecen en el resto del documento.

### Aprendizaje sobre colaboración con IA

La IA tuvo el reflejo correcto de aceptar pivotes cuando un dominio no funcionaba, en lugar de doblar la apuesta a la dirección original. Cada iteración cerró posibilidades que sabíamos no servían y nos acercó al diseño final. **La fricción útil de la IA es cuando te ofrece alternativas concretas en vez de insistir con la dirección inicial.** El descarte explícito de las versiones intermedias también nos enseñó qué evitar en el siguiente intento.

*(pendiente: ampliar con observaciones de las próximas entregas)*

---
