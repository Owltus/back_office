# Conventions des écrans du Planning (à lire avant de coder un écran)

Portage du front du prototype (`C:\Users\Pierre-Louis\Desktop\planning\frontend\src`, en
lecture seule) dans le back office. **La spécification fonctionnelle complète** de chaque
écran est `plan/planning-portage-2026-10-27/A-spec-front-prototype.md` : la suivre, fonction
par fonction, en lisant aussi le code du prototype cité. Le **style** n'est pas celui du
prototype : c'est celui du back office (Tailwind v4 + shadcn, thème sombre navy, jetons
`bg-card`, `border-border`, `text-muted-foreground`, `bg-muted/50`…).

## Ce qui existe déjà (ne pas réécrire)

- `src/lib/planning/` (pur, testé) :
  - `types.ts` : lignes des tables (`Horaire`, `Motif`, `Poste`, `Groupe`, `Salarie`,
    `Absence` = UN JOUR, `Besoin`, `Affectation`, `Referentiel`, `CATEGORIES`,
    `TYPES_CONTRAT`, `JOURS`). Champs : ceux du prototype, sauf `horaire_id` (prototype
    `type_shift_id`) et `motif_id` (prototype `type_absence_id`) ; la semaine type garde
    `type_shift_id` / `type_absence_id`.
  - `semaine.ts` : `analyser(donnees) → SemaineOut` (MÊMES champs que l'API du prototype :
    `affectations` avec `type_shift_id`, `duree`, `role`, `alertes`, `besoin_id` ;
    `a_pourvoir`, `bilan`, `stats`, `verrouillee`), `jourFixe`, `aJoursFixes`,
    `joursAbsents`, `estEcole`…
  - `affichage.ts` : `heures`, `dureeHoraire`, `numeroSemaine`, `dateCourte`, `initiales`,
    `nomComplet`, `texteSur`, `horairesDuPoste`, `postesDuGroupe`, `postesTenus`, `metier`,
    `parGroupe`, `jourDeRepos`, `disponibleLe`, `sousContrat`, `genreMotif`, `journeeEtoile`,
    `enPeriodes` (jours → périodes), `datesEntre`, `NIVEAUX`.
  - `temps.ts` : dates ISO (`ajouterJours`, `lundiDe`, `jourDeLaSemaine`, `ecartJours`),
    `horaireDe(horaire, court)`, `presence`, `heureAffichee` (« 24:00 » → « 00:00 »),
    `heuresLisibles`.
  - `regles.ts` : `resume(fiche)` (aperçu des règles d'une fiche), `JOUR_MAX_CATEGORIE`,
    `alerteBesoin`.
  - `service.ts` : TOUTES les lectures et écritures Supabase (voir la liste en tête). Les
    écritures multi-lignes passent par des RPC. Ne jamais appeler `supabase` ailleurs.
  - `erreurs.ts` : `messageErreur(err, action)`.
- `src/components/planning/hooks/usePlanning.ts` :
  - `useDroitsPlanning()` → `{ pret, lire, ecrire, gerer }`.
  - `useReferentiel()`, `useSemaine(lundi)` (→ `semaine: SemaineOut`, `referentiel`,
    `donnees`), `useAujourdhui()`, `useOccupation()`.
  - `useEcriture()` → `ecrire(action, 'Libellé de l'échec')` rend `{ ok, message }`
    après avoir tout relu (invalidation `planningKeys.all`).
  - `useGenerer()` → `generer(lundi, { tout?, exclus?, seulement?, sansEffacer?,
titulairesSeulement? })` rend `{ poses, dureeMs, semaine }` (semaine analysée APRÈS).
  - `usePoserFixes(...)` : horaires fixes posés à l'ouverture d'une semaine à venir.
- `src/components/planning/Messages.tsx` : `useNotifier()(texte, 'info' | 'attention' |
'danger')` — le fil de messages qui remplace les toasts du prototype. Il n'y a PAS
  d'autre toast dans le back office.
- `src/components/planning/EnTeteParametres.tsx` : `MenuParametres`, `RetourPlanning`.
- `src/components/planning/parametres/FicheSalarie.tsx` : CONTRAT de la fiche en tiroir
  (`salarieId`, `ouvert`, `onFermer`, `groupeId?`), implémentée par l'écran Équipe,
  ouverte aussi depuis la colonne staff de la semaine.

## Droits (miroir des RLS ; la base reste l'autorité)

- **aucun** : la page n'est pas accessible (`PageGuard` s'en charge).
- **lecture** : tout voir. Aucun bouton d'écriture actif : masquer les gestes (glisser,
  clic droit, +) ou les griser avec la raison en infobulle (« Lecture seule »).
- **écriture** (`ecrire`) : faire le planning : poser, déplacer, modifier, supprimer un shift ;
  poser ou retirer un jour d'absence au planning ; valider ; compléter, full auto ; vider ;
  effacer les propositions.
- **gestion** (`gerer`) : en plus, verrouiller / déverrouiller une semaine, et tout le
  paramétrage (fiches du staff, postes, horaires, motifs, besoins, catégories). Les écrans de
  paramètres sont LISIBLES en lecture et en écriture (champs désactivés), modifiables en
  gestion.
- Tant que `pret` est faux : tout grisé (jamais « ouvert par défaut »).

## Règles de la base (à refléter à l'écran)

- Semaine verrouillée : plus rien ne bouge (cases hachurées, gestes coupés), même pour la
  gestion ; seul le cadenas (gestion) la rouvre.
- Passé : on ne génère pas, on ne vide pas une semaine terminée ; dans la semaine en cours,
  seuls les jours à partir d'aujourd'hui.
- Un shift par personne et par jour ; un jour d'absence retire le shift du jour.
- Toute erreur de la base arrive en message lisible par `useEcriture` : l'afficher par
  `useNotifier` (danger).

## Style du back office (à respecter)

- Page pleine largeur, comme le Parking : `PageContainer fillHeight` est déjà posé par la
  route ; le contenu est un `div` `flex min-h-0 min-w-0 flex-1 flex-col gap-4`. La grille
  défile en interne (en-tête et colonne staff collants).
- En-tête : `PageHeader` (`#/components/shared/PageHeader.tsx`) avec `title` à gauche et
  `actions` à droite ; actions regroupées en `ButtonGroup` (`#/components/shared/ButtonGroup.tsx`)
  de boutons `Button variant="outline" size="icon-sm"` enveloppés dans `Tip`
  (`#/components/shared/Tip.tsx`) ; navigation dans le temps par `StepNav`
  (`#/components/shared/StepNav.tsx`). Un bouton principal : `variant="default" size="sm"`.
  Regarder `src/components/parking/ParkingBoard.tsx` (en-tête) et
  `src/components/classeur/ClasseurList.tsx` comme modèles.
- Primitives shadcn dans `src/components/ui/` (button, dialog, sheet, dropdown-menu,
  context-menu, popover, select, input, label, switch, tabs, table, tooltip, calendar,
  skeleton, alert) : les utiliser, ne JAMAIS les modifier. Icônes `lucide-react`.
- Jamais d'attribut `title` (infobulle native) : `Tip` ; boutons d'icône : `aria-label`.
- Confirmation (`#/components/shared/ConfirmDialog.tsx`) avant tout geste destructif ou de
  masse : vider la semaine, supprimer une fiche, un poste, un code horaire, un motif, une
  catégorie (le prototype n'en avait pas pour « Vider la semaine » : c'est une anomalie à
  corriger).
- CSS propre à la page : `src/styles/planning.css`, classes préfixées `.planning-`, importé
  depuis `src/styles.css` (déjà fait). Préférer les classes Tailwind ; le fichier CSS ne sert
  qu'à ce que Tailwind exprime mal (hachures, dégradés de cartes).
- Glisser-déposer : `@dnd-kit/core` (déjà installé) ; capteurs souris 5 px + doigt appui
  long, comme `src/components/classeur/dnd/useCapteursClasseur.ts`.
- Code : TypeScript strict, exports nommés seulement, imports `#/…` avec extension `.ts` /
  `.tsx`, simples quotes, pas de point-virgule, commentaires en français, noms métier en
  français sans accents dans les identifiants.

## Textes à l'écran

- Français, phrases courtes, vouvoiement (le prototype tutoie parfois : corriger).
- Ni tiret cadratin (—), ni guillemets « », ni « PDJ ». Pas de jargon (pas de « RLS »,
  « JSON », « RPC », « uuid »).
- Reprendre les libellés du prototype (cités dans la spec) quand ils respectent ces règles.

## Vérification attendue de chaque agent

- `npx tsc --noEmit -p .` et `npx vitest run src/lib/planning src/components/planning` verts.
- Un test de rendu (vitest + jsdom + @testing-library/react, voir les `*.test.tsx`
  existants, par ex. `src/components/classeur/dialogs/*.test.tsx`) par écran au moins :
  affichage en lecture seule sans aucun bouton d'écriture actif, et un geste d'écriture qui
  appelle le bon service (service mocké avec `vi.mock`).
- Ne PAS commiter, ne PAS lancer de base, ne PAS toucher aux fichiers d'un autre écran.
  Ne pas modifier `src/lib/planning/*` sans le signaler dans le rapport (un manque dans une
  aide pure : l'ajouter dans un fichier de l'écran, ou le signaler).
