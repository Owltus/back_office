# Étape 2 — Mode d'emploi pour l'IA ⚠

## Objectif

Réécrire `consignes.ts` : les consignes ne sont plus des « règles de format »
mais un guide qui fait **dialoguer** l'IA avec une personne non initiée. Une
seule source pour les trois exports, comme aujourd'hui.

## Fichier(s) impacté(s)

- `src/lib/classeur/merge/consignes.ts` (réécrit).
- `src/lib/classeur/merge/schema.ts` : `SCHEMA_DESCRIPTIF.import_rules`
  (l.288-303) et `periodicites` (l.273-287) corrigés ; `signature_sheet`
  (l.254-264) dit ce qu'est `nombre` (lignes à signer, 1 à 60) ; `note`
  (l.610) reformulée ; `itemVersJson` ajoute `periodicite` (libellé) sur une
  feuille de suivi (D8).
- `src/lib/classeur/merge/portee.ts` : `note` (l.143, 177).
- Tests : `portee.test.ts` « les TROIS exports » (l.323-387), `schema.test.ts`
  (clés par nature l.336-379, aller-retour) ; nouveau `consignes.test.ts`.

## Travail à réaliser

### 1. Structure du mode d'emploi (`instructions`, tableau de chaînes)

1. **À qui tu parles** : du personnel d'hôtel, pas des informaticiens. Mots
   simples, une chose à la fois, jamais de vocabulaire JSON avec la personne.
   Commencer par demander ce qu'elle veut faire, sauf si c'est déjà dit, en
   proposant 4 choix : poser une question, mettre à jour ou corriger, ajouter
   (chapitre, document, feuille), créer quelque chose à partir du contenu.
2. **Répondre à une question** : uniquement à partir du contenu exporté,
   en citant le chapitre et le titre de l'élément. Si l'information n'y est
   pas, le dire. Pas de JSON dans ce cas. Pour un export d'un seul document,
   dire qu'une question plus large demande l'export du chapitre ou du classeur.
3. **Modifier** : reformuler ce qui est compris, proposer un plan court,
   attendre l'accord, PUIS rendre le JSON complet dans un seul bloc de code,
   suivi de trois lignes : où cliquer dans l'app pour l'importer (selon la
   portée), et qu'on y voit les changements avant de valider.
4. **Proposer des idées** : après lecture, quelques suggestions concrètes et
   courtes : document manquant, étape floue, photo utile (emplacement
   `a-inserer`), avertissement de sécurité (`[!WARNING]`), feuille de suivi
   pour un contrôle périodique, feuille de signature pour une formation ou une
   prise de connaissance, intercalaire pour séparer des parties.
5. **L'app** : les 4 natures et quand utiliser chacune ; comment en AJOUTER une
   (sans `uuid`, `kind`, champs requis) ; périodicités : choisir un `id` de
   `_metadata.periodicites`, jamais en inventer ; `nombre` entre 1 et 60 ;
   ajouter un chapitre ; conventions de mise en page actuelles (gardées
   telles quelles : `===`, encadrés, images, `:::photos`, `:::etape`, A4 noir
   et blanc).
6. **Les limites** : rappeler qu'une IA peut se tromper et qu'un document
   réglementaire se relit avant impression, **uniquement dans la conversation**.
   Règle explicite : aucune mention de l'IA, de vérification à faire, de
   brouillon ou de doute dans un titre, une description ou un contenu.

Puis la portée (classeur, chapitre, document), en tête, courte.

### 2. Ce qui reste interdit

`uuid` d'un élément existant, `kind`, chemins d'images, `_metadata`. Selon
D4 : `periodicite_id` et `nombre` deviennent modifiables (validés à l'étape 6).
La consigne « réimporte en REMPLACEMENT » disparaît (l'étape 5 rend le choix
inutile pour un fichier d'IA).

### 3. Schéma descriptif

Corriger les deux contre-vérités (« le merge n'efface jamais »,
« periodicites ignorée à l'import ») sans contredire Registre : décrire le
comportement de chaque application.

## Implications propres

- Le test des trois exports change d'exigences : retirer `réimporte en
REMPLACEMENT`, ajouter les marqueurs du nouveau guide (une phrase par partie,
  « jamais dans le contenu »).
- La longueur compte : viser moins de 6 ko de consignes (mesurer).

## Phase de test /martin

- Chaque export (3) contient les 6 parties et la règle du quatrième mur.
- Aucun texte d'UI interdit dans les consignes destinées à l'utilisateur final
  (pas concerné : elles sont lues par l'IA).
- Aller-retour exact avec le libellé `periodicite` ajouté (ignoré à la lecture).

## Critère de validation

- Essai manuel : coller un export du classeur d'essai n° 24 (copie locale) dans
  une IA ; elle doit demander ce que l'on veut, répondre à une question en
  citant le chapitre, et ne rendre un JSON qu'après accord.
- `npx tsc --noEmit`, `pnpm test`.

## Contrôle /borg

- Les cinq clés de Registre sont présentes et typées dans les trois exports.
- `lireMetadata` relit tout ce que `construireExport` écrit.
- Aucune convention de mise en page n'a été perdue dans la réécriture
  (comparer la liste des marqueurs avant / après).
