# Guida a wxBrainstorm

Come discutere un suggerimento di un cliente, una richiesta di funzionalità o una tua idea con il pannello
di wxBrainstorm, e trasformare ciò che decidi in una decisione registrata e, se vuoi, in uno scope.

- **Comando:** `/wxBrainstorm`
- **Si esegue in:** il tuo assistente AI (Claude Code, Cursor, BLACKBOX AI), oppure dalla Dev Cockpit nella
  sezione comandi **Standard**
- **Fase:** qualsiasi. Di solito si usa in Design, prima di `/buildscope`
- **Scrive:** solo in `docs/brainstorms/`, nel registro delle decisioni e nel tuo file personale di
  apprendimenti, e solo dopo che hai approvato un riepilogo. Non scrive mai scope, specifiche o codice,
  e non esegue mai commit o push.

---

## 1. Cos'è

wxBrainstorm prende una idea (o un gruppo di suggerimenti correlati dei clienti) e la esamina con un pannello
di undici ruoli, gli stessi ruoli di agenti che wxG-O-D usa per costruire il software:

| Ruolo | Guarda l'idea da questo lato |
|---|---|
| **Architetto capo** (presidente) | Dove si colloca e se si adatta al design esistente. Fornisce la raccomandazione del pannello su ogni punto |
| **Analista di dominio** | Il bisogno reale dietro la richiesta, il flusso di lavoro e le regole di business che cambia |
| **Analista legacy** | Cosa faceva il sistema precedente, per le app convertite o legacy |
| **Ingegnere database** | Nuovi dati, backfill, volumi, reportistica |
| **Ingegnere backend** | API, job, integrazioni, cosa succede in caso di errore |
| **Ingegnere frontend** | Quale schermata, come la trovano gli utenti, accessibilità |
| **Ingegnere DevOps** | Costo di esercizio, nuovi servizi, monitoraggio, deploy sicuro |
| **Ingegnere della sicurezza** | Chi può vederlo o farlo, fughe di dati tra clienti, casi di abuso |
| **Ingegnere QA** | Come viene testato, quale comportamento funzionante potrebbe compromettere |
| **Ingegnere della migrazione** | Spostamento dei dati o dei clienti esistenti verso il nuovo modo, rollback |
| **Ingegnere della documentazione** | Pagine di aiuto, note di rilascio, come viene spiegato ai clienti |

Intervengono solo i ruoli toccati dal tuo argomento. L'Architetto capo e l'Analista di dominio intervengono
sempre. Gli altri che restano fuori vengono citati in una riga, così puoi chiamarne uno.

Il risultato è una breve registrazione di **cosa hai deciso e perché**, conservata in `docs/brainstorms/`.
Questa registrazione evita che lo stesso suggerimento venga discusso di nuovo il mese successivo, e può
essere passata direttamente a `/buildscope`.

---

## 2. Quando usarlo (e quando no)

**Usa wxBrainstorm quando:**

- un cliente chiede qualcosa e devi decidere se farlo, e come
- più clienti hanno inviato suggerimenti simili e vuoi raggrupparli e classificarli
- hai una tua idea per un progetto esistente e vuoi metterla alla prova prima di definirne lo scope
- una segnalazione di feedback richiede una decisione, non solo una correzione

**Usa invece:**

| Situazione | Usa invece |
|---|---|
| L'"idea" è un intero nuovo prodotto o un piano di progetto completo | `/wxG-O-D` (esegue wxBrainstorm al proprio interno dove serve) |
| Sai già esattamente cosa costruire | `/buildscope` direttamente |
| È un semplice bug con una soluzione ovvia | Correggilo tramite `/implement` |
| Vuoi verificare uno scope esistente per cercarne le lacune | `/analyzescope` |

Se, durante la discussione, l'argomento si rivela un nuovo prodotto, il pannello lo dirà e suggerirà
`/wxG-O-D`.

---

## 3. Come iniziare

```text
/wxBrainstorm                                             # asks what to brainstorm
/wxBrainstorm customers keep asking to export the board to Excel
/wxBrainstorm --level=amateur                             # explains every idea in plain terms
/wxBrainstorm --resume                                    # continue an open brainstorm
```

| Argomento | Cosa fa |
|---|---|
| testo libero | L'idea. Viene comunque riformulata e confermata prima che venga cercato qualsiasi cosa |
| `--level=amateur` (o `--amateur`) | Nuovo ai progetti di sviluppo. Ogni idea viene spiegata in termini semplici, con la buona pratica che c'è dietro |
| `--level=junior` (o `--junior`) | Qualche esperienza. Spiegazioni brevi per i termini familiari, complete per quelli nuovi |
| `--level=senior` (o `--senior`) | Esperto. Una riga per ruolo, poi la raccomandazione. Da lì chiedi tu. **Questo è il valore predefinito** |
| `--resume` | Elenca le brainstorm aperte e continua quella che scegli |

Se non indichi un livello, ti viene chiesto una volta. Senza risposta si usa senior. Quando sei chiaramente
a tuo agio nel tuo livello, il pannello può suggerire di salire di livello, ma non cambia mai livello da solo.

---

## 4. Come si svolge una sessione

### Passo 1: Il pannello prende posto

Un'introduzione di due o tre righe per gli undici ruoli. Per ora non succede altro.

### Passo 2: Dici cosa esaminare, prima che venga cercato qualcosa

wxBrainstorm **non guarda deliberatamente il tuo codice, i tuoi scope o la documentazione finché l'argomento
non è confermato**. Cercare prima spreca impegno sulla cosa sbagliata e condiziona la domanda con ciò che
si trova per caso nel codice.

Ti viene chiesto, in un unico turno:

1. **Qual è l'idea?** Incollala come l'ha scritta il cliente, indica l'ID di una segnalazione di feedback,
   oppure descrivila con parole tue.
2. **Da dove viene, e quanti l'hanno chiesta?** (facoltativo) Un cliente, più clienti, oppure interno.
   Questo pesa sulla priorità in seguito.
3. **Cosa vuoi ottenere da questa discussione?** Decidere se farlo o no, definire come deve funzionare,
   oppure ordinare più suggerimenti.

Poi l'argomento viene riformulato in una riga, con il bisogno che c'è dietro:

> Argomento: i clienti vogliono la loro board in Excel. Il bisogno sembra essere condividere lo stato con
> persone che non hanno un login. Corretto?

Rispondi **sì** oppure correggilo. Questa riga è il momento più importante della sessione: una richiesta di
"esportazione in Excel" e un bisogno di "condividere lo stato con persone esterne" portano a progetti molto
diversi.

**Più suggerimenti insieme?** Vengono raggruppati (duplicati e quasi duplicati insieme), mostrati come elenco
numerato, e scegli tu quale gruppo va per primo. Ogni gruppo è un argomento a sé con una propria
registrazione, e ciascuno viene cercato solo quando arriva il suo turno.

**ID di segnalazioni di feedback?** Con il server MCP di wxKanban collegato, vengono recuperate solo quelle
segnalazioni. Senza, ti viene chiesto di incollarle.

### Passo 3: Cosa esiste già

Ora il pannello cerca, mirando solo all'argomento confermato: il codice, `specs/Project-Scope/*.md`,
`specs/*/spec.md`, l'aiuto, le brainstorm precedenti e (con MCP collegato) l'indice delle capacità e le
segnalazioni aperte di altri clienti.

Ottieni una tabella come questa:

| Voce | Stato | Evidenza | Affidabilità |
|---|---|---|---|
| Esportazione CSV di un elenco di attività | **Built** (realizzato) | `src/server/routes/tasks.ts:212` | **Confirmed** (confermato) |
| Link in sola lettura della board condivisibile | **Planned** (pianificato, `SCOPE-0NN`) | documento di scope | **Likely** (probabile) |
| Output Excel (.xlsx) | **Not found** (non trovato) | cercato in route, servizi, aiuto | **Unknown** (sconosciuto) |

- **Stato:** **Built** (realizzato) · **Partly built** (parzialmente realizzato) · **Planned** (pianificato,
  `SCOPE-NNN`) · **Decided before** (già deciso, vedi registrazione) · **Not found** (non trovato)
- **Affidabilità:** **Confirmed** (confermato, è stato letto) · **Likely** (probabile) · **Assumed**
  (presunto) · **Unknown** (sconosciuto) · **Conflicting** (in conflitto, due fonti non concordano)

Un "non trovato" non viene mai trattato come prova. Una ricerca ristretta viene etichettata
**Unknown** (sconosciuto).

Ciò che la tabella cambia viene detto per primo:

- **Già realizzato:** il vero argomento potrebbe essere che i clienti non lo trovano, un lavoro per l'aiuto
  e per la schermata, non nuovo codice.
- **Già deciso:** vengono mostrate la decisione precedente e la sua motivazione, e ti viene chiesto cosa
  è cambiato.
- **Pianificato:** la brainstorm potrebbe modellare quello scope anziché avviarne uno nuovo.

Quando l'argomento cambierebbe lavoro esistente, vedi anche **Cosa toccherebbe la modifica**: le specifiche,
il codice e gli scope dipendenti interessati, dagli strumenti Change Impact del kit. È solo per la
discussione. Non viene registrato nulla.

### Passo 4: Prima analisi del pannello e ordine del giorno

Ogni ruolo pertinente dà una riga, etichettata **Benefit** (beneficio), **Risk** (rischio) o **Question**
(domanda). Poi un ordine del giorno numerato, sempre in questo ordine:

1. **Il bisogno dietro la richiesta** (sempre per primo: i clienti chiedono una soluzione, il pannello
   trova il problema che c'è dietro)
2. **Chi lo userebbe, e con che frequenza**
3. **Riutilizzare o costruire da zero**
4. **La versione minima utile**
5. **Ogni rischio o domanda sollevato dal pannello**, con prima gli elementi da fermare e segnalare
6. **Adattamento e priorità**: adesso, dopo, o mai (sempre per ultimo)

Scegli tu da dove iniziare. Il punto 1 è quello raccomandato.

### Passo 5: La brainstorm vera e propria

Un punto alla volta, in testo semplice, al tuo ritmo. Ogni punto termina con **la raccomandazione del
presidente e una sola domanda semplice**. Rispondi con parole tue. Non ci sono menu.

Prima di ogni "quale passiamo?", l'intero ordine del giorno viene mostrato di nuovo con lo stato di ogni punto:

| Stato | Significato |
|---|---|
| **Suggestion** (suggerimento) | Non ancora discusso |
| **Agreed** (concordato) | Hai accettato la raccomandazione |
| **Changed** (modificato) | Hai deciso qualcosa di diverso da quanto richiesto o raccomandato |
| **Added** (aggiunto) | Un nuovo punto emerso durante la discussione |
| **Declined** (rifiutato) | Deciso contro, con il motivo |
| **Parked** (accantonato) → \<where\> | Appartiene altrove, di solito a un argomento separato |

Al livello amateur ogni punto segue uno schema fisso: a che punto siamo, cos'è, perché conta, il parere del
pannello, il suggerimento, la buona pratica che c'è dietro, e la tua decisione.

### Passo 6: Chiusura e registrazione

Quando dici che hai finito, o quando ogni punto ha uno stato, ottieni un riepilogo raggruppato in
**Agreed**, **Added**, **Changed**, **Declined** e **Parked**. Poi scegli, con parole semplici:

- **record it and take the agreed items to a scope** (registra e porta gli elementi concordati in uno scope)
- **record it only** (registra solo: decisioni conservate, nessuno scope ancora)
- **change the summary first** (modifica prima il riepilogo: correggilo, rivedilo e scegli di nuovo)

**Questo è il primo punto in cui viene scritto qualcosa.** Con una delle due risposte "registra":

1. La registrazione viene scritta in `docs/brainstorms/YYYY-MM-DD-<topic>.md`.
2. Ogni decisione Agreed, Added, Changed e Declined viene aggiunta al registro delle decisioni
   (`decisions/ledger.yaml`) tramite lo script del ledger del kit. Gli elementi Parked vengono registrati
   come domande aperte.
3. I criteri generali alla base delle tue scelte vengono aggiunti al tuo file personale di apprendimenti.

Ti viene detto dove si trova la registrazione e quante voci del registro sono state scritte.

### Passo 7: Passaggio a uno scope (facoltativo)

Solo se hai scelto "porta a uno scope", e con il tuo via libera prima di ciascuno:

1. `/buildscope --from-md docs/brainstorms/<file>.md`. Il suo controllo di riutilizzo decide se modificare
   uno scope esistente o crearne uno nuovo, e tutti i suoi passaggi interattivi restano validi.
2. `/validateScope` sul risultato.
3. `/createSpecs` viene proposto, ma viene eseguito solo se lo chiedi.

La registrazione viene aggiornata man mano che ogni voce viene completata: **To scope?** diventa
`done (SCOPE-NNN)`. Se un comando fallisce o si ferma su un gate, la sessione si interrompe e dice esattamente
dove. Non aggira mai un gate.

**Risposta al cliente.** Quando l'idea viene da un cliente, puoi chiedere una bozza di risposta in parole
semplici: cosa è stato deciso e, per un'idea rifiutata, perché. Viene mostrata solo in chat. Non viene mai
inviata, e lo stato della segnalazione di feedback non viene mai cambiato, a meno che tu non lo chieda.

---

## 5. Parlare con il pannello

Questi funzionano in qualsiasi momento durante il passo 5:

| Digiti | Cosa succede |
|---|---|
| **explain** (spiegazione) | La versione più lunga del punto corrente: contesto, un esempio, i compromessi, come verrebbe costruito. Poi si torna alla forma breve |
| **question** (domanda) ... (come prima parola) | Una domanda laterale. Viene risposta, poi la brainstorm torna dov'era. Non è una decisione e non viene aggiunta all'ordine del giorno a meno che tu non lo chieda |
| **Security, what worries you?** (Sicurezza, cosa ti preoccupa?) | Chiama un ruolo per nome. Quel ruolo risponde con la propria voce, poi restituisce la parola al presidente |
| **what else could we do?** (cosa altro potremmo fare?) | Mostra le alternative (di solito trattenute per mantenere ogni turno breve) |
| Una nuova idea durante un punto | Annotata in una riga; il punto corrente viene prima concluso, poi la nuova idea viene aggiunta in fondo come **Added** (aggiunto) |
| **pause** (pausa) / "this is getting long" (questo sta diventando lungo) | Propone di salvare la brainstorm come aperta (vedi sezione 7) |

Quando i ruoli non sono d'accordo, vengono mostrate entrambe le posizioni e l'Architetto capo fornisce la
raccomandazione e il compromesso. Il pannello non nasconde mai il disaccordo.

### Quando il pannello si ferma e segnala

Il pannello segnala questi casi chiaramente come **Risk** (rischio), con una raccomandazione, anziché
aggirarli in silenzio:

- l'idea è in conflitto con una regola di business esistente o con il comportamento attuale dell'app
- potrebbe perdere o corrompere dati esistenti, oppure non può essere annullata
- cambia chi può vedere o fare cosa, oppure tocca i dati di un altro cliente
- dipende da un sistema o servizio che l'app non ha
- è cresciuta oltre ciò che il cliente ha effettivamente chiesto

---

## 6. Il blocco appunti

`docs/brainstorms/Scratchpad.md` è una vista in tempo reale della sessione, su una sola schermata: argomento,
tuo livello, chi sta parlando, **a che punto siamo**, l'ordine del giorno con gli stati, gli elementi in
attesa in fondo all'elenco, e ciò che è stato concordato ma non ancora registrato.

Aprilo accanto alla chat così non perdi mai il filo: in VS Code, apri il file e premi `Ctrl+K V`.

È una **visualizzazione, non una registrazione**. Nessuno lo legge come decisione. Quando un argomento si
chiude, viene ridotto a una riga che indica la registrazione.

---

## 7. Pausa e ripresa

Una brainstorm lunga riempie la conversazione e la rallenta. Fai una pausa dopo la chiusura di un argomento,
o ogni volta che sembra lunga.

**Per mettere in pausa a metà di un argomento:** dillo. Il salvataggio è una scrittura, quindi ti viene
chiesto prima. Con un sì, la registrazione viene scritta con **Status: open**, le decisioni prese finora,
l'ordine del giorno rimanente e il punto successivo. Poi ti viene detto:

> Salvato. Digita `/clear`, poi `/wxBrainstorm --resume`, e riprendiamo da: \<next item\>.

**Per riprendere:** esegui `/wxBrainstorm --resume`. Ottieni l'elenco delle brainstorm aperte (argomento, data
di apertura, punto successivo) e ne scegli una. Le decisioni prese e l'ordine del giorno vengono mostrati di
nuovo, il blocco appunti viene ricreato, e la sessione continua al livello salvato. La ricerca non viene
ripetuta a meno che tu non la chieda, oppure a meno che la registrazione non abbia più di una settimana: in
quel caso viene proposto un aggiornamento, perché l'app potrebbe essere cambiata.

---

## 8. Cosa viene scritto e dove

| File | Quando | Contenuto |
|---|---|---|
| `docs/brainstorms/Scratchpad.md` | Durante tutta la sessione | Solo vista in tempo reale; rispecchia ciò che è sullo schermo |
| `docs/brainstorms/YYYY-MM-DD-<topic>.md` | Dopo che approvi il riepilogo (o accetti di mettere in pausa) | La registrazione: richiesta, cosa esiste già, pannello, decisioni, punti aperti, passo successivo |
| `decisions/ledger.yaml` | Subito dopo la registrazione, solo con un riepilogo approvato | Una voce per decisione, scritta da `_wxAI/askgate/ledger.mjs`. Non modificare mai questo file a mano; un hook lo blocca |
| `~/.wxai/god-learnings.md` (Windows: `%USERPROFILE%\.wxai\god-learnings.md`) | Subito dopo il registro | Criteri generali dalle tue scelte, condivisi con wxG-O-D, così le future raccomandazioni si adattano al tuo modo di decidere. Non contiene mai nomi di progetti, clienti, percorsi o numeri di scope. Puoi leggerlo, modificarlo o svuotarlo in qualsiasi momento |

### Il record

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

Le sessioni successive sullo stesso argomento aggiornano lo stesso file. Le righe di decisione precedenti non
vengono mai riscritte: una decisione ribaltata è una nuova riga che indica cosa sostituisce.

---

## 9. Regole di base

- **Chiede prima di cercare.** L'argomento viene sempre confermato per primo.
- **Testo semplice, nessun menu,** per tutta la sessione.
- **Non viene scritto nulla finché non approvi un riepilogo,** a parte il blocco appunti.
- **Non scrive mai scope, specifiche, attività o codice.** `/buildscope`, `/validateScope` e `/createSpecs`
  vengono eseguiti solo con il tuo via libera, secondo le loro regole.
- **Non esegue mai commit, push o deploy, e non invia nulla a un cliente.**
- **Nessun dato personale.** I clienti vengono indicati tramite ID di feedback o data, mai con nome, email o
  telefono. I file `.env`, le chiavi e i certificati non vengono mai aperti.
- **I fatti sono citati, i suggerimenti sono etichettati.** Un'affermazione sull'app rimanda al punto in cui
  è stata trovata. Tutto il resto è contrassegnato come **Assumed** (presunto).

---

## 10. Consigli per una buona sessione

- **Incolla le parole del cliente, non il tuo riassunto.** L'Analista di dominio ricava il bisogno dietro la
  richiesta; il tuo riassunto potrebbe aver già scelto una soluzione.
- **Dedica il tempo al punto 1.** Capire bene il bisogno rende breve il resto dell'ordine del giorno.
- **Di' "Declined" ad alta voce.** Un "no, perché..." registrato vale quanto un "sì". È ciò che evita che la
  stessa richiesta venga discussa di nuovo.
- **Tieni un solo argomento per sessione.** Accantona ciò che devia. Un punto accantonato diventerà in seguito
  una brainstorm a sé.
- **Usa "question" liberamente.** Le domande laterali non cambiano mai l'ordine del giorno né contano come
  decisioni.
- **Metti in pausa e fai `/clear` tra un argomento e l'altro.** Una sessione nuova per argomento è più rapida
  e mantiene il pannello concentrato.
- **Leggi le registrazioni precedenti prima di una sessione di pianificazione del rilascio.** `docs/brainstorms/`
  è la storia di ciò che è stato deciso e del perché.

---

## 11. Risoluzione dei problemi

| Sintomo | Causa e soluzione |
|---|---|
| "Il controllo d'impatto non è disponibile in questo kit" | `_wxAI/impact/` non è installato in questo progetto. La brainstorm prosegue senza di esso; aggiorna il kit per averlo |
| "Il registro non è installato" | `_wxAI/askgate/ledger.mjs` manca. La registrazione viene comunque scritta; aggiorna il kit per avere le voci del registro |
| Lo script del registro rifiuta una voce | Rifiuta i duplicati e gli approvatori vuoti. Il rifiuto viene riportato in parole semplici e non viene aggirato; verifica se la decisione è già nel registro |
| Gli ID di feedback non si possono recuperare | Il server MCP di wxKanban non è collegato. Incolla invece il testo delle segnalazioni |
| `/buildscope` si ferma su un gate durante il passaggio | La sessione si interrompe e dice dove. Risolvi il gate, poi riesegui il passaggio per gli elementi rimanenti |
| `--resume` non elenca nulla | Nessuna registrazione ha **Status: open**. Gli argomenti chiusi si riaprono avviando una nuova brainstorm sullo stesso tema; la registrazione precedente viene trovata nel passo 3 |

---

## Collegamenti

- `/wxG-O-D`: pianificazione dell'intero progetto; esegue wxBrainstorm per le sue revisioni, idee e brainstorm di design
- `/buildscope`, `/validateScope`, `/createSpecs`: la catena di passaggio
- Riferimento dei comandi: la pagina Help nell'app per `/wxBrainstorm`
- Registrazioni passate: `docs/brainstorms/`
