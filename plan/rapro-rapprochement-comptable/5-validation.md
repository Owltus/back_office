# Étape 5 — Validation globale

## Objectif

Vérifier de bout en bout que le rapprochement du jour (Réception/Étages/écart), les
deux champs saisis, et le récap mensuel ELIOR fonctionnent ensemble, sans
régression sur le suivi par chambre et le roulement existants.

## Contexte

Dernière étape (validation globale) — **critique**. Elle croise les couches
données (`rapro_sheets`), métier (`accounting.ts`, `monthly.ts`) et UI (board +
vue mois). Risques à re-vérifier : décalage de date PDJ vs `daily_reports` (si D1
retenait l'OCC officiel), no-show hors rapprochement, upsert partiel des nombres
qui ne doit pas écraser le commentaire/la clôture.

## Fichier(s) impacté(s)

- Aucun nouveau ; vérification transverse de `src/lib/rapro/*`, `src/components/rapro/*`, `src/routes/rapro.mois.tsx`, `supabase/rapro_sheets.sql`.

## Travail à réaliser

### 1. Scénarios fonctionnels

- Jour équilibré : occupées = nettoyées + refus + bloquées → **écart 0** (vert).
- Arrivée après clôture / correction saisie → écart cohérent ; les nombres persistent au retour sur le jour.
- Récap mensuel : total = somme des nettoyées ; une bloquée nettoyée 3 jours plus tard compte le bon jour, pas de double comptage.
- No-show : n'entre ni dans la Réception ni dans les Étages (écart inchangé).
- Clôture d'un jour : les 2 champs + le commentaire se figent (`canEditFields`), rien n'est écrasé.

### 2. Cas limites

- Jour sans PDJ importé : occupation « — », le bloc rapprochement se dégrade proprement.
- Mois sans aucune donnée rapro : récap = tous les jours à 0, total 0 (pas de plantage).
- Réouverture d'une clôture : les nombres restent cohérents (upsert partiel).

### 3. Vérifications techniques

- `npx tsc --noEmit` et `pnpm build` verts ; chunk `rapro` raisonnable, jsPDF toujours en `import()` dynamique (si D3=PDF) ; export CSV ne casse pas le build.

## Ordre d'exécution

1. Dérouler les scénarios et cas limites (l'utilisateur teste l'écriture réelle avec un compte super/admin — jamais l'assistant).
2. `npx tsc --noEmit` puis `pnpm build`.
3. Corriger les écarts éventuels.

## Critère de validation

- Tous les scénarios se comportent comme décrit ; les cas limites ne plantent pas.
- Rapprochement du jour et récap mensuel cohérents entre eux.
- `npx tsc --noEmit` et `pnpm build` verts.

## Contrôle /borg

Dernière étape (validation globale). Auditer :

- Aucune régression sur le suivi par chambre, le roulement (`carryover`), la clôture (`canEditFields`) ni le commentaire.
- Upsert partiel de `saveSheetNumbers` : n'écrase ni `comment`, ni `status`, ni `validated_*`.
- Écart comptable correct (no-show exclus ; bloquées = jour seul, D2) ; total mensuel = somme des `nettoyee` sans double comptage.
- Aucune écriture assistant sur la base ; migration `rapro_sheets` additive exécutée par l'utilisateur ; `rapro_rooms` intouché.
- Si export CSV : pas de fuite de données sensibles (le récap ne contient que date + compte de nettoyées, aucun nom client).
