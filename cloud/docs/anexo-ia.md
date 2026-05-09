# Anexo IA — Entrega 1

> Reflexión obligatoria sobre el uso de inteligencia artificial en esta entrega (rubric, p.3 y p.10).
> **Política del curso (textual, p.3):** *"La IA es una herramienta del equipo, no un autor. Cada miembro debe poder explicar cualquier parte del documento sin la IA presente."*

---

## Qué le pedimos a la IA

Trabajamos con **Claude Code (Opus 4.7)** durante una sesión de planificación + redacción asistida. Pedidos concretos:

1. **Lectura completa del rubric (PDF) y separación entre requisitos vs. elecciones.** Específicamente, le pedimos que detectara si la entrega 1 requería implementación de aplicación o sólo documentación.
2. **Brainstorm del sub-dominio específico** dentro de "sistema de tickets e incidentes" — partiendo del enunciado genérico del rubric.
3. **Estructura completa del documento maestro** según las secciones que el rubric exige para E1, dejando placeholders para E2–E5.
4. **Generación de las user stories priorizadas** (P0/P1/P2) con criterio de éxito explícito.
5. **Diseño de los 7 mockups *low-fi*** en HTML estático.
6. **Tabla de mapeo funcionalidad → componente del curso.**
7. **Identificación honesta de preguntas abiertas** que aún no estamos en condiciones de responder.

---

## Qué aceptamos sin cambios sustanciales

- La **separación crítica** entre requisitos del rubric y elecciones nuestras: la IA detectó que la página 1 dice *"No se requiere implementación en código ni despliegue real"* y que la página 10 dice *"Un equipo puede sacar puntaje completo sin haber tocado un servicio cloud"*. Ese hallazgo cambió completamente el alcance — pasamos de "construir una app Next.js completa" a "documento E1 + mockups". La decisión final fue del equipo, pero la información que la habilitó vino de la IA leyendo el rubric con criterio.
- **Estructura de las 13 secciones del documento maestro**, alineada al orden del rubric.
- **Diseño y composición de los 7 mockups HTML**, incluyendo el sistema de badges semánticos (SEV1–4, estados) y la coherencia narrativa entre ellos (el mismo `INC-2026-05-104` atraviesa varias pantallas).

## Qué editamos

*[A completar por el equipo después de revisar y editar el documento.]*

Ejemplos del tipo de edición que esperamos hacer:
- *"Ajustamos el lenguaje del Resumen Ejecutivo para que suene a nuestro equipo y no a redacción de IA."*
- *"Cambiamos el threshold de escalation de 5 min a 7 min porque <razón>."*
- *"Eliminamos el mockup #N porque <razón>."*

## Qué descartamos y por qué

*[A completar por el equipo. La IA propuso varias opciones que decidimos no incluir; cada equipo debe documentar honestamente qué.]*

Pre-cargados de la sesión de Claude (verificar que sigan siendo nuestra postura):

1. **Integración con PagerDuty / Opsgenie.** La IA inicialmente la consideró *in scope*. La descartamos porque metía un servicio externo que aumentaba la complejidad del modelo de seguridad (autenticación cruzada, secretos rotables) sin sumar valor pedagógico al curso. Decidimos que la rotación on-call vive dentro del sistema.
2. **Correlación automática de alertas con ML.** Sugerida por la IA como *"funcionalidad específica avanzada"*. La descartamos porque el rubric premia simplicidad bien justificada (p. 19: *"Un sistema simple bien justificado supera a uno complejo sin razón"*). ML era complejidad sin justificación.
3. **Mobile app nativa.** Descartada porque web responsive cumple el caso de uso del *on-call* sin agregar costo de mantener dos plataformas.
4. **Construcción de la app Next.js como parte de E1.** Esta era inicialmente nuestra intención (no viene de la IA — la IA fue quien la flaggeó como *fuera de rubric*). Decidimos diferirla: si hay margen entre entregas la retomamos, pero no compromete el puntaje de E1.

---

## Cómo verificamos cada parte

Como exige la política del curso, **cada miembro del equipo puede explicar cualquier parte del documento sin la IA presente**. Para asegurarlo:

- Revisamos cada user story preguntándonos *"¿qué métrica usamos para verificar que se cumplió?"* — cualquier respuesta vaga la editamos.
- Cada mockup tiene una *caption* al final explicando qué cubre y por qué se ve así; si no podemos defender esa caption, rehacemos el mockup.
- Las preguntas abiertas (sección 8) son honestas: si pudiéramos responderlas hoy, no estarían ahí.

---

## Aprendizaje sobre colaboración con IA

*[A completar por el equipo — lo que aprendieron en este ciclo. Esta sección es lo que el rubric (p. 16) pide específicamente para la presentación final: "Una cosa concreta que aprendieron sobre colaborar con IA en este proyecto".]*

Observación inicial de esta entrega: la IA tuvo el reflejo correcto de leer el rubric primero y flaggear la diferencia entre lo que pedíamos ("construir la app") y lo que el curso pedía ("documento de diseño"). Sin esa fricción, hubiéramos perdido tiempo (y posiblemente la entrega entera) en código que el rubric no evalúa. **La fricción útil de la IA es cuando dice "esperá" en vez de ejecutar lo pedido sin chequear.**
