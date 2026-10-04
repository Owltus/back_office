# Étape 1 — LLM : voir les changements avant d'importer, refuser un document ⚠

## Objectif

Quand on colle la réponse du LLM (bouton `{}`), l'aperçu montre aujourd'hui la
LISTE des documents touchés. Il doit montrer, pour chaque document :
- **ce qui change dans le texte** : ajouts, retraits, parties inchangées
  repliées ;
- une **case** pour refuser le document ;
- un bouton « Importer N documents ».

## Contexte (faits établis par l'exploration)

- L'aperçu (`MergePreviewItem`) n'a **ni identifiant ni lien** avec les
  actions. Les lignes se construisent depuis `plan.actions`.
- Le plan est **recalculé** à l'import (`appliquerPlanifie` relit l'état). Un
  refus se transmet donc par une **clé stable** :
  - `kind:id` pour une modification, une restauration ou une suppression ;
  - repli position + titre pour une création, qui n'a ni id ni uuid (D13).
- Le filtre agit **avant** le test `actions.length === 0` et **avant**
  `insertMergeHistory`. Ordre intouchable : point de restauration →
  `sansPointsAuto(écritures)` → élagage.
- `resultat` (compteurs du message de succès et du point) est recalculé après
  filtrage.

## Fichier(s) impacté(s)

- `src/lib/classeur/merge/portee.ts` (`planifierFusionPortee` l.263, `planChapitre`, `planDocument`)
- `src/lib/classeur/merge/apply.ts` (`appliquerFusionPortee` l.317 → `appliquerPlanifie` l.331, paramètre `exclus`)
- `src/components/classeur/hooks/useMerge.ts` (l.65)
- `src/components/classeur/dialogs/EchangeJsonDialog.tsx` :
  - `Preparation` l.95 : garder l'ancien contenu ;
  - aperçu l.430-467 ;
  - Importer l.493-501.
- `src/components/classeur/dialogs/HistoriqueDocumentDialog.tsx` (extraction l.261-399)
- `src/components/classeur/detail/DiffTexte.tsx` (nouveau)

## Travail à réaliser

### 1. Composant partagé `DiffTexte`

Extraire de l'Historique `Champ`, `SegmentDiff`, `LigneAffichee` et la partie
diff de `Comparaison`. L'Historique doit rendre **exactement** les mêmes
nœuds : faire un instantané AVANT l'extraction. Les couleurs suivent D14.

### 2. Lignes de l'aperçu

Une ligne par action de document, repliable :
- titre ;
- bilan « +12 −3 » ;
- version prévue (`evolutionVersion`) et sa raison (D22) ;
- case cochée par défaut.

Cas particuliers :
- une action qui ne change que l'ordre affiche « déplacé » (diff vide) ;
- une création montre le texte entier ;
- une suppression (option du mode chapitre) montre le texte retiré ;
- `modifierChapitre` (libellé ou description du chapitre) est une ligne à
  part, sans case.

Le diff n'est calculé **qu'au dépliage** (`useMemo` par ligne) : la table LCS
peut atteindre ~16 Mo par document, et `MAX_CELLULES` (4 M) fait se replier
le diff sur « tout retiré / tout ajouté ».

### 3. Refus

- `planifierFusionPortee(…, exclus)` retire les actions exclues.
- `appliquerFusionPortee({ …, exclus })` les transmet au recalcul.
- Le bouton « Importer N documents » compte les lignes cochées ; il est
  désactivé à 0.
- Après l'import : « 1 document ignoré à votre demande » (D23).

## Implications propres

- Si tout est refusé : aucune écriture **et aucun point de restauration**.
- Refuser un document dont l'ordre a changé peut laisser des `sort_order`
  égaux. On accepte un ordre ambigu, sans casse SQL, et on le signale dans la
  ligne.
- Versionnage `avecVersion` inchangé.

## Phase de test /martin

### A. Propriétés fast-check (numRuns 500, plans générés)

Plans générés par le générateur de `merge/fixtures.ts`.

- (a) plan filtré ∩ exclus = ∅ ;
- (b) exclus vide ⇒ plan **identique** à l'actuel. Oracle : l'ancienne
  fonction, copiée dans le test avant la modification ;
- (c) tout exclu ⇒ 0 action, `insertMergeHistory` jamais appelé ;
- (d) clés stables : deux recalculs sur le même JSON donnent les mêmes clés ;
- (e) `DiffTexte` reconstitue les deux textes (loi de `diff.ts`).

### B. Simulateur (étape 0)

- Ordre point → écritures → élagage.
- Un document exclu n'a ni `updated_at` ni version changés.
- Un refus RLS rend 0 ligne et l'erreur remonte.

### D. Rendu jsdom

- L'Historique est identique à son instantané.
- Le compteur du bouton suit les cases.

### Mutations

Posées à la main, chacune doit être attrapée :
- filtre retiré ;
- filtre déplacé après `insertMergeHistory` ;
- `resultat` non recalculé.

Stryker ≥ 80 % sur `portee.ts` et `apply.ts`.

### Utilisateur

Un import réel avec un document refusé. L'assistant vérifie en lecture que le
document refusé est inchangé et que le point `fusion` est présent.

## Critère de validation

- Navigateur SANS écrire : JSON modifié du doc 100, diff visible, décocher ⇒
  « Importer N−1 », Annuler.
- Base inchangée (lecture avant / après).
- `npx tsc --noEmit`, `pnpm test`.

## Contrôle /borg

- Aucun chemin d'écriture ne contourne le filtre (fusion complète,
  restauration d'un point : `exclus` absent = comportement d'aujourd'hui).
- Points de restauration : jamais pris pour 0 action, toujours avant la
  première écriture.
