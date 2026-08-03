# Étape 1 — Spécifier `gestion` = le passé verrouillé

## Objectif

Figer, en un seul endroit, la sémantique des trois niveaux et la règle « fenêtre
de grâce », puis matérialiser cette règle en constantes partagées réutilisables
par les boards et (en miroir) par la RLS. C'est le socle qui débloque tout le reste.

## Contexte

Aujourd'hui la correspondance action → niveau est **codée en dur, board par
board** (`can('parking','ecriture')`, `can('repjour','gestion')`, …), sans source
unique. Le niveau `gestion` n'a pas de sens commun. La décision utilisateur lui en
donne un : `gestion` = éditer le **passé verrouillé** (au-delà d'une fenêtre de
grâce), tandis que `ecriture` couvre le présent, le futur, le passé récent et tout
ce qui est encore en cours.

## Fichier(s) impacté(s)

- `plan/acces-par-page-consolidation/1-spec-gestion-passe-verrouille.md` (ce doc — référence)
- `src/lib/permissions/actions.ts` (nouveau — constantes de fenêtres de grâce + doc)

## Travail à réaliser

### 1. Table de référence (doc, dans ce fichier)

Trois niveaux, hiérarchie `lecture (1) < ecriture (2) < gestion (3)` (existante,
`lib/permissions/levels.ts`). Sémantique commune :

- **lecture** : voir données + analytique. Aucun effet de bord.
- **ecriture** : créer/modifier/supprimer les données **d'actualité** — présent,
  futur, passé dans la **fenêtre de grâce**, et tout enregistrement encore en cours.
- **gestion** : tout ce que `ecriture` permet, **plus** la modification du passé
  au-delà de la fenêtre de grâce (rouvrir/éditer l'historique figé).

Fenêtres de grâce par page (source unique, cf. §2) :

| Page    | Fenêtre de grâce `ecriture` | Champ pivot                        | Passé verrouillé → `gestion` |
|---------|-----------------------------|------------------------------------|------------------------------|
| parking | 7 jours                     | date de fin `start_date + nights`  | fin < aujourd'hui − 7 j      |
| caisse  | 24 h après validation *(déjà)* | `validated_at`                  | feuille clôturée hors grâce  |
| rapro   | jour non validé *(à ajouter)* | `validated_at` du jour            | jour validé                  |

### 2. Constantes partagées

```ts
// src/lib/permissions/actions.ts
// Fenêtres de grâce : combien de temps le passé récent reste modifiable en
// `ecriture` avant de basculer en `gestion`. Source UNIQUE, reprise à
// l'identique par la RLS Supabase (garder les deux synchronisés).

/** Parking : jours après la date de fin de séjour où une résa reste éditable
 *  en écriture. Au-delà, seule la gestion peut modifier. */
export const PARKING_GRACE_DAYS = 7

/** Caisse : heures après validation où un writer peut encore rééditer sans
 *  passer gestion (déjà appliqué dans lib/caisse/service.ts — réexporté ici
 *  pour centraliser la valeur). */
export const CAISSE_GRACE_HOURS = 24
```

Ne PAS déplacer la logique caisse existante dans ce fichier à cette étape (risque
de régression) ; se contenter d'y **documenter et centraliser les valeurs**. La
refactorisation caisse vers `actions.ts` est hors périmètre (optionnelle plus tard).

## Ordre d'exécution

1. Rédiger les tables de référence ci-dessus (fait dans ce doc).
2. Créer `src/lib/permissions/actions.ts` avec les constantes + commentaires.
3. Vérifier qu'aucune valeur en dur `7` / `24` ne diverge dans le code existant.

## Critère de validation

- `src/lib/permissions/actions.ts` existe, `npx tsc --noEmit` passe.
- La règle « écriture = actualité + grâce, gestion = passé figé » est écrite noir
  sur blanc et référencée par les étapes 2 à 5.
- Aucune modification de comportement à cette étape (doc + constantes seulement).
