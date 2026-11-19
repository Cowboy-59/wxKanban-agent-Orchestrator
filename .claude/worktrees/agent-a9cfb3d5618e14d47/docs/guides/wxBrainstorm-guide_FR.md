# Guide wxBrainstorm

Comment discuter d'une suggestion client, d'une demande de fonctionnalité ou de votre propre idée avec le panel
wxBrainstorm, et transformer ce que vous décidez en décision enregistrée et, si vous le souhaitez, en périmètre (scope).

- **Commande :** `/wxBrainstorm`
- **S'exécute dans :** votre assistant IA (Claude Code, Cursor, BLACKBOX AI), ou depuis le Dev Cockpit sous les commandes **Standard**
- **Étape du cycle de vie :** toutes. Il est généralement utilisé en phase de conception (Design), avant `/buildscope`
- **Écrit :** uniquement `docs/brainstorms/`, le registre des décisions et votre fichier personnel d'apprentissages, et seulement après votre approbation d'un récapitulatif. Il n'écrit jamais de périmètres, de spécifications ni de code, et ne fait jamais de commit ni de push.

---

## 1. Ce que c'est

wxBrainstorm prend une idée (ou quelques suggestions client liées) et la travaille avec un panel de onze rôles, les mêmes rôles d'agents que wxG-O-D utilise pour construire le logiciel :

| Rôle | Regarde l'idée sous cet angle |
|---|---|
| **Lead Architect** (président) | Où elle se situe, si elle s'intègre à la conception existante. Donne la recommandation du panel sur chaque point |
| **Domain Analyst** | Le besoin réel derrière la demande, le flux de travail et les règles métier qu'elle modifie |
| **Legacy Analyst** | Ce que faisait l'ancien système, pour les applications converties ou héritées |
| **Database Engineer** | Nouvelles données, reprises de données, volume, reporting |
| **Backend Engineer** | API, traitements, intégrations, ce qui se passe en cas d'échec |
| **Frontend Engineer** | Quel écran, comment les utilisateurs le trouvent, accessibilité |
| **DevOps Engineer** | Coût d'exploitation, nouveaux services, supervision, déploiement sûr |
| **Security Engineer** | Qui peut le voir ou le faire, fuites de données entre clients, cas d'abus |
| **QA Engineer** | Comment il est testé, quels comportements existants il pourrait casser |
| **Migration Engineer** | Transfert des données ou des clients existants vers la nouvelle façon de faire, retour arrière |
| **Documentation Engineer** | Pages d'aide, notes de version, explication aux clients |

Seuls les rôles concernés par votre sujet interviennent. Le Lead Architect et le Domain Analyst participent toujours.
Les autres rôles absents sont nommés en une ligne, pour que vous puissiez les faire intervenir.

Le résultat est un bref enregistrement de **ce que vous avez décidé et pourquoi**, conservé dans `docs/brainstorms/`.
Cet enregistrement évite de rediscuter la même suggestion le mois suivant, et il peut être transmis directement à `/buildscope`.

---

## 2. Quand l'utiliser (et quand ne pas le faire)

**Utilisez wxBrainstorm lorsque :**

- un client demande quelque chose et vous devez décider s'il faut le faire, et comment
- plusieurs clients ont envoyé des suggestions qui se recoupent et vous voulez les regrouper et les classer
- vous avez votre propre idée pour un projet existant et voulez la faire challenger avant de la cadrer en périmètre
- un rapport de retour (feedback) demande une décision, et pas seulement une correction

**Utilisez autre chose lorsque :**

| Situation | Utilisez plutôt |
|---|---|
| Il s'agit d'un nouveau produit complet ou d'un plan de projet complet | `/wxG-O-D` (il lance wxBrainstorm en interne lorsqu'il en a besoin) |
| Vous savez déjà exactement quoi construire | `/buildscope` directement |
| C'est un simple bug avec une correction évidente | Corrigez-le via `/implement` |
| Vous voulez auditer un périmètre existant pour y trouver des failles | `/analyzescope` |

Si le sujet s'avère être un nouveau produit en cours de route, le panel le signalera et suggérera `/wxG-O-D`.

---

## 3. Lancer la session

```text
/wxBrainstorm                                             # asks what to brainstorm
/wxBrainstorm customers keep asking to export the board to Excel
/wxBrainstorm --level=amateur                             # explains every idea in plain terms
/wxBrainstorm --resume                                    # continue an open brainstorm
```

| Argument | Ce qu'il fait |
|---|---|
| texte libre | L'idée. Elle est toujours reformulée et confirmée avant toute recherche |
| `--level=amateur` (ou `--amateur`) | Nouveau dans les projets de développement. Chaque idée est expliquée simplement, avec les bonnes pratiques sous-jacentes |
| `--level=junior` (ou `--junior`) | Une certaine expérience. Explications courtes pour les termes familiers, complètes pour les nouveaux |
| `--level=senior` (ou `--senior`) | Expérimenté. Une ligne par rôle, puis la recommandation. Vous posez vos questions ensuite. **C'est la valeur par défaut** |
| `--resume` | Liste les sessions ouvertes et reprend celle que vous choisissez |

Si vous ne précisez pas de niveau, on vous le demande une fois. Sans réponse, le niveau senior est retenu. Lorsque vous
êtes clairement à l'aise à votre niveau, le panel peut suggérer de passer au niveau supérieur, mais il ne change jamais
de niveau de lui-même.

---

## 4. Déroulement d'une session

### Étape 1 : le panel prend place

Une introduction de deux ou trois lignes présentant les onze rôles. Rien d'autre ne se passe encore.

### Étape 2 : vous dites quoi débattre, avant toute recherche

wxBrainstorm **ne consulte délibérément pas votre code, vos périmètres ni vos documents tant que le sujet n'est pas
confirmé**. Chercher d'abord ferait perdre du temps sur la mauvaise question et biaiserait la réflexion avec ce qui se
trouve par hasard dans le code.

On vous demande, en un seul échange :

1. **Quelle est l'idée ?** Collez-la telle que le client l'a écrite, donnez l'identifiant d'un rapport de retour, ou
   décrivez-la avec vos propres mots.
2. **D'où vient-elle, et combien l'ont demandée ?** (facultatif) Un client, plusieurs, ou un usage interne. Cela pèse
   sur la priorité plus tard.
3. **Qu'en attendez-vous ?** Décider s'il faut la faire, définir comment elle doit fonctionner, ou classer plusieurs
   suggestions.

Le sujet est alors reformulé en une ligne, avec le besoin sous-jacent :

> Sujet : les clients veulent leur tableau dans Excel. Le besoin semble être de partager l'état d'avancement avec des
> personnes qui n'ont pas de compte. Exact ?

Répondez **oui** ou corrigez-le. Cette ligne est le moment le plus important de la session : une demande d'« export
Excel » et un besoin de « partager l'état avec des personnes externes » mènent à des conceptions très différentes.

**Plusieurs suggestions à la fois ?** Elles sont regroupées (doublons et quasi-doublons ensemble), présentées sous forme
de liste numérotée, et vous choisissez le groupe à traiter en premier. Chaque groupe est un sujet distinct avec son
propre enregistrement, et chacun n'est recherché que lorsque son tour arrive.

**Identifiants de rapports de retour ?** Avec le MCP wxKanban connecté, seuls ces rapports sont récupérés. Sans lui, on
vous demande de les coller.

### Étape 3 : ce qui existe déjà

Le panel recherche maintenant, uniquement sur le sujet confirmé : le code, `specs/Project-Scope/*.md`,
`specs/*/spec.md`, l'aide, les sessions précédentes, et (avec le MCP connecté) l'index des capacités et les retours
ouverts d'autres clients.

Vous obtenez un tableau de ce type :

| Élément | Statut | Preuve | Confiance |
|---|---|---|---|
| Export CSV d'une liste de tâches | **Built** (intégré) | `src/server/routes/tasks.ts:212` | **Confirmed** (confirmé) |
| Lien de tableau partageable en lecture seule | **Planned** (prévu) (`SCOPE-0NN`) | document de périmètre (scope doc) | **Likely** (probable) |
| Sortie Excel (.xlsx) | **Not found** (introuvable) | routes, services et aide consultés | **Unknown** (inconnu) |

- **Statut :** Built · Partly built · Planned (`SCOPE-NNN`) · Decided before (record) · Not found
- **Confiance :** Confirmed (il a été lu) · Likely (probable) · Assumed (supposé) · Unknown (inconnu) · Conflicting
  (contradictoire : deux sources ne concordent pas)

« Introuvable » n'est jamais considéré comme une preuve. Une recherche trop restreinte est marquée **Unknown**.

Ce que le tableau change est dit en premier :

- **Déjà construit :** le vrai sujet est peut-être que les clients ne trouvent pas la fonctionnalité, ce qui relève de
  l'aide et de l'écran, et non d'un nouveau code.
- **Déjà décidé :** la décision antérieure et sa raison sont présentées, et on vous demande ce qui a changé.
- **Prévu :** la session peut orienter ce périmètre plutôt que d'en démarrer un nouveau.

Lorsque le sujet modifierait un travail existant, vous voyez aussi **Ce que la modification toucherait** : les
spécifications, le code et les périmètres dépendants concernés, à partir des outils Change Impact du kit. Ceci ne sert
qu'à la discussion. Rien n'est enregistré.

### Étape 4 : premier avis du panel, et ordre du jour

Chaque rôle concerné donne une ligne, étiquetée **Benefit** (avantage), **Risk** (risque) ou **Question** (question).
Viennent ensuite un ordre du jour numéroté, toujours dans cet ordre :

1. **Le besoin derrière la demande** (toujours en premier : les clients demandent une solution, le panel trouve le
   problème qui s'y cache)
2. **Qui l'utiliserait, et à quelle fréquence**
3. **Réutiliser ou construire du neuf**
4. **La version minimale utile**
5. **Chaque risque ou question soulevé par le panel**, les points d'arrêt à signaler en premier
6. **Adéquation et priorité** : maintenant, plus tard ou jamais (toujours en dernier)

Vous choisissez par où commencer. Le point 1 est recommandé.

### Étape 5 : la séance de réflexion elle-même

Un point à la fois, en texte brut, à votre rythme. Chaque point se termine par **la recommandation du président** et une
seule question simple. Répondez avec vos propres mots. Il n'y a aucun menu.

Avant chaque « quel point ensuite ? », l'ordre du jour complet est affiché à nouveau avec le statut de chaque point :

| Statut | Signification |
|---|---|
| **Suggestion** (proposition) | Pas encore discuté |
| **Agreed** (accepté) | Vous avez accepté la recommandation |
| **Changed** (modifié) | Vous avez décidé autre chose que ce qui était demandé ou recommandé |
| **Added** (ajouté) | Nouveau point apparu pendant la discussion |
| **Declined** (refusé) | Refusé, avec la raison |
| **Parked** (mis de côté) → \<where\> | Relève d'ailleurs, généralement d'un sujet distinct |

Au niveau amateur, chaque point suit un schéma fixe : où nous en sommes, ce que c'est, pourquoi c'est important, l'avis
du panel, la suggestion, la bonne pratique qui la sous-tend, et votre décision.

### Étape 6 : clôture et enregistrement

Lorsque vous dites que vous avez terminé, ou que chaque point a un statut, vous obtenez un récapitulatif regroupé en
**Agreed**, **Added**, **Changed**, **Declined** et **Parked**. Vous choisissez ensuite, en termes simples :

- **record it and take the agreed items to a scope** (enregistrer et transformer les points acceptés en périmètre)
- **record it only** (enregistrer uniquement : décisions conservées, rien encore transformé en périmètre)
- **change the summary first** (modifier d'abord le récapitulatif : le corriger, le revoir, choisir à nouveau)

**C'est le premier moment où quoi que ce soit est écrit.** Sur l'une ou l'autre réponse « enregistrer » :

1. L'enregistrement est écrit dans `docs/brainstorms/YYYY-MM-DD-<topic>.md`.
2. Chaque décision Agreed, Added, Changed et Declined est ajoutée au registre des décisions
   (`decisions/ledger.yaml`) via le script de registre du kit. Les points Parked sont consignés comme questions ouvertes.
3. Les principes généraux qui sous-tendent vos choix sont ajoutés à votre fichier personnel d'apprentissages.

On vous indique où se trouve l'enregistrement et combien d'entrées de registre ont été écrites.

### Étape 7 : transmission à un périmètre (facultatif)

Uniquement si vous avez choisi « transformer en périmètre », et avec votre accord avant chacun :

1. `/buildscope --from-md docs/brainstorms/<file>.md`. Sa propre vérification de réutilisation décide de modifier un
   périmètre existant ou d'en créer un nouveau, et toutes ses étapes interactives s'appliquent.
2. `/validateScope` sur le résultat.
3. `/createSpecs` est proposé, mais n'est exécuté que si vous le demandez.

L'enregistrement est mis à jour au fur et à mesure que chaque point aboutit : **To scope?** passe à `done (SCOPE-NNN)`.
Si une commande échoue ou s'arrête à un point de contrôle, la session s'arrête et indique précisément où. Elle ne
contourne jamais ce point.

**Réponse au client.** Lorsque l'idée vient d'un client, vous pouvez demander un brouillon de réponse en termes simples :
ce qui a été décidé et, pour une idée refusée, pourquoi. Il est affiché uniquement dans le chat. Il n'est jamais envoyé,
et le statut du rapport de retour n'est jamais modifié, sauf si vous le demandez.

---

## 5. Parler avec le panel

Ces commandes fonctionnent à tout moment pendant l'étape 5 :

| Vous tapez | Ce qui se passe |
|---|---|
| **explain** (expliquer) | La version détaillée du point en cours : contexte, un exemple, les compromis, comment cela serait construit. Puis retour à la forme courte |
| **question** ... (en premier mot ; une question) | Une question annexe. Elle reçoit une réponse, puis la session reprend là où elle en était. Ce n'est pas une décision et elle n'est pas ajoutée à l'ordre du jour, sauf si vous demandez ensuite de l'ajouter |
| **Security, what worries you?** (Sécurité, qu'est-ce qui vous inquiète ?) | Appelle un rôle par son nom. Ce rôle répond avec sa propre voix, puis repasse la main au président |
| **what else could we do?** (que pourrait-on faire d'autre ?) | Affiche les alternatives (normalement retenues pour garder chaque échange court) |
| Une nouvelle idée en cours de point | Notée en une ligne ; le point en cours est d'abord terminé, puis la nouvelle idée est ajoutée à la fin comme **Added** |
| **pause** (mettre en pause) / « ça devient long » | Propose d'enregistrer la session comme ouverte (voir la section 7) |

Lorsque les rôles ne sont pas d'accord, les deux positions sont affichées et le Lead Architect donne la recommandation et
le compromis. Le panel ne cache jamais un désaccord.

### Quand le panel s'arrête et signale

Le panel signale ces cas clairement comme un **Risque**, avec une recommandation, plutôt que de les contourner
discrètement :

- l'idée est en conflit avec une règle métier existante ou avec le fonctionnement actuel de l'application
- elle pourrait faire perdre ou corrompre des données existantes, ou ne peut pas être annulée
- elle modifie qui peut voir ou faire quoi, ou touche aux données d'un autre client
- elle dépend d'un système ou d'un service que l'application ne possède pas
- elle a dépassé ce que le client a réellement demandé

---

## 6. Le bloc-notes

`docs/brainstorms/Scratchpad.md` est une vue en direct d'une page de la session : le sujet, votre niveau, qui parle,
**où nous en sommes**, l'ordre du jour avec les statuts, les points en attente en fin de liste, et ce qui a été accepté
mais pas encore enregistré.

Ouvrez-le à côté du chat pour ne jamais perdre votre place : dans VS Code, ouvrez le fichier et appuyez sur `Ctrl+K V`.

C'est un **affichage, pas un enregistrement**. Rien ne le lit comme une décision. Lorsqu'un sujet se clôture, il est
réduit à une ligne qui nomme l'enregistrement.

---

## 7. Mettre en pause et reprendre

Une longue session remplit la conversation et la ralentit. Mettez en pause après la clôture d'un sujet, ou dès que cela
paraît long.

**Pour mettre en pause au milieu d'un sujet :** dites-le. Enregistrer est une écriture, on vous demande donc d'abord
confirmation. Si vous répondez oui, l'enregistrement est écrit avec **Status: open**, les décisions prises jusqu'ici,
l'ordre du jour restant et le point suivant. Vous voyez alors :

> Enregistré. Tapez `/clear`, puis `/wxBrainstorm --resume`, et nous poursuivrons avec : \<next item\>.

**Pour reprendre :** lancez `/wxBrainstorm --resume`. Vous obtenez la liste des sessions ouvertes (sujet, date d'ouverture,
point suivant) et en choisissez une. Les décisions prises et l'ordre du jour sont à nouveau affichés, le bloc-notes est
recréé, et la session continue au niveau enregistré. La recherche n'est pas refaite, sauf si vous la demandez ou si
l'enregistrement a plus d'une semaine ; dans ce cas, une actualisation est proposée, car l'application a pu changer.

---

## 8. Ce qui est écrit, et où

| Fichier | Quand | Contenu |
|---|---|---|
| `docs/brainstorms/Scratchpad.md` | Pendant toute la session | Vue en direct uniquement ; reflète ce qui est à l'écran |
| `docs/brainstorms/YYYY-MM-DD-<topic>.md` | Après votre approbation du récapitulatif (ou votre accord de mise en pause) | L'enregistrement : demande, ce qui existe déjà, panel, décisions, points ouverts, étape suivante |
| `decisions/ledger.yaml` | Juste après l'enregistrement, uniquement sur un récapitulatif approuvé | Une entrée par décision, écrite par `_wxAI/askgate/ledger.mjs`. Ne modifiez jamais ce fichier à la main ; un hook le bloque |
| `~/.wxai/god-learnings.md` (Windows : `%USERPROFILE%\.wxai\god-learnings.md`) | Juste après le registre | Principes généraux tirés de vos choix, partagés avec wxG-O-D, pour que les recommandations futures correspondent à votre façon de décider. Ne contient jamais de noms de projets, de clients, de chemins ni de numéros de périmètres. Vous pouvez le lire, le modifier ou le vider à tout moment |

### L'enregistrement

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

Les sessions ultérieures sur le même sujet mettent à jour le même fichier. Les lignes de décision antérieures ne sont jamais
réécrites : une décision inversée est une nouvelle ligne qui indique ce qu'elle remplace.

---

## 9. Règles de fonctionnement

- **Il pose des questions avant de chercher.** Le sujet est toujours confirmé en premier.
- **Texte brut, sans menus,** pendant toute la session.
- **Rien n'est écrit tant que vous n'avez pas approuvé un récapitulatif,** à part le bloc-notes.
- **N'écrit jamais de périmètres, de spécifications, de tâches ni de code.** `/buildscope`, `/validateScope` et
  `/createSpecs` ne s'exécutent que sur votre accord, selon leurs propres règles.
- **Ne fait jamais de commit, de push, de déploiement, et n'envoie jamais rien à un client.**
- **Aucune donnée personnelle.** Les clients sont désignés par identifiant de retour ou par date, jamais par nom, e-mail
  ou téléphone. Les fichiers `.env`, clés et certificats ne sont jamais ouverts.
- **Les faits sont sourcés, les suggestions sont étiquetées.** Une affirmation sur l'application renvoie à l'endroit où
  elle a été trouvée. Tout le reste est marqué **Assumed** (supposé).

---

## 10. Conseils pour une bonne session

- **Collez les mots du client, pas votre résumé.** Le Domain Analyst découvre le besoin derrière la demande ; votre
  résumé a peut-être déjà choisi une solution.
- **Consacrez du temps au point 1.** Bien cerner le besoin rend le reste de l'ordre du jour court.
- **Dites « Declined » à voix haute.** Un « non, parce que... » enregistré a autant de valeur qu'un « oui ». C'est ce qui
  évite que la même demande soit rediscutée.
- **Gardez un seul sujet par session.** Mettez de côté tout ce qui dérive. Un point mis de côté deviendra plus tard sa
  propre session.
- **Utilisez « question » librement.** Les questions annexes ne modifient jamais l'ordre du jour et ne comptent pas comme
  décisions.
- **Mettez en pause et tapez `/clear` entre les sujets.** Une session neuve par sujet est plus rapide et garde le panel
  concentré.
- **Relisez les anciens enregistrements avant une session de planification de version.** `docs/brainstorms/` est
  l'historique de ce qui a été décidé et pourquoi.

---

## 11. Dépannage

| Symptôme | Cause et solution |
|---|---|
| « The impact check is not available in this kit » (L'analyse d'impact n'est pas disponible dans ce kit) | `_wxAI/impact/` n'est pas installé dans ce projet. La session continue sans lui ; mettez le kit à jour pour l'obtenir |
| « The ledger is not installed » (Le registre n'est pas installé) | `_wxAI/askgate/ledger.mjs` est absent. L'enregistrement est tout de même écrit ; mettez le kit à jour pour obtenir les entrées de registre |
| Le script de registre refuse une entrée | Il rejette les doublons et les approbateurs vides. Le refus est signalé en termes simples et n'est pas contourné ; vérifiez si la décision figure déjà au registre |
| Les identifiants de retour ne peuvent pas être récupérés | Le MCP wxKanban n'est pas connecté. Collez plutôt le texte des rapports |
| `/buildscope` s'arrête à un point de contrôle pendant la transmission | La session s'arrête et indique où. Résolvez le point de contrôle, puis relancez la transmission pour les points restants |
| `--resume` n'affiche rien | Aucun enregistrement n'a **Status: open**. Les sujets clôturés se rouvrent en démarrant une nouvelle session sur le même thème ; l'enregistrement antérieur est retrouvé à l'étape 3 |

---

## Liens connexes

- `/wxG-O-D` : planification de l'ensemble du projet ; lance wxBrainstorm pour ses revues, idées et sessions de conception
- `/buildscope`, `/validateScope`, `/createSpecs` : la chaîne de transmission
- Référence des commandes : la page d'aide intégrée pour `/wxBrainstorm`
- Anciens enregistrements : `docs/brainstorms/`
