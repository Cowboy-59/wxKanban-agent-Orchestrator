# Process and design flow diagrams: `docs/GOD-Process-Design-Flow.md`

One document with the sections below, in order. Each diagram gets a one-line "how to read" note above
it and a short evidence note below it naming the files it was drawn from. Draw only what the evidence
supports. If a box would be a guess, it is drawn as Assumed or Unknown, or left out.

The customer document reuses diagrams 1, 2, and 3. Copy the Mermaid block as-is so all the documents
show the same picture.

## Confidence styling

Paste this block into every flowchart and give every node a class:

```text
  classDef confirmed fill:#d6eaf8,stroke:#2e86c1,color:#1b2631
  classDef likely fill:#e8f6f3,stroke:#45b39d,color:#1b2631
  classDef assumed fill:#fef9e7,stroke:#d4ac0d,color:#1b2631,stroke-dasharray:4 3
  classDef unknown fill:#f2f3f4,stroke:#909497,color:#424949,stroke-dasharray:4 3
  classDef conflicting fill:#fdedec,stroke:#cb4335,color:#1b2631
```

Add a legend line under each flowchart: solid blue = Confirmed · green = Likely · dashed yellow =
Assumed · dashed grey = Unknown · red = Conflicting.

---

## 1. Delivery process flow

The phases from management plan § 8, each ending in its gate. A failed gate loops back. Discovery
packages feed phase 1. Use the plan's real phase names. The skeleton shows the default eight.

```mermaid
flowchart TD
  classDef confirmed fill:#d6eaf8,stroke:#2e86c1,color:#1b2631
  classDef assumed fill:#fef9e7,stroke:#d4ac0d,color:#1b2631,stroke-dasharray:4 3
  IN[Evidence - code, docs, conversion output, scopes]:::confirmed --> P1
  P1[1 - Discovery and stabilization]:::confirmed --> G1{Planning readiness gate}
  G1 -->|pass| P2[2 - Architecture and delivery foundation]:::confirmed
  G1 -->|gaps open| P1
  P2 --> G2{Contracts frozen}
  G2 -->|pass| P3[3 - Data model and migration foundation]:::confirmed
  G2 -->|rework| P2
  P3 --> P4[4 - Core domain and workflows]:::confirmed
  P3 --> P5[5 - User experience, reports, integrations]:::confirmed
  P4 --> G3{Functional parity}
  P5 --> G3
  G3 -->|pass| P6[6 - Security, observability, hardening]:::confirmed
  G3 -->|defects| P4
  P6 --> P7[7 - Migration rehearsal and acceptance]:::confirmed
  P7 --> G4{Release readiness and customer sign-off}
  G4 -->|go| P8[8 - Release and post-release monitoring]:::confirmed
  G4 -->|no go| P7
```

## 2. Current-state context

The system as reconstructed, not the target: users and roles on the left, the system's modules in
the middle, data stores, and external systems at the edges. Style every node by confidence.

```mermaid
flowchart LR
  classDef confirmed fill:#d6eaf8,stroke:#2e86c1,color:#1b2631
  classDef likely fill:#e8f6f3,stroke:#45b39d,color:#1b2631
  classDef assumed fill:#fef9e7,stroke:#d4ac0d,color:#1b2631,stroke-dasharray:4 3
  classDef unknown fill:#f2f3f4,stroke:#909497,color:#424949,stroke-dasharray:4 3
  U1([Order clerk]):::confirmed --> M1[Order entry window]:::confirmed
  U2([Manager]):::likely --> M2[Reports]:::confirmed
  M1 --> DB1[(Legacy database)]:::confirmed
  M2 --> DB1
  M1 -.-> X1[[Shipping vendor API]]:::assumed
  DB1 -.-> X2[[Nightly export job]]:::unknown
```

Shapes: `([...])` person or role, `[...]` module or screen, `[(...)]` data store, `[[...]]` external
system or job. A dashed arrow `-.->` is an Assumed or Unknown connection.

## 3. Target design flow

How the new system is built: client → API → domain modules → data, with authentication, background
work, and integrations as their own nodes. Label an arrow with its contract (REST, event, file,
batch) when it is known.

```mermaid
flowchart TD
  classDef confirmed fill:#d6eaf8,stroke:#2e86c1,color:#1b2631
  classDef assumed fill:#fef9e7,stroke:#d4ac0d,color:#1b2631,stroke-dasharray:4 3
  WEB[Web client]:::confirmed -->|REST| API[API layer]:::confirmed
  API --> AUTH[Authentication and roles]:::confirmed
  API --> ORD[Orders module]:::confirmed
  API --> INV[Invoicing module]:::confirmed
  ORD --> DB[(Application database)]:::confirmed
  INV --> DB
  JOBS[Background jobs]:::assumed --> DB
  INV -->|file export| ACC[[Accounting system]]:::assumed
```

## 4. Critical workflow sequences

One sequence diagram for each of the top one to three critical workflows in management plan § 3. Show
the main failure or cancel path as an `alt` block.

```mermaid
sequenceDiagram
  actor Clerk
  participant UI as Order entry screen
  participant API as Orders API
  participant DB as Application database
  Clerk->>UI: Enter order and save
  UI->>API: POST /orders
  API->>DB: Insert order and lines
  alt validation fails
    API-->>UI: 422 with field errors
    UI-->>Clerk: Highlight fields
  else saved
    DB-->>API: Order id
    API-->>UI: 201 Created
    UI-->>Clerk: Show order number
  end
```

## 5. Data model (ERD)

Only when a data model was found. Follow `data-integrity.md` § The ERD: start from the conversion's
own ER in `rebuild/db/`, draw declared relationships solid and used-but-not-enforced ones dashed, show
at most fifteen entities per diagram, and split a larger model by module. The skeleton below shows the
syntax only.

```mermaid
erDiagram
  CUSTOMER ||--o{ ORDERS : places
  ORDERS ||--|{ ORDERLINE : contains
  PRODUCT ||--o{ ORDERLINE : "appears on"
  CUSTOMER {
    uuid id PK
    string name
  }
  ORDERS {
    uuid id PK
    uuid customerid FK
    date orderdate
  }
```

## 6. Migration and cutover flow (Conversion mode only)

The path the legacy data and users take to the new system. Name the strategy chosen in management
plan § 4.9 in the "how to read" line.

```mermaid
flowchart TD
  classDef confirmed fill:#d6eaf8,stroke:#2e86c1,color:#1b2631
  classDef assumed fill:#fef9e7,stroke:#d4ac0d,color:#1b2631,stroke-dasharray:4 3
  L[(Legacy database)]:::confirmed --> B[Verified backup]:::confirmed
  B --> E[Extract]:::confirmed --> T[Transform and map]:::confirmed --> V{Validate}
  V -->|rejects| Q[Data quality queue]:::assumed --> T
  V -->|clean| LD[Load target]:::confirmed --> R{Reconcile counts and totals}
  R -->|mismatch| RB[Restore and fix mapping]:::confirmed --> E
  R -->|match| PR[Parallel run]:::confirmed --> C{Cutover decision}
  C -->|go| GO[Cutover and monitor]:::confirmed
  C -->|no go| PR
```

---

## Mermaid syntax cautions

The PDF renderer uses the project's own `mermaid` package (10.x). A diagram that fails to parse fails
the whole render, so:

- Use only `flowchart`, `sequenceDiagram`, `erDiagram`, and `stateDiagram-v2`. Newer types
  (architecture, block, C4, xychart) may not exist in the installed version.
- Inside flowchart node labels and subgraph titles, avoid `·`, `&`, `#`, `;`, `:`, quotes,
  parentheses, and `/`. Use ` - ` and the word "and". The shape brackets `([...])`, `[(...)]`, and
  `[[...]]` are syntax, not label text, so they are fine.
- `&` is fine as the fan-out operator between nodes (`A --> B & C`), never inside a label.
- Node IDs: letters, digits, and underscores only. Never use `end` as an ID.
- In erDiagram, a relationship label with spaces needs double quotes (`: "appears on"`). Attribute
  types are single words.
- One diagram per ```mermaid fence. Keep a flowchart under about 40 nodes. Split a bigger one by
  phase or module.
