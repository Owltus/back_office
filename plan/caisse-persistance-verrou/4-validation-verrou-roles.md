# Étape 4 — Verrou : validation, fenêtre de grâce, gating rôle / admin

## Objectif

Matérialiser côté UI la notion de **caisse validée = verrouillée**, strictement alignée sur la RLS de l'Étape 1 : action **Valider** (pose `status='validated'`, `validated_at`, `validated_by`), **contre-signer** (D5), état **verrouillé** visible, **fenêtre de grâce** de quelques heures pendant laquelle l'auteur peut encore corriger, verrouillage complet après la fenêtre pour les non-admins, et **déverrouillage admin** (remise en brouillon). L'UI est ergonomique ; la RLS reste l'autorité.

## Contexte

S'appuie sur `canEditSheet(sheet, role)`, `validateSheet`, `countersign`, `reopenSheet` (Étape 2) et sur la policy `UPDATE` temporelle (Étape 1). Le pattern « action réservée à l'admin » existe déjà : `role === 'admin'` dans `UserMenu.tsx`, `readOnly = role !== 'admin'` dans `GestionBoard.tsx`, gardes admin des Edge Functions. Aucune notion de fenêtre temporelle n'existe encore dans le repo — c'est le cœur nouveau de cette étape. Point de vigilance : la garde UI et la RLS doivent rester **synchronisées** (même durée, même condition) ; toute divergence produit soit un blocage frustrant, soit un bouton qui échoue en base.

## Fichier(s) impacté(s)

- `src/components/caisse/CaisseBoard.tsx` (modifié — logique de verrou et actions)
- `src/lib/caisse/service.ts` (déjà créé en Étape 2 ; ajuster si un helper manque)

## Travail à réaliser

### 1. États d'une feuille (dérivés)

Dans le board, dériver depuis `sheet` + `role` :

```ts
const isValidated = sheet?.status === 'validated'
const editable = canEditSheet(sheet, role)              // reflète la RLS
const inGrace = isValidated && editable && role !== 'admin'
const lockedForMe = isValidated && !editable            // validé + hors fenêtre + non-admin
const isAdmin = role === 'admin'
```

### 2. Actions et rendu

- **Bouton « Valider la caisse »** : visible si `editable && !isValidated`. Recommandé : confirmation (`window.confirm`, pattern maison) rappelant qu'après validation l'édition ne restera possible que **quelques heures** (afficher `GRACE_HOURS`). Au clic : d'abord `upsertSheet` (garantir que la dernière saisie est persistée), puis `validateSheet(sheet.id, user.id)`, puis `invalidateQueries(['caisse'])`. Idéalement, n'autoriser la validation que si `isBalanced(form)` (écarts à 0) — sinon exiger un commentaire (message d'aide).
- **Bandeau d'état** : 
  - `inGrace` → bandeau info « Caisse validée à HH:MM — modifiable encore jusqu'à HH:MM » (fin = `validated_at + GRACE_HOURS`), éventuel compte à rebours.
  - `lockedForMe` → bandeau `bg-muted` « Caisse verrouillée. Contactez un administrateur pour toute correction. » + inputs en lecture seule.
- **Contre-signature** (D5) : bouton « Contre-signer » visible si `isValidated && !sheet.countersignedBy` et `role ∈ {super_utilisateur, admin}` (idéalement un utilisateur différent de `validated_by`). Au clic : `countersign(sheet.id, user.id)`.
- **Déverrouillage admin** : bouton « Rouvrir (admin) » visible si `isAdmin && isValidated`. Au clic : `window.confirm` puis `reopenSheet(sheet.id)` → repasse en brouillon (la RLS n'autorise cet UPDATE hors fenêtre qu'à l'admin).
- **Grisage des inputs** : tous les champs de saisie et la grille de coupures deviennent `disabled` quand `!editable`.

### 3. Robustesse

- Toute écriture (`upsert`, `validate`, `reopen`) est `try/catch` : si la RLS refuse (ex. un `super_utilisateur` tente une correction hors fenêtre via une session laissée ouverte), Supabase renvoie une erreur → afficher le bandeau d'erreur et `invalidateQueries` pour resynchroniser l'état réel. **Ne jamais présumer que le clic a réussi.**
- `validated_by` / `countersigned_by` sont des `uuid` : pour l'affichage « validé par X », joindre `profiles` (lecture) ou afficher les initiales déjà saisies ; ne pas exposer d'e-mail inutilement.

## Ordre d'exécution

1. Dériver les états (`isValidated`, `editable`, `inGrace`, `lockedForMe`, `isAdmin`).
2. Câbler le bouton Valider (+ confirmation + persistance préalable).
3. Bandeaux d'état (grâce / verrouillé) + grisage conditionnel des inputs.
4. Contre-signature.
5. Déverrouillage admin (`reopenSheet`).
6. Envelopper les écritures de `try/catch` + resynchronisation.

## Critère de validation

- Un `super_utilisateur` valide une feuille : elle passe « validée », reste éditable, un bandeau annonce la fin de la fenêtre de grâce.
- Après la fenêtre (test : régler temporairement `GRACE_HOURS`/l'`interval` à une valeur courte, ou manipuler `validated_at`), le même `super_utilisateur` ne peut plus éditer (inputs grisés) **et** une tentative d'écriture est refusée par la RLS (vérifié en Étape 5).
- L'`admin` peut éditer et rouvrir une feuille validée hors fenêtre ; le bouton « Rouvrir » n'apparaît que pour lui.
- La contre-signature se pose une fois et s'affiche.
- `npx tsc --noEmit` et `pnpm build` passent.

## Contrôle /borg

Étape critique (logique de verrou/sécurité côté UI, qui doit rester cohérente avec la RLS). Audit post-exécution :
- La condition `canEditSheet` (UI) est **strictement équivalente** à la policy RLS UPDATE : rôle super/admin ET (admin OU non validé OU `now() < validated_at + GRACE`). Pas de branche UI plus permissive que la base.
- `GRACE_HOURS` (TS) == `interval` (SQL) — une seule source de vérité conceptuelle ; documenter que changer l'un impose de changer l'autre.
- Toutes les écritures sont gardées en `try/catch` avec resynchronisation : aucun état UI « validé/édité » ne peut diverger d'un refus RLS silencieux.
- Le déverrouillage (`reopenSheet`) n'est proposé qu'à l'admin ; un non-admin qui forcerait l'appel est de toute façon bloqué par la RLS (défense en profondeur).
- Aucune donnée de sécurité n'est fondée sur le cache `localStorage` du rôle (`bo.auth.profile.v1`) : le rôle sert à l'ergonomie, la RLS tranche.
