# wxBrainstorm-Leitfaden

So besprechen Sie eine Kundenanregung, einen Funktionswunsch oder Ihre eigene Idee mit dem wxBrainstorm-Gremium und überführen das Ergebnis in eine festgehaltene Entscheidung und, falls gewünscht, in einen Scope.

- **Befehl:** `/wxBrainstorm`
- **Läuft in:** Ihrem KI-Assistenten (Claude Code, Cursor, BLACKBOX AI) oder im Dev Cockpit unter **Standard**-Befehlen
- **Phase:** beliebig. Meist wird er in Design verwendet, vor `/buildscope`
- **Schreibt:** nur `docs/brainstorms/`, das Entscheidungsprotokoll und Ihre persönliche Lerndatei, und zwar erst, nachdem Sie eine Zusammenfassung genehmigt haben. Er schreibt nie Scopes, Specs oder Code und committet oder pusht nie.

---

## 1. Was es ist

wxBrainstorm nimmt eine Idee (oder einige zusammenhängende Kundenanregungen) und arbeitet sie mit einem Gremium aus elf Rollen durch. Es sind dieselben Agentenrollen, die wxG-O-D zum Bauen von Software verwendet.

| Rolle | Betrachtet die Idee aus dieser Sicht |
|---|---|
| **Lead Architect** (Vorsitz) | Wo sie angesiedelt ist und ob sie zum bestehenden Design passt. Gibt zu jedem Punkt die Empfehlung des Gremiums ab |
| **Domain Analyst** | Der eigentliche Bedarf hinter der Anfrage, der Arbeitsablauf und die Geschäftsregeln, die sie verändert |
| **Legacy Analyst** | Was das alte System getan hat, bei konvertierten oder Legacy-Anwendungen |
| **Database Engineer** | Neue Daten, Nachpflege, Datenmenge, Auswertungen |
| **Backend Engineer** | APIs, Jobs, Integrationen und was bei einem Fehler passiert |
| **Frontend Engineer** | Welcher Bildschirm, wie Benutzer ihn finden, Barrierefreiheit |
| **DevOps Engineer** | Laufende Kosten, neue Dienste, Monitoring, sichere Auslieferung |
| **Security Engineer** | Wer es sehen oder tun darf, Datenlecks zwischen Kunden, Missbrauchsfälle |
| **QA Engineer** | Wie es getestet wird und welches bestehende Verhalten es beschädigen könnte |
| **Migration Engineer** | Überführung bestehender Daten oder Kunden in die neue Form, Rollback |
| **Documentation Engineer** | Hilfeseiten, Versionshinweise und wie es Kunden erklärt wird |

Nur die Rollen, die Ihr Thema berührt, melden sich zu Wort. Der Lead Architect und der Domain Analyst tun das immer. Die übrigen Rollen, die sich heraushalten, werden in einer Zeile genannt, damit Sie eine davon hinzuziehen können.

Das Ergebnis ist ein kurzer Eintrag darüber, **was Sie entschieden haben und warum**. Er wird in `docs/brainstorms/` gespeichert. Dieser Eintrag verhindert, dass dieselbe Anregung im nächsten Monat erneut diskutiert wird, und er lässt sich direkt an `/buildscope` übergeben.

---

## 2. Wann Sie es verwenden (und wann nicht)

**Verwenden Sie wxBrainstorm, wenn:**

- ein Kunde etwas verlangt und Sie entscheiden müssen, ob und wie Sie es umsetzen
- mehrere Kunden sich überschneidende Anregungen geschickt haben und Sie diese gruppieren und priorisieren möchten
- Sie eine eigene Idee für ein bestehendes Projekt haben und sie hinterfragen lassen möchten, bevor Sie sie scopen
- ein Feedback-Bericht eine Entscheidung braucht, nicht nur eine Korrektur

**Verwenden Sie stattdessen:**

| Situation | Stattdessen |
|---|---|
| Die "Idee" ist ein neues Produkt oder ein vollständiger Projektplan | `/wxG-O-D` (er führt wxBrainstorm intern aus, wo er es braucht) |
| Sie wissen genau, was zu bauen ist | `/buildscope` direkt |
| Es ist ein einfacher Fehler mit offensichtlicher Lösung | `/implement` zur Behebung |
| Sie möchten einen bestehenden Scope auf Lücken prüfen | `/analyzescope` |

Stellt sich das Thema im Verlauf als ganz neues Produkt heraus, sagt das Gremium es und schlägt `/wxG-O-D` vor.

---

## 3. Starten

```text
/wxBrainstorm                                             # fragt, was besprochen werden soll
/wxBrainstorm customers keep asking to export the board to Excel
/wxBrainstorm --level=amateur                             # erklärt jede Idee in einfachen Worten
/wxBrainstorm --resume                                    # setzt ein offenes Brainstorm fort
```

| Argument | Wirkung |
|---|---|
| freier Text | Die Idee. Sie wird trotzdem wiederholt und bestätigt, bevor irgendetwas durchsucht wird |
| `--level=amateur` (oder `--amateur`) | Neu bei Entwicklungsprojekten. Jede Idee wird in einfachen Worten erklärt, mit der dahinterliegenden guten Praxis |
| `--level=junior` (oder `--junior`) | Etwas Erfahrung. Kurze Erklärungen für vertraute Begriffe, ausführliche für neue |
| `--level=senior` (oder `--senior`) | Erfahren. Eine Zeile pro Rolle, dann die Empfehlung. Ab dort fragen Sie nach. **Das ist der Standard** |
| `--resume` | Listet offene Brainstorms auf und setzt das von Ihnen gewählte fort |

Wenn Sie keine Stufe angeben, werden Sie einmal gefragt. Ohne Antwort gilt senior. Wenn Sie auf Ihrer Stufe deutlich sicher sind, schlägt das Gremium vielleicht einen Wechsel vor, aber es ändert die Stufe nie von selbst.

---

## 4. Wie eine Sitzung abläuft

### Schritt 1: Das Gremium nimmt Platz

Eine zwei- bis dreizeilige Vorstellung der elf Rollen. Sonst passiert noch nichts.

### Schritt 2: Sie sagen, was besprochen werden soll, bevor etwas durchsucht wird

wxBrainstorm durchsucht bewusst **Ihren Code, Ihre Scopes und Dokumente erst, wenn das Thema bestätigt ist**. Eine Suche vorab verschwendet Aufwand am falschen Punkt und färbt die Frage mit dem, was zufällig im Code steht.

In einem Schritt werden Sie gefragt:

1. **Was ist die Idee?** Fügen Sie sie so ein, wie der Kunde sie geschrieben hat, geben Sie eine Feedback-Bericht-ID an oder beschreiben Sie sie mit eigenen Worten.
2. **Woher kommt sie, und wie viele haben danach gefragt?** (optional) Ein Kunde, mehrere oder intern. Das gewichtet die Priorität später.
3. **Was wollen Sie davon?** Entscheiden, ob überhaupt, wie es sich verhalten soll, oder mehrere Anregungen einstufen.

Dann wird das Thema in einer Zeile mit dem dahinterliegenden Bedarf wiederholt:

> Thema: Kunden wollen ihr Board in Excel. Der Bedarf scheint zu sein, den Status mit Personen zu teilen, die keinen Zugang haben. Richtig?

Antworten Sie mit **ja** oder korrigieren Sie es. Diese eine Zeile ist der wichtigste Moment der Sitzung: Eine Anfrage nach "Excel-Export" und ein Bedarf "Status mit Außenstehenden teilen" führen zu sehr unterschiedlichen Designs.

**Mehrere Anregungen auf einmal?** Sie werden gruppiert (Dubletten und nahezu gleiche Anregungen zusammen), als nummerierte Liste angezeigt, und Sie wählen, welche Gruppe zuerst drankommt. Jede Gruppe ist ein eigenes Thema mit eigenem Eintrag und wird erst durchsucht, wenn sie an der Reihe ist.

**Feedback-Bericht-IDs?** Mit verbundenem wxKanban-MCP werden nur diese Berichte abgerufen. Ohne MCP werden Sie gebeten, deren Text einzufügen.

### Schritt 3: Was bereits existiert

Jetzt durchsucht das Gremium gezielt das bestätigte Thema: den Code, `specs/Project-Scope/*.md`, `specs/*/spec.md`, die Hilfe, frühere Brainstorms und (mit verbundenem MCP) den Fähigkeitenindex und offenes Feedback anderer Kunden.

Sie erhalten eine Tabelle wie diese:

| Punkt | Status | Beleg | Vertrauen |
|---|---|---|---|
| CSV-Export einer Aufgabenliste | **Built** (gebaut) | `src/server/routes/tasks.ts:212` | **Confirmed** (bestätigt) |
| Teilbarer Board-Link nur zum Lesen | **Planned** (geplant) (`SCOPE-0NN`) | Scope-Dokument | **Likely** (wahrscheinlich) |
| Excel-Ausgabe (.xlsx) | **Not found** (nicht gefunden) | Routen, Dienste und Hilfe durchsucht | **Unknown** (unbekannt) |

- **Status:** **Built** · **Partly built** (teilweise gebaut) · **Planned** (geplant) (`SCOPE-NNN`) · **Decided before** (früher entschieden) (Eintrag) · **Not found** (nicht gefunden)
- **Confidence:** **Confirmed** (gelesen, bestätigt) · **Likely** (wahrscheinlich) · **Assumed** (angenommen) · **Unknown** (unbekannt) · **Conflicting** (widersprüchlich, zwei Stellen stimmen nicht überein)

"Nicht gefunden" gilt nie als Beweis. Eine enge Suche wird als **Unknown** gekennzeichnet.

Was die Tabelle verändert, wird zuerst gesagt:

- **Schon gebaut:** Das eigentliche Thema könnte sein, dass Kunden es nicht finden. Das ist eine Aufgabe für die Hilfe und den Bildschirm, nicht für neuen Code.
- **Früher entschieden:** Die frühere Entscheidung und ihr Grund werden gezeigt, und Sie werden gefragt, was sich seither geändert hat.
- **Geplant:** Das Brainstorm könnte diesen Scope eher prägen, als einen neuen zu beginnen.

Wenn das Thema bestehende Arbeit verändern würde, sehen Sie außerdem **Was eine Änderung erreichen würde**: die betroffenen Specs, der Code und die abhängigen Scopes, aus den Change-Impact-Werkzeugen des Kits. Das dient nur der Diskussion. Es wird nichts festgehalten.

### Schritt 4: Der erste Blick des Gremiums und die Tagesordnung

Jede zutreffende Rolle gibt eine Zeile ab, gekennzeichnet als **Benefit** (Nutzen), **Risk** (Risiko) oder **Question** (Frage). Danach folgt eine nummerierte Tagesordnung, immer in dieser Reihenfolge:

1. **Der Bedarf hinter der Anfrage** (immer zuerst: Kunden fordern eine Lösung, das Gremium findet das dahinterliegende Problem)
2. **Wer es nutzen würde und wie oft**
3. **Wiederverwenden oder neu bauen**
4. **Die kleinste nützliche Version**
5. **Jedes Risiko oder jede Frage, die das Gremium aufgeworfen hat**, wobei Punkte mit Stopp-und-Markierung zuerst kommen
6. **Passung und Priorität**: jetzt, später oder gar nicht (immer zuletzt)

Sie wählen, wo Sie beginnen. Punkt 1 wird empfohlen.

### Schritt 5: Das Brainstorm selbst

Ein Punkt nach dem anderen, in Klartext und in Ihrem Tempo. Jeder Punkt endet mit **der Empfehlung des Vorsitzenden und einer klaren Frage**. Antworten Sie in Ihren eigenen Worten. Es gibt keine Menüs.

Vor jedem "Welcher als Nächstes?" wird die gesamte Tagesordnung mit dem Status jedes Punkts erneut angezeigt:

| Status | Bedeutung |
|---|---|
| **Suggestion** (Vorschlag) | Noch nicht besprochen |
| **Agreed** (vereinbart) | Sie haben die Empfehlung angenommen |
| **Changed** (geändert) | Sie haben etwas anderes entschieden als gefragt oder empfohlen |
| **Added** (ergänzt) | Ein neuer Punkt, der während der Diskussion aufkam |
| **Declined** (abgelehnt) | Abgelehnt, mit Begründung |
| **Parked → \<where\>** (zurückgestellt) | Gehört anderswohin, meist in ein eigenes Thema |

Auf Amateur-Stufe folgt jeder Punkt einem festen Muster: wo wir stehen, was es ist, warum es wichtig ist, die Sicht des Gremiums, der Vorschlag, die dahinterliegende gute Praxis und Ihre Entscheidung.

### Schritt 6: Abschluss und Festhalten

Wenn Sie sagen, dass Sie fertig sind, oder jeder Punkt einen Status hat, erhalten Sie eine Zusammenfassung, gegliedert nach **Agreed** (vereinbart), **Added** (ergänzt), **Changed** (geändert), **Declined** (abgelehnt) und **Parked** (zurückgestellt). Dann wählen Sie in einfachen Worten:

- **record it and take the agreed items to a scope** (festhalten und die vereinbarten Punkte in einen Scope überführen)
- **record it only** (nur festhalten: Entscheidungen bleiben erhalten, noch nichts wird gescopt)
- **change the summary first** (zuerst die Zusammenfassung ändern: korrigieren, erneut ansehen, neu wählen)

**Dies ist der erste Moment, in dem etwas geschrieben wird.** Bei einer der beiden "festhalten"-Antworten geschieht Folgendes:

1. Der Eintrag wird nach `docs/brainstorms/YYYY-MM-DD-<topic>.md` geschrieben.
2. Jede Entscheidung mit Status Agreed, Added, Changed und Declined wird über das Kit-Skript in das Entscheidungsprotokoll (`decisions/ledger.yaml`) aufgenommen. Zurückgestellte Punkte werden als offene Fragen erfasst.
3. Die allgemeinen Muster hinter Ihren Entscheidungen werden in Ihre persönliche Lerndatei aufgenommen.

Ihnen wird mitgeteilt, wo der Eintrag liegt und wie viele Protokoll-Einträge geschrieben wurden.

### Schritt 7: Übergabe an einen Scope (optional)

Nur wenn Sie **record it and take the agreed items to a scope** gewählt haben, und jeweils mit Ihrem OK vor jedem Schritt:

1. `/buildscope --from-md docs/brainstorms/<file>.md`. Dessen eigene Prüfung auf Wiederverwendung entscheidet, ob ein bestehender Scope geändert oder ein neuer angelegt wird. Alle interaktiven Schritte gelten weiterhin.
2. `/validateScope` für das Ergebnis.
3. `/createSpecs` wird angeboten, aber nur ausgeführt, wenn Sie es verlangen.

Der Eintrag wird bei jedem übernommenen Punkt aktualisiert: **To scope?** wird zu `done (SCOPE-NNN)`. Bleibt ein Befehl stehen oder hält er an einem Gate an, stoppt die Sitzung und sagt genau, wo. Sie umgeht nichts.

**Antwort an den Kunden.** Wenn die Idee von einem Kunden stammt, können Sie einen einfach formulierten Antwortentwurf anfordern: was entschieden wurde und, bei einer abgelehnten Idee, warum. Er wird nur im Chat angezeigt. Er wird nie gesendet, und der Status des Feedback-Berichts wird nur geändert, wenn Sie es ausdrücklich sagen.

---

## 5. Mit dem Gremium sprechen

Diese Befehle funktionieren jederzeit während Schritt 5:

| Sie tippen | Was passiert |
|---|---|
| **explain** (erkläre) | Die ausführlichere Fassung des aktuellen Punkts: Hintergrund, ein Beispiel, die Abwägungen, wie es gebaut würde. Danach zurück zur Kurzform |
| **question** ... (als erstes Wort) (Frage) | Eine Nebenfrage. Sie wird beantwortet, dann kehrt das Brainstorm an seine Stelle zurück. Sie ist keine Entscheidung und wird nicht zur Tagesordnung hinzugefügt, außer Sie sagen danach, dass sie hinzukommen soll |
| **Security, what worries you?** (Security, was beunruhigt Sie?) | Ruft eine Rolle beim Namen auf. Diese Rolle antwortet mit ihrer eigenen Stimme und übergibt dann an den Vorsitz zurück |
| **what else could we do?** (Was könnten wir noch tun?) | Zeigt die Alternativen (normalerweise zurückgehalten, um jeden Beitrag kurz zu halten) |
| Eine neue Idee während eines Punkts | Wird in einer Zeile notiert. Der aktuelle Punkt wird zuerst fertig besprochen, dann wird die neue Idee als **Added** (ergänzt) ans Ende gesetzt |
| **pause** (Pause) / "this is getting long" (das wird lang) | Bietet an, das Brainstorm als offen zu speichern (siehe Abschnitt 7) |

Wenn Rollen sich widersprechen, werden beide Seiten gezeigt, und der Lead Architect gibt die Empfehlung und den Kompromiss an. Das Gremium verbirgt Meinungsverschiedenheiten nie.

### Wenn das Gremium anhält und markiert

Das Gremium spricht diese Punkte klar als **Risk** (Risiko) mit einer Empfehlung an, statt sie stillschweigend zu umgehen:

- die Idee widerspricht einer bestehenden Geschäftsregel oder dem heutigen Verhalten der App
- sie könnte bestehende Daten verlieren oder beschädigen oder ist nicht rückgängig zu machen
- sie ändert, wer was sehen oder tun darf, oder berührt die Daten eines anderen Kunden
- sie hängt von einem System oder Dienst ab, den die App nicht hat
- sie ist über das hinausgewachsen, was der Kunde tatsächlich verlangt hat

---

## 6. Der Notizblock

`docs/brainstorms/Scratchpad.md` ist eine einbildschirmige Live-Ansicht der Sitzung: das Thema, Ihre Stufe, wer gerade spricht, **wo wir stehen**, die Tagesordnung mit Status, Punkte, die am Ende der Liste warten, und was vereinbart, aber noch nicht festgehalten ist.

Öffnen Sie ihn neben dem Chat, damit Sie nie Ihren Platz verlieren: In VS Code öffnen Sie die Datei und drücken `Ctrl+K V`.

Er ist eine **Anzeige, kein Protokoll**. Nichts liest ihn als Entscheidung. Wenn ein Thema abgeschlossen ist, wird er auf eine Zeile zurückgesetzt, die den Eintrag nennt.

---

## 7. Pausieren und Fortsetzen

Ein langes Brainstorm füllt die Unterhaltung und macht sie langsamer. Pausieren Sie, nachdem ein Thema abgeschlossen ist, oder wann immer es sich lang anfühlt.

**Um mitten im Thema zu pausieren:** Sagen Sie es. Speichern ist ein Schreibvorgang, deshalb werden Sie vorher gefragt. Bei Ja wird der Eintrag mit **Status: open** geschrieben, mit den bisherigen Entscheidungen, der restlichen Tagesordnung und dem nächsten Punkt. Dann wird Ihnen mitgeteilt:

> Gespeichert. Geben Sie `/clear` ein, dann `/wxBrainstorm --resume`, und wir machen weiter mit: \<next item\>.

**Um fortzusetzen:** Führen Sie `/wxBrainstorm --resume` aus. Sie erhalten die Liste der offenen Brainstorms (Thema, Datum der Eröffnung, nächster Punkt) und wählen eines aus. Die bisherigen Entscheidungen und die Tagesordnung werden erneut angezeigt, der Notizblock wird neu erstellt, und die Sitzung läuft auf der gespeicherten Stufe weiter. Die Suche wird nicht wiederholt, außer Sie verlangen es oder der Eintrag ist älter als eine Woche. In diesem Fall wird eine Aktualisierung angeboten, weil sich die App inzwischen geändert haben kann.

---

## 8. Was geschrieben wird und wo

| Datei | Wann | Inhalt |
|---|---|---|
| `docs/brainstorms/Scratchpad.md` | Während der gesamten Sitzung | Nur Live-Ansicht; spiegelt, was auf dem Bildschirm steht |
| `docs/brainstorms/YYYY-MM-DD-<topic>.md` | Nachdem Sie die Zusammenfassung genehmigt haben (oder einer Pause zustimmen) | Der Eintrag: Anfrage, was bereits existiert, Gremium, Entscheidungen, offene Punkte, nächster Schritt |
| `decisions/ledger.yaml` | Direkt nach dem Eintrag, nur bei genehmigter Zusammenfassung | Ein Eintrag pro Entscheidung, geschrieben von `_wxAI/askgate/ledger.mjs`. Diese Datei nie von Hand bearbeiten; ein Hook blockiert das |
| `~/.wxai/god-learnings.md` (Windows: `%USERPROFILE%\.wxai\god-learnings.md`) | Direkt nach dem Protokoll | Allgemeine Muster aus Ihren Entscheidungen, mit wxG-O-D geteilt, damit künftige Empfehlungen zu Ihrer Art zu entscheiden passen. Enthält nie Projektnamen, Kunden, Pfade oder Scope-Nummern. Sie können ihn jederzeit lesen, bearbeiten oder leeren |

### Der Eintrag

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

Spätere Sitzungen zum selben Thema aktualisieren dieselbe Datei. Frühere Entscheidungszeilen werden nie umgeschrieben: Eine rückgängig gemachte Entscheidung ist eine neue Zeile, die sagt, was sie ersetzt.

---

## 9. Grundregeln

- **Fragt, bevor gesucht wird.** Das Thema wird immer zuerst bestätigt.
- **Klartext, keine Menüs,** während der gesamten Sitzung.
- **Nichts wird geschrieben, bevor Sie eine Zusammenfassung genehmigen,** abgesehen vom Notizblock.
- **Schreibt nie Scopes, Specs, Aufgaben oder Code.** `/buildscope`, `/validateScope` und `/createSpecs` laufen nur auf Ihr OK hin, nach ihren eigenen Regeln.
- **Committet, pusht, deployt oder sendet nie etwas an einen Kunden.**
- **Keine personenbezogenen Daten.** Kunden werden über Feedback-ID oder Datum genannt, nie über Name, E-Mail oder Telefonnummer. `.env`-Dateien, Schlüssel und Zertifikate werden nie geöffnet.
- **Fakten werden belegt, Vorschläge gekennzeichnet.** Eine Aussage über die App verweist darauf, wo sie gefunden wurde. Alles andere wird als **Assumed** (angenommen) markiert.

---

## 10. Tipps für eine gute Sitzung

- **Fügen Sie die Worte des Kunden ein, nicht Ihre Zusammenfassung davon.** Der Domain Analyst erarbeitet den Bedarf hinter der Anfrage. Ihre Zusammenfassung hat vielleicht schon eine Lösung gewählt.
- **Investieren Sie die Zeit in Punkt 1.** Wenn der Bedarf stimmt, wird der Rest der Tagesordnung kurz.
- **Sagen Sie "Declined" laut.** Ein festgehaltenes "Nein, weil ..." ist so wertvoll wie ein "Ja". Es verhindert, dass dieselbe Anfrage erneut diskutiert wird.
- **Behalten Sie ein Thema pro Sitzung.** Parken Sie alles, was abdriftet. Ein geparkter Punkt wird später ein eigenes Brainstorm.
- **Nutzen Sie "question" großzügig.** Nebenfragen ändern nie die Tagesordnung und zählen nicht als Entscheidungen.
- **Pausieren und `/clear` zwischen den Themen.** Eine neue Sitzung pro Thema ist schneller und hält das Gremium fokussiert.
- **Lesen Sie frühere Einträge vor einer Release-Planung.** `docs/brainstorms/` ist die Historie dessen, was entschieden wurde und warum.

---

## 11. Fehlerbehebung

| Symptom | Ursache und Lösung |
|---|---|
| "The impact check is not available in this kit" | `_wxAI/impact/` ist in diesem Projekt nicht installiert. Das Brainstorm läuft ohne diese Prüfung weiter. Aktualisieren Sie das Kit, um sie zu erhalten |
| "The ledger is not installed" | `_wxAI/askgate/ledger.mjs` fehlt. Der Eintrag wird trotzdem geschrieben. Aktualisieren Sie das Kit, um Protokoll-Einträge zu erhalten |
| Das Protokoll-Skript lehnt einen Eintrag ab | Es lehnt Dubletten und leere Genehmiger ab. Die Ablehnung wird in klaren Worten gemeldet und nicht umgangen. Prüfen Sie, ob die Entscheidung bereits im Protokoll steht |
| Feedback-IDs können nicht abgerufen werden | Das wxKanban-MCP ist nicht verbunden. Fügen Sie stattdessen den Text der Berichte ein |
| `/buildscope` hält bei der Übergabe an einem Gate an | Die Sitzung stoppt und sagt, wo. Lösen Sie das Gate und starten Sie die Übergabe für die übrigen Punkte erneut |
| `--resume` listet nichts auf | Kein Eintrag hat **Status: open**. Abgeschlossene Themen werden wieder eröffnet, indem Sie ein neues Brainstorm zum selben Thema beginnen. Der frühere Eintrag wird in Schritt 3 gefunden |

---

## Verwandte Themen

- `/wxG-O-D`: Planung des gesamten Projekts. Führt wxBrainstorm für seine Review-, Ideen- und Design-Brainstorms aus
- `/buildscope`, `/validateScope`, `/createSpecs`: die Übergabekette
- Befehlsreferenz: die In-App-Hilfeseite für `/wxBrainstorm`
- Frühere Einträge: `docs/brainstorms/`
