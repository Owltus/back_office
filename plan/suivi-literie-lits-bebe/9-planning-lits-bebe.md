# Étape 9 — Planning lits parapluie bébé

## Objectif (repris, D8 — 2026-08-17)

Construire le planning des lits bébé (lignes = lits, colonnes = jours),
assignation d'un lit à une chambre sur une durée, avec le **même bloc temps
réel** que `/parking` (souscription + fusion par id + rattrapage) **et le même
système d'interaction complet** : glisser-déposer pour créer/déplacer,
poignées de redimensionnement aux bords, undo/redo (Ctrl+Z/Ctrl+Y). La V1
initiale (dialog seul, sans drag/resize/undo) a été jugée insuffisante par
l'utilisateur une fois livrée — cette étape la remplace en répliquant
fidèlement `ParkingBoard.tsx`, adapté aux lits bébé.

## Contexte

Reprend de Parking le modèle de chevauchement, la fenêtre de chargement, la
souscription `postgres_changes` + fusion par id + rattrapage
`visibilitychange`/`focus`/`online` (**inchangés, non retouchés**), ET
désormais aussi le système d'interaction pointeur (drag/resize) et le hook
undo/redo — seules les adaptations décrites plus bas diffèrent de Parking.

## Fichiers

- `src/lib/baby-cots/types.ts` — inchangé.
- `src/lib/baby-cots/model.ts` — `hasOverlap` inchangée ; **ajout**
  `hasOverlapWithAny(assignments, cotId, period, excludeId?)`, équivalent de
  `hasOverlap(reservations, spot, startDay, nights, ignoreId?)` de
  `lib/parking/model.ts` mais sur une liste + filtre par lit (`cotId`).
- `src/lib/baby-cots/service.ts` / `editability.ts` — inchangés, réutilisés
  tels quels par les nouvelles primitives.
- **`src/lib/baby-cots/history.ts`** (nouveau) — `CotCommand`
  (`create`/`delete`/`update`), `CotAssignmentPatch = Partial<Omit<CotAssignment,'id'>>`,
  `invert()`. Réplique exacte de `lib/parking/history.ts`.
- **`src/lib/baby-cots/history.test.ts`** (nouveau) — tests `invert` (create↔delete,
  update échange before/after, involution), sur le modèle de
  `lib/parking/history.test.ts`.
- **`src/components/literie/useCotHistory.ts`** (nouveau) — piles undo/redo
  (`record`/`undo`/`redo`/`canUndo`/`canRedo`), primitives injectées
  `applyCreate`/`applyDelete`/`applyUpdate`. Réplique exacte de
  `components/parking/useParkingHistory.ts`.
- **`src/components/literie/BabyCotBoard.tsx`** (réécrit) — voir détail plus bas.
- `src/lib/baby-cots/model.test.ts` — **ajout** d'un bloc de tests pour
  `hasOverlapWithAny` (même lit → chevauchement, lit différent → indépendant,
  `excludeId` ignore sa propre assignation sans masquer une AUTRE assignation).

## Ce qui a été répliqué de ParkingBoard.tsx (à l'identique dans le principe)

- **Primitives `applyCreate`/`applyDelete`/`applyUpdate`** : garde métier AVANT
  application (`canCreateAssignment`/`canEditAssignment` + `hasOverlapWithAny`),
  patch optimiste sur l'état local, écriture Supabase fire-and-forget
  (`.catch(...)`, rollback sur `applyCreate` si l'insert échoue), renvoient un
  booléen (`false` = refusé/périmé). Utilisées PAR le dialog (création,
  modification, suppression) ET par l'undo/redo — un seul chemin d'écriture,
  donc tout est annulable, y compris une édition faite via le dialog.
- **`record()` après chaque action utilisateur**, jamais depuis le canal
  realtime — la pile undo/redo ne contient que « mes actions ».
- **`interactingRef`** neutralise Ctrl+Z/Ctrl+Y pendant un geste en cours
  (drag, redimensionnement, sélection de création).
- **Poignées de redimensionnement** aux bords gauche/droit de chaque bloc,
  `stopPropagation` sur leur `onPointerDown` pour ne pas déclencher le
  déplacement du bloc entier.
- **Gardes en temps réel pendant le geste** (pas seulement au relâchement) :
  chaque frame de `applyPosition` revérifie `canEditAssignment` (sur la
  nouvelle date de fin) et `hasOverlapWithAny` ; si l'une échoue, la frame est
  ignorée et le bloc reste à sa dernière position valide — même principe que
  `ParkingBoard.applyPosition`.
- **Persistance au relâchement seulement** : pendant le geste, seul l'état
  local optimiste bouge (`setAssignments`) ; au `pointerup`, un seul appel
  Supabase (`updateAssignment` direct, pas via `applyUpdate`) et un seul
  `record({kind:'update', ...})` avec le patch géométrique SEUL
  (`cotId`/`startDate`/`endDate`) — jamais l'objet entier. C'est exactement le
  choix de `ParkingBoard.tsx` (son `onUp` appelle `updateReservation` en
  direct, pas `applyUpdate`) : la validation vit dans `applyPosition` pendant
  le geste, `applyUpdate` reste le chemin utilisé par le dialog ET par
  l'undo/redo (qui rejoue les commandes historisées).

## Adaptations documentées (obligatoires, cf. brief)

1. **~~Défilement natif~~ — SUPERSÉDÉ 2026-08-17, voir section « Largeur
   adaptative » en fin de fichier.** À l'origine (ce paragraphe, historique) :
   `BabyCotBoard` rendait TOUTE la fenêtre de jours (60 passés/120 futurs) dans
   un `scrollRef` (`overflow-x-auto`) de largeur fixe (`DAY_W = 32`). Jugé non
   adaptatif par l'utilisateur (comparé à `/rapro`) → remplacé par une fenêtre
   affichée FIXE en nombre de jours (`VISIBLE_DAYS`) dont les colonnes
   s'étirent en CSS pur, navigable par `offset` (StepNav/flèches), sans
   `scrollLeft` ni mesure de pixels. Le principe ci-dessous (conversion
   pointeur → jour via `gridRef.getBoundingClientRect()` relu à chaque appel)
   reste vrai, seule la source de la largeur de colonne change (division du
   rectangle mesuré par `VISIBLE_DAYS`, pas une constante `DAY_W`).
2. **Dates calendaires absolues, pas `startDay` + demi-journées.** Un
   déplacement/redimensionnement calcule un delta en JOURS (`dDay`, via
   `dayIdxFromClientX`) puis `shiftDate(date, dDay)` (date-fns `addDays` +
   `format`) — pas de notion d'arrivée après-midi / départ matin. Une case =
   un jour entier.
3. **Lignes = index dans `cots` (tableau, longueur variable), pas `1..SPOTS`.**
   `dRow` est clampé entre `0` et `cots.length - 1` ; la ligne résout
   `cotId = cots[rowIdx].id`.
4. **Pas de statut, pas de menu contextuel.** `CotAssignment` n'a pas de champ
   `status` : aucun cycle de statut, aucune justification obligatoire à
   répliquer. Faute d'équivalent au menu contextuel de Parking (qui sépare
   drag du corps de barre / renommage double-clic / commentaire-statut via
   clic droit), l'édition passe par un **petit bouton crayon explicite posé
   sur le bloc** (`stopPropagation` sur son `onPointerDown` pour ne jamais
   déclencher un déplacement). Le corps du bloc reste la zone de glisser
   (move). Choix documenté dans le brief comme préférable à un seuil de
   distance clic/drag à deviner — retenu tel quel : plus fiable, pas de
   réglage empirique de seuil en pixels.
5. **Création par glisser sur case vide, dialog en aval.** La chambre est un
   champ obligatoire sans bon défaut (contrairement au nom client de Parking,
   vide par défaut) : impossible de créer une assignation « vide » d'un
   simple clic. Choix retenu (option a du brief, étendue) : un clic (ou un
   glisser sur plusieurs jours) sur une case vide sélectionne une PÉRIODE — un
   fantôme de sélection suit le geste, rouge si la période chevauche déjà une
   assignation du même lit — puis, au relâchement, OUVRE le dialog de création
   pré-rempli (lit + dates glissées). Le dialog reste l'unique point de saisie
   de la chambre/du nom ; seule la sélection de période se fait par glisser.
   La validation définitive (chevauchement, fenêtre de grâce) reste dans
   `handleSubmit` — le fantôme rouge n'est qu'une aide visuelle, il ne bloque
   pas l'ouverture du dialog (l'utilisateur peut corriger les dates dedans).

## Contraintes respectées

- Le dialog (création/édition/suppression) passe désormais par
  `applyCreate`/`applyUpdate`/`applyDelete` + `record(...)` — toute action
  faite via le dialog est annulable par Ctrl+Z, comme le drag.
- Style visuel inchangé (bandes mois/jours, colonne fixe des lits, teintes
  `primary/15` etc.) ; seuls les poignées de redimensionnement, le curseur
  `cursor-grab`/`cursor-grabbing`/`cursor-crosshair` pendant les gestes et le
  bouton crayon ont été ajoutés. `styles/literie.css` n'a pas eu besoin d'ajout
  (tout est en classes Tailwind utilitaires, comme le reste du fichier).
- Aucun SQL exécuté, aucune migration de schéma (le modèle
  `baby_cot_assignments` ne change pas).

## Critère de validation

- `npx tsc --noEmit` : OK, aucune erreur.
- `npx vitest run src/lib/baby-cots` : OK, 17 tests (dont les nouveaux
  `hasOverlapWithAny` et `history.test.ts`).
- `npx vitest run` (suite complète) : OK, 404 tests, aucune régression.
- `npx eslint src/components/literie src/lib/baby-cots` : 1 erreur
  résiduelle dans `BabyCotBoard.tsx` (`REALTIME_SUBSCRIBE_STATES.CLOSED`
  toujours vrai) — reproduction FIDÈLE du bloc temps réel de
  `ParkingBoard.tsx`, qui porte la MÊME erreur (ligne 462) : pattern déjà
  accepté dans le projet, pas une régression introduite ici. `service.ts`
  porte 3 erreurs préexistantes, non touché par ce chantier (`git diff` vide
  sur ce fichier).
- `npx vite build` : OK, chunk `literie` généré sans erreur.
- **Reste à faire par l'utilisateur (test manuel, hors de portée de
  l'assistant)** : geste de glisser-déposer en conditions réelles navigateur
  (créer par glisser, déplacer, redimensionner aux deux bords, undo/redo
  Ctrl+Z/Ctrl+Y, auto-défilement en bord d'écran) — l'assistant n'a pas de
  moyen de piloter un navigateur dans ce flux pour valider le geste
  visuellement ; tsc/vitest/eslint/build ne couvrent que la correction
  statique et la logique pure.

## Contrôle /borg

Étape critique (>5 fichiers touchés). Points vérifiés :
- Le bloc temps réel (souscription + merge par id + hard resync) est resté
  BYTE-FOR-BYTE la copie du bloc déjà validé — seule la couche d'interaction a
  changé.
- `hasOverlapWithAny` est appelée avant CHAQUE écriture géométrique :
  `applyCreate`, `applyUpdate` (patch géométrique), et à chaque frame de
  `applyPosition` pendant un drag/resize — pas seulement à la validation
  finale du dialog.
- La fenêtre de grâce (`LITERIE_GRACE_DAYS`, `canCreateAssignment`/
  `canEditAssignment` de `editability.ts`, non modifié) est invoquée aux mêmes
  points que Parking : création (borne sur l'arrivée), modification/suppression
  (borne sur la fin, ligne existante ET ligne proposée).
- Le dialog et le drag partagent le même chemin d'écriture
  (`applyCreate`/`applyUpdate`/`applyDelete`) pour la PERSISTANCE et
  l'historisation — le drag applique un état optimiste par frame en dehors de
  ce chemin (comme Parking) pour rester réactif à 60 fps, mais son écriture
  finale et son entrée d'historique suivent le même contrat de patch partiel
  que le dialog.

## Sous-chantier — largeur adaptative (2026-08-17)

**Demande utilisateur** : le planning ne doit plus avoir de largeur de colonne
fixe avec défilement horizontal (`DAY_W = 32`, `overflow-x-auto`) — il doit
s'adapter à la largeur disponible, comme `/rapro`.

**Un premier brief a mal identifié le modèle de référence** : il demandait de
répliquer le mécanisme `containerW`/`ResizeObserver`/`dayW` (px) + `offset`/
`panSteps` (pan pixel-perfect) de `ParkingBoard.tsx`. L'utilisateur a corrigé
en cours de tâche (avant toute écriture de code, seule la lecture des fichiers
de référence avait eu lieu) : la référence voulue était `/rapro` — CSS fluide
pur (`.rapro-floors` : `grid-template-columns: repeat(N, 1fr)` par breakpoint),
**aucune mesure JS de largeur**. Le drag/resize/undo/redo/temps réel de Parking
devait rester intact ; seule la base géométrique de la largeur de colonne
changeait de modèle.

**Ce qui a été livré** (conforme au brief corrigé) :

- `VISIBLE_DAYS = 14` (constante, pas mesurée) : fenêtre AFFICHÉE fixe en
  nombre de jours. Choisie plutôt que 21 pour garder des blocs assez larges
  (texte chambre + nom, tronqué) sur un écran de largeur courante ; `STEP = 7`
  (moitié de la fenêtre) donne un recouvrement de 50 % à chaque pas, lisible.
- **Aucun `ResizeObserver`, aucun état `containerW`, aucun `dayW` en pixels
  stocké.** Les bandes mois/jours utilisent `display: grid` +
  `gridTemplateColumns: repeat(VISIBLE_DAYS, 1fr)` (bande mois : chaque bloc
  `gridColumn: span N`) — c'est le navigateur qui répartit la largeur. Les
  blocs d'assignation (position absolue, ne peuvent pas être des enfants de
  grille classiques) sont positionnés en **pourcentage** de la fenêtre
  (`dayPct = (idx - offset) / VISIBLE_DAYS * 100`), avec un appoint fixe de
  2/4 px via `calc()` pour la marge visuelle entre blocs — jamais un pixel
  calculé à partir d'une largeur mesurée.
- `offset` (état, index de jour depuis `range.from`) ne sert QU'à choisir quelle
  tranche de `VISIBLE_DAYS` jours de la fenêtre CHARGÉE (`range`, toujours
  fixe : 60 passés/120 futurs, inchangé) est affichée. Navigation : `StepNav`
  (±7 jours), flèches clavier (gardées hors `INPUT`/`TEXTAREA`), bouton
  « Aujourd'hui » (recentre sur aujourd'hui à la 3ᵉ position visible, borné aux
  données chargées).
- **Auto-décalage en bord de geste** (drag/resize/sélection de création) :
  remplace le `panSteps`/`scrollLeft` de Parking par `makeEdgePan` — un simple
  `setInterval` (180 ms) qui avance/recule `offset` d'UN JOUR tant que le
  pointeur reste dans une zone de 48 px en bord de grille ; pas de panoramique
  pixel (il n'y a pas de scroll à compenser). La conversion pointeur → jour
  (`dayIdxFromClientX`) relit `gridRef.getBoundingClientRect()` à chaque appel
  et divise par `VISIBLE_DAYS` pour obtenir la largeur de colonne COURANTE —
  lecture ponctuelle à l'usage, pas un état React mis à jour en continu.
- Le dialog de création (glisser sur case vide) et les blocs d'assignation
  travaillent toujours en INDEX ABSOLU (0-based depuis `range.from`, via
  `dayIndex`/`dateFromIndex`) — inchangé dans son principe depuis la V1
  post-Parking, seule la conversion pixel → index et le rendu ont changé.
- **Intact, non touché** : glisser-déposer, redimensionnement, undo/redo
  (Ctrl+Z/Ctrl+Y), sélection de création par glisser, bouton crayon,
  anti-chevauchement en temps réel pendant le geste, bloc temps réel
  (souscription/fusion/rattrapage). Seule la géométrie pixel↔position a changé
  de base (de `scrollLeft`-relatif, en passant par un brief `offset`/`dayW`-px
  non retenu, à `offset`-relatif en pourcentage CSS).
- Pas de panoramique par clic-glissé sur le fond (hors périmètre, non demandé).
- Pas de mode compact (densité mobile) — hors périmètre pour 4 lits.

**Vérifications** :
- `npx tsc --noEmit` : OK, aucune erreur.
- `npx vitest run src/lib/baby-cots` : OK, 17 tests (inchangés, logique pure
  non touchée par ce sous-chantier).
- `npx vitest run` (suite complète) : OK, 404 tests, aucune régression.
- `npx eslint src/components/literie` : 1 erreur résiduelle, la même
  `REALTIME_SUBSCRIBE_STATES.CLOSED` déjà connue et acceptée (bloc temps réel
  non modifié) — aucune erreur nouvelle.
- **Reste à faire par l'utilisateur (test manuel navigateur)** : redimensionner
  la fenêtre pour vérifier que les colonnes s'étirent sans barre de défilement
  horizontale à aucune largeur ; tester le drag/resize/sélection près des
  bords gauche et droit (auto-décalage `offset`) ; vérifier StepNav/flèches/
  bouton « Aujourd'hui ». L'assistant n'a pas de moyen de piloter un
  navigateur dans ce flux pour valider ces gestes visuellement.

## Sous-chantier — geste RÉPLIQUÉ à l'identique de Parking, chambre retirée (2026-08-17)

**Insight utilisateur qui débloque tout** : le dialog de création/édition
(sélecteur de lit + sélecteur de **chambre obligatoire** + nom + dates +
commentaire) avait dérivé trop loin du modèle Parking au fil des itérations
précédentes (V1 dialog seul, puis largeur adaptative). « Fait vraiment pareil
[que Parking] » — et la clé : **pas besoin d'associer une chambre au lit**, un
simple texte libre suffit, exactement comme `client` sur
`parking_reservations` (texte libre, vide par défaut, pas de FK). Sans champ
obligatoire sans bon défaut, plus besoin de dialog du tout : le geste
Parking (clic droit → création immédiate → renommage en ligne) devient
directement réplicable.

**Migration SQL** (`supabase/baby_cot_assignments_label.sql`, à jouer par
l'utilisateur, non exécutée par l'assistant) : `baby_cot_assignments` perd
les colonnes `room` (FK `hotel_rooms`) et `guest_name`, remplacées par une
seule colonne `label text not null default ''` (migration best-effort des
valeurs existantes dans `label` avant le `drop column`).

**Ce qui a été livré** (remplace intégralement le dialog et son adaptation
n°4/n°5 ci-dessus, qui ne s'appliquent plus) :

- `CotAssignment`/`DbCotAssignment` (`lib/baby-cots/types.ts`) : `room`
  (number) + `guestName` (string) → un seul champ `label: string`.
- `lib/baby-cots/service.ts` : `toCotAssignment`, `NewCotAssignment`,
  `createAssignment`/`updateAssignment` adaptés à `label`/`label` (plus de
  référence à `hotel_rooms`/`ALL_ROOMS`).
- `lib/baby-cots/model.ts`/`editability.ts` : **inchangés** — ne dépendaient
  déjà que des dates et du `cotId`, pas de `room`/`guestName`.
- `lib/baby-cots/history.ts`/`components/literie/useCotHistory.ts` :
  **inchangés** — `CotAssignmentPatch = Partial<Omit<CotAssignment,'id'>>`
  s'adapte automatiquement au nouveau `CotAssignment`.
- `components/literie/BabyCotBoard.tsx` — **réécrit en entier**, réplique
  fidèle du geste `ParkingBoard.tsx` :
  - **Création = clic DROIT sur une case vide** (plus de glisser-sélection ni
    de dialog). `captureCell`/`pointerToCell` (calque de `pointerToCell` de
    Parking, mais résout `{cotId, dayIdx}` au lieu de `{day, spot}`) mémorise
    la case visée dans `pendingCell` avant l'ouverture du menu contextuel
    (`gridBackground` enveloppé dans `ContextMenu`, un seul item « Nouvelle
    assignation »). `addAssignment` crée l'objet (`label: ''`, 1 jour),
    l'applique via `applyCreate`, l'historise, puis `setEditingId` enchaîne
    sur le renommage en ligne — copie conforme d'`addReservation`.
  - **Renommage EN LIGNE, pas de dialog** : `AssignmentBar` (nouveau
    sous-composant, remplace le bloc + bouton crayon) affiche un `<input>`
    quand `editing` (double-clic sur le bloc OU « Renommer » du menu
    contextuel), `onBlur`/Enter commettent, Escape annule ; sinon un
    `<span>{a.label || 'Sans nom'}</span>` (opacité réduite si vide). Le
    différé focus via `pendingEditRef` + `onCloseAutoFocus` (course avec la
    restitution de focus de Radix à la fermeture du menu) est répliqué à
    l'identique de `ReservationBar`.
  - **Menu contextuel sur un bloc existant** : Renommer / Commentaire /
    séparateur / Supprimer (`variant="destructive"`). **Pas de groupe de
    statut** (`CotAssignment` n'a toujours pas de champ `status`).
  - **Commentaire** : dialog minimal conservé (titre + `Textarea` + Annuler/
    Enregistrer) — pas de justification obligatoire comme le « Non payé » de
    Parking (aucun statut à justifier ici). Indicateur `MessageSquare` sur le
    bloc + tooltip au survol, comme Parking.
  - **Poignées de redimensionnement** : inchangées dans leur principe
    (héritées du sous-chantier précédent), simplement réintégrées dans
    `AssignmentBar`.
  - **Écart assumé : pas de « Copier »** (Ctrl/Cmd+clic + fantôme au curseur).
    Jugé disproportionné pour quelques lits bébé — le brief l'autorisait
    explicitement en écart documenté (« plus simple, pas plus de
    fonctionnalités »). Aucun autre écart de geste par rapport à Parking.
  - `cots` (requête `fetchCots`) est désormais dérivé en `cots = cotsData ??
    []` (au lieu de `cots?.length`/`cots!` disséminés) : simplifie
    `gridBackground`, `captureCell` et `startInteraction`, aucune assertion
    non-null nouvelle.
  - Bouton d'en-tête « Nouvelle assignation » **retiré** (Parking n'en a pas
    non plus — la création est exclusivement au clic droit).
- Tests (`lib/baby-cots/*.test.ts`) : fixtures `room`/`guestName` → `label`.

**Fichiers supprimés de `BabyCotBoard.tsx`** : `Dialog` de création/édition
(formulaire complet), `AssignmentForm`, `openCreate`/`openEdit`/
`handleSubmit`/`handleDelete`, `createSelection`/`startCreateSelect`/
`selectionInvalid` (sélection de période par glisser), toute référence à
`ALL_ROOMS`/`Select`/`Input`/`Label`/`hotel/rooms.ts`.

**Vérifications** :
- `npx tsc --noEmit` : OK, aucune erreur.
- `npx vitest run src/lib/baby-cots` : OK, 17 tests (fixtures adaptées à
  `label`).
- `npx vitest run` (suite complète) : OK, 404 tests, aucune régression.
- `npx eslint src/components/literie src/lib/baby-cots` : 4 erreurs
  résiduelles, TOUTES préexistantes et vérifiées comme telles (comparaison
  avant/après ce chantier via `git stash`) — 1 dans `BabyCotBoard.tsx`
  (`REALTIME_SUBSCRIBE_STATES.CLOSED`, bloc temps réel non modifié, déjà
  acceptée) et 3 dans `service.ts` (assertions non-null autour de la
  pagination `fetchAssignments`/`fetchCots`, non touchées par ce chantier).
  Aucune erreur nouvelle.
- **Reste à faire par l'utilisateur** : jouer
  `supabase/baby_cot_assignments_label.sql` (destructif : `drop column room`,
  `drop column guest_name`, après migration best-effort vers `label`) —
  **sans cette migration, le board casse** (`insert`/`update` viseraient une
  colonne `label` qui n'existe pas encore en base). Puis test manuel
  navigateur du geste complet, hors de portée de l'assistant : clic droit sur
  case vide → création + renommage en ligne, double-clic sur un bloc →
  renommage, glisser un bloc → déplacement, poignées → redimensionnement,
  clic droit sur un bloc → Renommer/Commentaire/Supprimer, Ctrl+Z/Ctrl+Y.

## Sous-chantier — nuitées, pas jours pleins inclusifs (2026-08-17)

L'utilisateur a demandé le même principe que Parking : ce sont les NUITÉES
qui sont suivies, pas des jours calendaires pleins. `endDate` devient le jour
de DÉPART, EXCLU (le lit se libère ce matin-là, réutilisable dès le même
jour par un autre enfant) — plus le jour cliqué lui-même compté en plus.

**Changements** :
- `lib/baby-cots/model.ts` — `hasOverlap` passe en bornes strictes
  (`a.startDate < b.endDate && b.startDate < a.endDate`) : deux séjours qui
  se touchent au jour de bascule (l'un part le 10, l'autre arrive le 10) ne
  se chevauchent PLUS (avant : chevauchement). Tests mis à jour en
  conséquence (`model.test.ts`).
- `BabyCotBoard.tsx` :
  - `addAssignment` (clic droit → création) crée désormais 1 NUIT
    (`endDate: shiftDate(date, 1)`), pas 1 jour (`endDate: date`).
  - Largeur du bloc : `(endIdx - startIdx) / VISIBLE_DAYS` (retrait du `+ 1`)
    — le bloc s'arrête à la borne du jour de départ, ne le couvre plus.
  - Redimensionnement : garde-fous adaptés pour imposer au moins 1 nuit
    (`endDate <= startDate` interdit en resize-right, `startDate >= endDate`
    interdit en resize-left) au lieu de permettre 0 nuit.
- `supabase/literie.sql` — contrainte `end_date > start_date` (au lieu de
  `>=`) sur `baby_cot_assignments`, avec migration défensive (les lignes
  existantes à 0 nuit, ancien sens « 1 jour occupé », sont décalées d'1 jour
  avant que la nouvelle contrainte ne soit posée) — **à rejouer par
  l'utilisateur** (script ré-exécutable, section 3).

`tsc`, `eslint`, 404 tests (suite complète) : propres, aucune régression.
