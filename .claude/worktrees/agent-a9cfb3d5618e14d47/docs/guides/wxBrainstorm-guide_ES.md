# Guía de wxBrainstorm

Cómo hablar de una sugerencia de cliente, una petición de funcionalidad o una idea propia con el panel de wxBrainstorm, y cómo convertir lo que decidas en una decisión registrada y, si quieres, en un alcance (scope).

- **Comando:** `/wxBrainstorm`
- **Se ejecuta en:** tu asistente de IA (Claude Code, Cursor, BLACKBOX AI), o desde el Dev Cockpit, en los comandos **Standard**
- **Etapa:** cualquiera. Normalmente se usa en Design, antes de `/buildscope`
- **Escribe:** solo `docs/brainstorms/`, el libro de decisiones y tu archivo personal de aprendizajes, y solo después de que apruebes un resumen. Nunca escribe alcances, especificaciones ni código, y nunca hace commit ni push.

---

## 1. Qué es

wxBrainstorm toma una idea (o un puñado de sugerencias de clientes relacionadas) y la trabaja con un panel de once roles, los mismos roles de agente que usa wxG-O-D para construir software:

| Rol | Mira la idea desde este lado |
|---|---|
| **Arquitecto principal** (presidente) | Dónde vive, si encaja con el diseño existente. Da la recomendación del panel en cada punto |
| **Analista de dominio** | La necesidad real detrás de la petición, el flujo de trabajo y las reglas de negocio que cambia |
| **Analista del sistema heredado** | Lo que hacía el sistema antiguo, en aplicaciones convertidas o heredadas |
| **Ingeniero de base de datos** | Datos nuevos, carga histórica de datos (backfills), volumen, informes |
| **Ingeniero de backend** | APIs, trabajos (jobs), integraciones, qué pasa cuando falla algo |
| **Ingeniero de frontend** | Qué pantalla, cómo la encuentran los usuarios, accesibilidad |
| **Ingeniero de DevOps** | Coste de funcionamiento, servicios nuevos, monitorización, despliegue seguro |
| **Ingeniero de seguridad** | Quién puede verlo o hacerlo, fugas de datos entre clientes, casos de abuso |
| **Ingeniero de QA** | Cómo se prueba, qué comportamiento correcto podría romper |
| **Ingeniero de migración** | Mover datos o clientes existentes a la nueva forma, y cómo volver atrás (rollback) |
| **Ingeniero de documentación** | Páginas de ayuda, notas de versión, cómo se explica a los clientes |

Solo hablan los roles que toca tu tema. El Arquitecto principal y el Analista de dominio siempre participan. Los demás que se quedan fuera se nombran en una línea, para que puedas pedir que intervengan.

El resultado es un registro breve de **qué decidiste y por qué**, guardado en `docs/brainstorms/`. Ese registro evita que la misma sugerencia se vuelva a discutir el mes que viene, y puede pasarse directamente a `/buildscope`.

---

## 2. Cuándo usarlo (y cuándo no)

**Usa wxBrainstorm cuando:**

- un cliente pide algo y necesitas decidir si lo haces, y cómo
- varios clientes han enviado sugerencias parecidas y quieres agruparlas y priorizarlas
- tienes una idea propia para un proyecto existente y quieres que la pongan a prueba antes de definir su alcance
- un informe de feedback necesita una decisión, no solo una corrección

**Usa otra cosa cuando:**

| Situación | Usa en su lugar |
|---|---|
| La "idea" es un producto nuevo completo o un plan de proyecto completo | `/wxG-O-D` (ejecuta wxBrainstorm dentro de sí mismo cuando lo necesita) |
| Ya sabes exactamente qué construir | `/buildscope` directamente |
| Es un error sencillo con una solución obvia | Corrígelo con `/implement` |
| Quieres auditar un alcance existente para encontrar huecos | `/analyzescope` |

Si el tema resulta ser un producto nuevo completo a mitad de camino, el panel lo dirá y sugerirá `/wxG-O-D`.

---

## 3. Cómo empezar

```text
/wxBrainstorm                                             # asks what to brainstorm
/wxBrainstorm customers keep asking to export the board to Excel
/wxBrainstorm --level=amateur                             # explains every idea in plain terms
/wxBrainstorm --resume                                    # continue an open brainstorm
```

| Argumento | Qué hace |
|---|---|
| texto libre | La idea. Se sigue reformulando y confirmando antes de buscar nada |
| `--level=amateur` (o `--amateur`) | Nuevo en proyectos de desarrollo. Cada idea se explica en términos sencillos, con la buena práctica que hay detrás |
| `--level=junior` (o `--junior`) | Algo de experiencia. Explicaciones breves de los términos conocidos, completas para los nuevos |
| `--level=senior` (o `--senior`) | Con experiencia. Una línea por rol y después la recomendación. Tú preguntas desde ahí. **Es el valor por defecto** |
| `--resume` | Lista los brainstorms abiertos y continúa el que elijas |

Si no indicas un nivel, se te pregunta una vez. Sin respuesta, se usa senior. Cuando estés claramente cómodo con tu nivel, el panel puede sugerir subir de nivel, pero nunca cambia de nivel por su cuenta.

---

## 4. Cómo transcurre una sesión

### Paso 1: Se sienta el panel

Una introducción de dos o tres líneas con los once roles. Todavía no pasa nada más.

### Paso 2: Dices qué analizar, antes de que se busque nada

wxBrainstorm **deliberadamente no mira tu código, tus alcances ni tus documentos hasta que el tema esté confirmado**. Buscar primero desperdicia esfuerzo en lo que no toca y condiciona la pregunta con lo que casualmente haya en el código.

Se te pregunta, en un solo turno:

1. **¿Cuál es la idea?** Pégala tal como la escribió el cliente, da el ID de un informe de feedback o descríbela con tus propias palabras.
2. **¿De dónde viene y cuántos la pidieron?** (opcional) Un cliente, varios o interna. Esto pesa en la prioridad más adelante.
3. **¿Qué quieres sacar de esto?** Decidir si hacerla o no, dar forma a cómo debería funcionar, o priorizar varias sugerencias.

Después, el tema se reformula en una línea, con la necesidad que hay detrás:

> Tema: los clientes quieren su tablero en Excel. La necesidad parece ser compartir el estado con personas que no tienen acceso. ¿Correcto?

Responde **sí** o corrígelo. Esta línea es el momento más importante de la sesión: una petición de "exportar a Excel" y una necesidad de "compartir el estado con externos" llevan a diseños muy distintos.

**¿Varias sugerencias a la vez?** Se agrupan (los duplicados y casi duplicados juntos), se muestran en una lista numerada, y eliges qué grupo va primero. Cada grupo es su propio tema y su propio registro, y cada uno se busca solo cuando le llega su turno.

**¿IDs de informes de feedback?** Con el MCP de wxKanban conectado, solo se obtienen esos informes. Sin él, se te pide que los pegues.

### Paso 3: Lo que ya existe

Ahora el panel busca, centrado solo en el tema confirmado: el código, `specs/Project-Scope/*.md`, `specs/*/spec.md`, la ayuda, los brainstorms anteriores y (con el MCP conectado) el índice de capacidades y los informes de feedback abiertos de otros clientes.

Obtienes una tabla como esta:

| Elemento | Estado | Evidencia | Confianza |
|---|---|---|---|
| Exportación a CSV de una lista de tareas | **Built** (Construido) | `src/server/routes/tasks.ts:212` | **Confirmed** (Confirmado) |
| Enlace de tablero compartido de solo lectura | **Planned** (Planificado) (`SCOPE-0NN`) | documento de alcance | **Likely** (Probable) |
| Salida a Excel (.xlsx) | **Not found** (No encontrado) | buscado en rutas, servicios y ayuda | **Unknown** (Desconocido) |

- **Estado:** Built · Partly built · Planned (`SCOPE-NNN`) · Decided before (registro) · Not found
- **Confianza:** Confirmed (se leyó) · Likely · Assumed (supuesto) · Unknown · Conflicting (dos fuentes no coinciden)

Un **Not found** (No encontrado) nunca se toma como prueba. Una búsqueda limitada se etiqueta como Unknown.

Lo que cambia la tabla se dice primero:

- **Ya construido:** el tema real puede ser que los clientes no lo encuentran, algo que se resuelve con la ayuda y la pantalla, no con código nuevo.
- **Decidido antes:** se muestra la decisión anterior y su motivo, y se te pregunta qué ha cambiado.
- **Planificado:** el brainstorm puede dar forma a ese alcance en lugar de empezar uno nuevo.

Cuando el tema cambiaría trabajo existente, también ves **Qué alcanzaría el cambio**: las especificaciones, el código y los alcances dependientes afectados, a partir de las herramientas de Change Impact del kit. Es solo para la discusión. No se registra nada.

### Paso 4: Primera mirada del panel, y la agenda

Cada rol aplicable da una línea, etiquetada como **Benefit** (Beneficio), **Risk** (Riesgo) o **Question** (Pregunta). Después viene una agenda numerada, siempre en este orden:

1. **La necesidad detrás de la petición** (siempre primero: los clientes piden una solución, el panel encuentra el problema que hay detrás)
2. **Quién lo usaría, y con qué frecuencia**
3. **Reutilizar o construir algo nuevo**
4. **La versión mínima útil**
5. **Cada riesgo o pregunta que planteó el panel**, con primero los puntos que exigen parar y señalar
6. **Encaje y prioridad**: ahora, después o nunca (siempre al final)

Tú eliges por dónde empezar. El punto 1 es el recomendado.

### Paso 5: El brainstorm en sí

Un punto cada vez, en texto plano, a tu ritmo. Cada punto termina con **la recomendación del presidente y una pregunta sencilla**. Responde con tus propias palabras. No hay menús.

Antes de cada "¿cuál sigue?", la agenda completa se vuelve a mostrar con el estado de cada punto:

| Estado | Significado |
|---|---|
| **Suggestion** (Sugerencia) | Todavía no se ha discutido |
| **Agreed** (Acordado) | Aceptaste la recomendación |
| **Changed** (Cambiado) | Decidiste algo distinto de lo que se pidió o se recomendó |
| **Added** (Añadido) | Un punto nuevo que surgió durante la discusión |
| **Declined** (Rechazado) | Descartado, con el motivo |
| **Parked → \<dónde\>** (Aplazado) | Pertenece a otro lugar, normalmente a un tema aparte |

En nivel amateur, cada punto sigue un patrón fijo: dónde estamos, qué es, por qué importa, la postura del panel, la sugerencia, la buena práctica que hay detrás y tu decisión.

### Paso 6: Cierre y registro

Cuando digas que has terminado, o cuando todos los puntos tengan un estado, obtienes un resumen agrupado en **Agreed**, **Added**, **Changed**, **Declined** y **Parked**. Después eliges, con palabras sencillas:

- **record it and take the agreed items to a scope** (registrar y llevar los puntos acordados a un alcance)
- **record it only** (solo registrar: decisiones guardadas, nada aún en un alcance)
- **change the summary first** (cambiar antes el resumen: corregirlo, volver a verlo, elegir de nuevo)

**Este es el primer momento en que se escribe algo.** Con cualquiera de las dos respuestas de registro:

1. El registro se escribe en `docs/brainstorms/YYYY-MM-DD-<topic>.md`.
2. Cada decisión Agreed, Added, Changed y Declined se añade al libro de decisiones (`decisions/ledger.yaml`) mediante el script de libro del kit. Los puntos Parked se registran como preguntas abiertas.
3. Los patrones generales detrás de tus elecciones se añaden a tu archivo personal de aprendizajes.

Se te indica dónde está el registro y cuántas entradas del libro se escribieron.

### Paso 7: Paso a un alcance (opcional)

Solo si elegiste "take it to a scope", y con tu visto bueno antes de cada uno:

1. `/buildscope --from-md docs/brainstorms/<file>.md`. Su propia comprobación de reutilización decide si enmienda un alcance existente o crea uno nuevo, y todos sus pasos interactivos siguen aplicando.
2. `/validateScope` sobre el resultado.
3. `/createSpecs` se ofrece, pero solo se ejecuta si lo pides.

El registro se actualiza a medida que cada punto se incorpora: **To scope?** (¿Al alcance?) pasa a `done (SCOPE-NNN)`. Si algún comando falla o se detiene en una puerta de control, la sesión se para y dice exactamente dónde. Nunca lo sortea.

**Responder al cliente.** Cuando la idea viene de un cliente, puedes pedir un borrador de respuesta en palabras sencillas: qué se decidió y, en el caso de una idea rechazada, por qué. Se muestra solo en el chat. Nunca se envía, y el estado del informe de feedback nunca cambia, salvo que lo digas.

---

## 5. Hablar con el panel

Estas opciones funcionan en cualquier momento del paso 5:

| Escribes | Qué ocurre |
|---|---|
| **explain** (explicar) | La versión más larga del punto actual: contexto, un ejemplo, las ventajas y desventajas, cómo se construiría. Después vuelve a la forma corta |
| **question** (pregunta) ... (como primera palabra) | Una pregunta lateral. Se responde y el brainstorm vuelve a donde estaba. No es una decisión ni se añade a la agenda salvo que después digas que la añadas |
| **Security, what worries you?** (Seguridad, ¿qué te preocupa?) | Llama a un rol por su nombre. Ese rol responde con su propia voz y luego devuelve la palabra al presidente |
| **what else could we do?** (¿qué más podríamos hacer?) | Muestra las alternativas (normalmente se retienen para que cada turno sea breve) |
| Una idea nueva a mitad de un punto | Se anota en una línea, el punto actual se termina primero, y luego la nueva se añade al final como **Added** |
| **pause** (pausa) / "this is getting long" | Ofrece guardar el brainstorm como abierto (ver sección 7) |

Cuando los roles no están de acuerdo, se muestran ambas posturas, y el Arquitecto principal da la recomendación y el equilibrio entre opciones. El panel nunca oculta un desacuerdo.

### Cuándo el panel se detiene y lo señala

El panel planteará estos casos claramente como **Risk** (Riesgo), con una recomendación, en lugar de diseñar en silencio alrededor de ellos:

- la idea entra en conflicto con una regla de negocio existente o con el comportamiento actual de la aplicación
- podría perder o corromper datos existentes, o no se puede deshacer
- cambia quién puede ver o hacer qué, o toca datos de otro cliente
- depende de un sistema o servicio que la aplicación no tiene
- ha crecido más allá de lo que el cliente realmente pidió

---

## 6. El bloc de notas

`docs/brainstorms/Scratchpad.md` es una vista en vivo, de una sola pantalla, de la sesión: el tema, tu nivel, quién está hablando, **dónde estamos**, la agenda con sus estados, los puntos en espera al final de la lista, y lo que se ha acordado pero aún no se ha registrado.

Ábrelo junto al chat para no perder tu sitio: en VS Code, abre el archivo y pulsa `Ctrl+K V`.

Es una **pantalla, no un registro**. Nada lo lee como decisión. Cuando un tema se cierra, se reduce a una línea que nombra el registro.

---

## 7. Pausar y reanudar

Un brainstorm largo llena la conversación y la ralentiza. Haz una pausa después de cerrar un tema, o cuando sientas que se alarga.

**Para pausar a mitad de un tema:** dilo. Guardar es una escritura, así que se te pregunta antes. Si dices que sí, el registro se escribe con **Status: open** (Estado: abierto), las decisiones tomadas hasta ese momento, la agenda pendiente y el siguiente punto. Entonces se te indica:

> Guardado. Escribe `/clear`, luego `/wxBrainstorm --resume`, y seguiremos con: \<siguiente punto\>.

**Para reanudar:** ejecuta `/wxBrainstorm --resume`. Obtienes la lista de brainstorms abiertos (tema, fecha de apertura, siguiente punto) y eliges uno. Las decisiones tomadas y la agenda se muestran de nuevo, el bloc de notas se recrea y la sesión continúa en el nivel guardado. La búsqueda no se repite salvo que la pidas, o si el registro tiene más de una semana; en ese caso se ofrece actualizarla, porque la aplicación pudo haber cambiado.

---

## 8. Qué se escribe, y dónde

| Archivo | Cuándo | Contenido |
|---|---|---|
| `docs/brainstorms/Scratchpad.md` | Durante toda la sesión | Solo vista en vivo; refleja lo que hay en pantalla |
| `docs/brainstorms/YYYY-MM-DD-<topic>.md` | Después de que apruebes el resumen (o aceptes pausar) | El registro: petición, lo que ya existe, panel, decisiones, puntos abiertos, siguiente paso |
| `decisions/ledger.yaml` | Justo después del registro, solo con un resumen aprobado | Una entrada por decisión, escrita por `_wxAI/askgate/ledger.mjs`. Nunca edites este archivo a mano; un hook lo bloquea |
| `~/.wxai/god-learnings.md` (en Windows: `%USERPROFILE%\.wxai\god-learnings.md`) | Justo después del libro de decisiones | Patrones generales de tus elecciones, compartidos con wxG-O-D, para que las recomendaciones futuras encajen con tu forma de decidir. Nunca contiene nombres de proyectos, clientes, rutas ni números de alcance. Puedes leerlo, editarlo o borrarlo en cualquier momento |

### El registro

```markdown
# Brainstorm: <topic>

- **Status:** open | closed
- **Opened / last updated:** YYYY-MM-DD / YYYY-MM-DD
- **Source:** <feedback report ID, "customer call", "sales demo", "internal">
- **Asked for by:** <how many customers, or which kind; never a name>
- **Level:** amateur | junior | senior
- **Next item:** <while open>

## The request
## What already exists
## Panel
## Decisions
| # | Item | Decision | Kind | To scope? | Date |
## Open items
## Next step
```

Las sesiones posteriores sobre el mismo tema actualizan el mismo archivo. Las filas de decisiones anteriores nunca se reescriben: una decisión revertida es una fila nueva que indica qué reemplaza.

---

## 9. Reglas básicas

- **Pregunta antes de buscar.** El tema siempre se confirma primero.
- **Texto plano, sin menús,** durante toda la sesión.
- **Nada se escribe hasta que apruebes un resumen,** salvo el bloc de notas.
- **Nunca escribe alcances, especificaciones, tareas ni código.** `/buildscope`, `/validateScope` y `/createSpecs` se ejecutan solo con tu visto bueno, y bajo sus propias reglas.
- **Nunca hace commit, push, despliegue ni envía nada a un cliente.**
- **Sin datos personales.** Los clientes se mencionan por ID de feedback o por fecha, nunca por nombre, correo o teléfono. Nunca se abren archivos `.env`, claves ni certificados.
- **Los hechos se citan, las sugerencias se etiquetan.** Una afirmación sobre la aplicación apunta a dónde se encontró. Todo lo demás se marca como **Assumed** (Supuesto).

---

## 10. Consejos para una buena sesión

- **Pega las palabras del cliente, no tu resumen de ellas.** El Analista de dominio deduce la necesidad que hay detrás de la petición; tu resumen quizá ya haya elegido una solución.
- **Dedica el tiempo al punto 1.** Entender bien la necesidad hace que el resto de la agenda sea corto.
- **Di "Declined" en voz alta.** Un "no, porque..." registrado vale tanto como un "sí". Es lo que evita que la misma petición se vuelva a discutir.
- **Mantén un solo tema por sesión.** Aparca lo que se desvíe. Un punto aparcado se convierte después en su propio brainstorm.
- **Usa "question" con libertad.** Las preguntas laterales nunca cambian la agenda ni cuentan como decisiones.
- **Pausa y haz `/clear` entre temas.** Una sesión nueva por tema es más rápida y mantiene al panel centrado.
- **Lee los registros anteriores antes de una sesión de planificación de versiones.** `docs/brainstorms/` es el historial de lo que se decidió y por qué.

---

## 11. Solución de problemas

| Síntoma | Causa y solución |
|---|---|
| La comprobación de impacto no está disponible en este kit | `_wxAI/impact/` no está instalado en este proyecto. El brainstorm continúa sin ella; actualiza el kit para obtenerla |
| El libro de decisiones no está instalado | Falta `_wxAI/askgate/ledger.mjs`. El registro se escribe igualmente; actualiza el kit para obtener las entradas del libro |
| El script del libro rechaza una entrada | Rechaza duplicados y aprobadores vacíos. El rechazo se informa en palabras sencillas y no se sortea; comprueba si la decisión ya está en el libro |
| No se pueden obtener los IDs de feedback | El MCP de wxKanban no está conectado. Pega en su lugar el texto de los informes |
| `/buildscope` se detiene en una puerta de control durante el paso a alcance | La sesión se detiene y dice dónde. Resuelve la puerta de control y vuelve a ejecutar el paso para los puntos restantes |
| `--resume` no lista nada | Ningún registro tiene **Status: open**. Los temas cerrados se reabren iniciando un nuevo brainstorm sobre el mismo asunto; el registro anterior se encuentra en el paso 3 |

---

## Relacionado

- `/wxG-O-D`: planificación de todo el proyecto; ejecuta wxBrainstorm para sus revisiones, ideas y brainstorms de diseño
- `/buildscope`, `/validateScope`, `/createSpecs`: la cadena de paso a alcance
- Referencia de comandos: la página de Ayuda de la aplicación para `/wxBrainstorm`
- Registros anteriores: `docs/brainstorms/`
