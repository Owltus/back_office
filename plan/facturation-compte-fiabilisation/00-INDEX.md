# Plan — Facturation : fiabiliser la notion de compte

## Contexte

La page `/facturation` impute une facture PDF sur un ou plusieurs **codes** d'imputation,
puis appose un tampon. Le **compte comptable** a été ajouté tardivement au projet, greffé
sur le code : le référentiel connaît le couple `(code, compte)` (table
`facturation_ref_imputations`) et l'UI permet parfois de choisir un compte, mais partout
ailleurs le compte reste un passager optionnel. L'audit (2026-08-15) a confirmé trois
symptômes :

1. **Aucun garde-fou** : une facture se tamponne dès qu'un code est retenu
   (`InvoicePanel.tsx` `canStamp`), même si un code a plusieurs comptes possibles et
   qu'aucun n'a été choisi (`record.comptes[code] === ''`). Le tampon sort avec le code
   seul, sans le moindre avertissement (`notices.ts`/`InvoiceNotices` ignorent le compte).
2. **Trois formats d'affichage** du couple selon l'écran : chip mono, tampon
   « `code   compte` » (trois espaces), historique « `code compte` » (un espace).
3. **Compte peu visible / peu éditable** : dans `CodePicker`, un code multi-comptes
   n'affiche que « N comptes » avant sélection ; un code sans compte au référentiel n'a
   aucun rendu ni repli.

Ce chantier **fiabilise l'existant sans refonte** : il ne touche ni au cerveau
(détection/apprentissage du compte par émetteur), ni à la galaxie, ni à la table legacy
`facturation_budget_lines` — ces trois sujets restent explicitement différés. Périmètre :
garde-fou au tamponnage, format unique du couple, compte visible/éditable partout où il
manque, traitement propre du code sans compte.

Contraintes projet : Supabase PRODUCTION, mais **ce chantier n'exige aucune migration SQL**
(front + métier pur). Commit/push seulement sur demande. Named exports, alias `#/` avec
extension, simple quotes, pas de point-virgule.

---

## Angles à clarifier (tranchés le 2026-08-15)

- **A1 — Bloquer ou avertir au tamponnage ? → BLOQUER.** Quand un code retenu a plusieurs
  comptes possibles et qu'aucun n'est choisi, le bouton Tamponner est désactivé
  (`canStamp` faux) et la notice `compte-manquant` est de type bloquant (`error`).
- **A2 — Séparateur du format unique. → Écran `·`, PDF en colonnes.** La LOGIQUE de présence
  du compte est unifiée (une seule fonction pure), mais l'écran affiche `code · compte`
  (chips, picker, historique, aperçu) tandis que le tampon PDF conserve l'alignement en
  colonnes (`code   compte`) pour la lisibilité à l'impression.
- **A3 — Code sans compte au référentiel. → Indicateur discret, sans blocage.** Mention
  discrète « pas de compte » en lecture seule, pas de saisie libre (édition du référentiel
  hors périmètre), le tamponnage reste possible.

Aucune divergence inter-agents n'est remontée : les trois explorations d'audit couvraient
des zones disjointes (métier/SQL, page principale, galaxie) et ne se contredisent pas.

---

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-metier-format-et-garde-fou.md](./1-metier-format-et-garde-fou.md) | Métier pur : fonction de format unique du couple + détection des comptes manquants + notice `compte-manquant` | — | P0 | 2h | helpers testés, notice prête | |
| 2 | [2-parcours-imputation.md](./2-parcours-imputation.md) | Parcours d'imputation : garde-fou branché (`InvoiceNotices`/`canStamp`), compte visible/éditable dans `CodePicker`, format unique dans chips + `ImputationList`, cas code sans compte | 1 | P0 | 3h | tamponnage fiabilisé, compte partout dans le parcours | |
| 3 | [3-surfaces-lecture.md](./3-surfaces-lecture.md) | Surfaces de lecture : format unique appliqué au tampon (`stampLayout`/`stamp`), à l'aperçu (`StampPreview`) et à l'historique (`HistoriqueDialog`) | 1 | P1 | 1h30 | couple affiché de façon homogène | |
| 4 | [4-validation-globale.md](./4-validation-globale.md) | Validation : `npx tsc --noEmit` + tests + `pnpm build` + recette bout en bout | 1, 2, 3 | P0 | 1h | chantier vérifié | ⚠ |

---

## Ordre d'exécution

- **À acter avant l'étape 2** : A1 (bloquer vs avertir), A2 (séparateur), A3 (code sans compte).
- **Étape 1** d'abord (socle métier pur, sans dépendance UI).
- **Étapes 2 et 3** parallélisables une fois l'étape 1 faite : elles touchent des fichiers
  disjoints (parcours interactif vs surfaces de lecture) et consomment toutes deux les
  helpers de l'étape 1.
- **Étape 4** en dernier (validation globale).
- Premier livrable de valeur : à l'issue de l'étape 2, plus aucune facture ne se tamponne
  avec un compte manquant sans avertissement, et le compte est visible/éditable dans tout
  le parcours d'imputation.

---

## Architecture cible

```
src/lib/facturation/
├── imputationFormat.ts   [nouveau]  fonction pure : parts + rendu du couple (code, compte)
├── budgetRegistry.ts     [modifié]  helper missingComptes(codes, comptes, comptesFor)
├── notices.ts            [modifié]  notice `compte-manquant`
├── types.ts              [modifié]  éventuel type de la nouvelle notice
├── stampLayout.ts        [modifié]  stampLines consomme imputationFormat (colonnes PDF)
├── stamp.ts              [modifié]  rendu PDF aligné sur le format unique
└── facturation.test.ts   [modifié]  tests des helpers

src/components/facturation/
├── InvoicePanel.tsx      [modifié]  canStamp + chips + ImputationList au format unique
├── InvoiceNotices.tsx    [modifié]  rendu de la notice compte-manquant
├── CodePicker.tsx        [modifié]  compte visible/éditable au cochage, cas 0 compte
├── StampPreview.tsx      [modifié]  aperçu au format unique (via stampLines déjà partagé)
└── HistoriqueDialog.tsx  [modifié]  couple au format unique
```

Aucune modification SQL. La galaxie, `detect.ts`, `issuerMemory.ts`,
`facturation_budget_lines` et l'apprentissage du compte par émetteur restent hors périmètre.

---

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB (SQL) | — | — |
| Métier (lib) | `budgetRegistry`, `notices`, `types`, `stampLayout`, `stamp`, `facturation.test` | `imputationFormat` |
| Composants (UI) | `InvoicePanel`, `InvoiceNotices`, `CodePicker`, `StampPreview`, `HistoriqueDialog` | — |

| **Total** | **~11 modifiés** | **1 nouveau** |
