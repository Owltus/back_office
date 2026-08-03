# Étape 5 — Rapro : réouverture d'un jour validé réservée à `gestion`

## Objectif

Corriger l'asymétrie avec la caisse : aujourd'hui, une fois un jour de
rapprochement validé (`isValidated`), tout le monde est figé, admin compris — il
n'existe aucun chemin de réouverture. On aligne rapro sur le modèle caisse :
`gestion` peut rouvrir un jour validé (= éditer le passé verrouillé).

## Contexte

`RaproBoard.tsx` : `isWriter = can('rapro','ecriture')` (l.81),
`canEditFields = isWriter && !isValidated` (l.137). La caisse a déjà le motif de
référence : `canEditSheet(sheet, level)` dans `lib/caisse/service.ts` autorise la
réédition/réouverture hors grâce seulement si `level === 'gestion'`. On transpose.

## Fichier(s) impacté(s)

- `src/lib/rapro/service.ts` (modifié — `canReopen(sheet, level)` + `reopenSheet`)
- `src/components/rapro/RaproBoard.tsx` (modifié — bouton Réouvrir sous gestion)
- `supabase/rapro_reopen_gestion.sql` (nouveau — RLS/RPC de réouverture)

## Travail à réaliser

### 1. Logique service

```ts
// lib/rapro/service.ts
import type { PageLevel } from '#/lib/permissions/levels.ts'
import { atLeastLevel } from '#/lib/permissions/levels.ts'

/** Un jour validé n'est réouvrable qu'en gestion (miroir caisse). */
export function canReopenRaproDay(validated: boolean, level: PageLevel | null): boolean {
  if (!validated) return false
  return !!level && atLeastLevel(level, 'gestion')
}
```

Prévoir la fonction `reopenSheet(day)` (ou l'équivalent existant) qui repasse le
jour en non-validé via RPC serveur.

### 2. Board

```tsx
const canManage = can('rapro', 'gestion')
// quand isValidated :
//  - canManage  -> bouton « Réouvrir » (repasse en édition)
//  - sinon      -> état « Verrouillé » + tooltip « Réouverture réservée à la gestion »
```

Reprendre l'ergonomie exacte de la caisse (`CaisseBoard` l.604-629) pour la
cohérence visuelle (bouton Réouvrir / badge Verrouillé + tooltip).

### 3. SQL — RLS de réouverture

Si la validation rapro est portée par une colonne `validated_at`/`validated` sur
`rapro_sheets`, ajouter/ajuster la policy UPDATE : passer de `validated → false`
n'est permis que si `get_page_level('rapro') = 'gestion'`. Modèle caisse :

```sql
-- rapro_sheets : rouvrir (validated=true -> false) réservé à la gestion.
-- Écriture normale (jour non validé) reste à >= 2. À écrire selon le schéma réel
-- de rapro_sheets (vérifier les colonnes de validation avant rédaction).
```

Préférer une **RPC `SECURITY DEFINER`** `rapro_reopen_day(p_day)` avec garde
`if public.get_page_level('rapro') <> 'gestion' then raise exception 'not
authorized'` — cohérent avec la façon dont la caisse gère la réouverture, et plus
simple qu'une policy UPDATE conditionnelle sur transition d'état.

## Ordre d'exécution

1. `canReopenRaproDay` + tests unitaires.
2. RPC `rapro_reopen_day` (SQL, exécuté par l'utilisateur).
3. Bouton Réouvrir / badge Verrouillé dans `RaproBoard`.

## Contrôle /borg

Étape critique (réouverture d'un état validé en prod). Auditer :
- La réouverture est impossible en `ecriture` (UI **et** RPC).
- Rouvrir ne perd aucune donnée déjà saisie (repasse juste l'état éditable).
- La matérialisation ELIOR à la clôture (cf. mémoire rapro) n'est pas corrompue
  par un cycle valider → rouvrir → revalider.
