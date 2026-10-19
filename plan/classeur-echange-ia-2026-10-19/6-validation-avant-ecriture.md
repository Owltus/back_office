# Étape 6 — Validation avant toute écriture ⚠

## Objectif

Un fichier d'IA ne doit jamais casser un import au milieu (aucune transaction,
écritures séquentielles). Tout ce que la base refuserait est contrôlé AVANT
l'instantané, et devient un avertissement clair ou un élément ignoré.

## Dépend de

5.

## Faits établis

- `nombre` : aucune borne côté app, `CHECK (nombre BETWEEN 1 AND 60)` en base.
- Uuid mal formé : erreur 22P02, non réessayée (`avecRepliUuid` ne gère que 23505).
- Périodicité : un id inventé qui tombe sur un id réel passe sans avertissement
  (test P10, l.2061) ; un id absent prend le défaut sans avertissement.
- `lireItem` (`schema.ts` l.373) contrôle les types, pas les bornes.

## Fichier(s) impacté(s)

- `src/lib/classeur/merge/validationImport.ts` (nouveau, pur) :
  `validerFichierImport(fichier, periodicitesLocales)` rend
  `{ fichierCorrige, avertissements }`.
- `src/lib/classeur/merge/apply.ts` / `importIa.ts` : appel avant le plan.
- `src/components/classeur/dialogs/ApercuImport.tsx` : affichage des
  avertissements (phrases courtes).

## Travail à réaliser

1. `nombre` hors 1..60 ou non entier : ramené dans la borne, avertissement
   « Feuille X : 100 lignes demandées, 60 au plus. »
2. Uuid d'un élément ou d'un chapitre : format UUID vérifié ; mal formé →
   retiré (l'élément est créé comme nouveau), avertissement.
3. Périodicité d'une feuille de suivi : id inconnu du référentiel local →
   défaut « Non défini » + avertissement ; id présent localement mais dont le
   libellé diffère de celui du fichier (`periodicite` de D8) → avertissement.
   Création sans `periodicite_id` → avertissement (plus de défaut muet).
4. Titre vide : élément ignoré, avertissement.
5. Selon D4 : un changement de périodicité ou de nombre est affiché en clair
   dans le diff (« Mensuelle → Trimestrielle », « 14 → 20 lignes ») au lieu de
   « réglage modifié ».

## Phase de test /martin

- **Fuzzing (numRuns 2000)** : fichiers aléatoires (nombres, uuid, ids
  arbitraires) ; aucun ne produit, après validation, une écriture que le
  simulateur refuserait (CHECK, 22P02, FK).
- **Mutation** : borne 60 → 61, regex d'uuid trop large : attrapés.

## Critère de validation

- Un JSON avec `nombre: 100`, un uuid `"doc-1"` et une périodicité 999 :
  aperçu avec trois avertissements, import complet sans erreur (simulateur).

## Contrôle /borg

- La validation précède le point de restauration et l'écriture.
- Un fichier valide n'est pas modifié (identité exacte).
