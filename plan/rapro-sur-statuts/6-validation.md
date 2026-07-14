# Étape 6 — Validation bout à bout

## Objectif

Vérifier la cohérence transverse du modèle base + qualificatif : compilation et
build, facturation ELIOR, combinaisons métier, et interaction (pose/retrait des
deux dimensions). Puis committer l'ensemble du chantier `/rapro`.

## Contexte

Ce chantier fait évoluer du code encore **non commité** (décision D6-Option A) :
la validation porte donc sur l'état complet de `/rapro` (modèle base+qualificatif
+ tout l'acquis de `rapro-statuts-chambres`). Aucun test unitaire n'existe sur
`reconcile`/`carryover`/`monthly` → la vérification est manuelle et transverse.

## Fichier(s) impacté(s)

- Ensemble des fichiers du chantier (revue transverse).

## Travail à réaliser

### 1. Compilation et build

```bash
npx tsc --noEmit
pnpm build
```

### 2. Matrice des combinaisons

Sur un jour test, vérifier chaque combinaison :

| Base | Qualificatif | Attendu |
|------|--------------|---------|
| nettoyee | — | vert, facturable, résolu |
| nettoyee | faux_noshow | vert + icône, facturable, résolu |
| refus | faux_noshow | ambre + icône, NON facturable, hors charge |
| non_nettoyee | depart_anticipe | rouge + icône, dû → balance + roule |
| nettoyee | delogement | vert + icône, facturable |
| noshow | (interdit) | choisir faux_noshow bascule le base (D4) |

### 3. Facturation ELIOR

Récap mensuel non nul et cohérent ; un `refus + faux_noshow` n'apparaît PAS au
facturable (changement de règle D3 vs modèle plat).

### 4. Interaction

Pose base (clic gauche + menu), pose/retrait qualificatif (checkbox), rollback
d'étage, gating jour clôturé. Marqueurs additifs (reportée + faux no-show) sans
collision.

### 5. Commit

Committer l'ensemble du chantier `/rapro` (modèle base+qualificatif + acquis
antérieur non commité), une fois la validation OK. Rappeler à l'utilisateur le
script `supabase/rapro_rooms_qualifier.sql` à exécuter.

## Ordre d'exécution

1. `npx tsc --noEmit` puis `pnpm build`.
2. Dérouler la matrice des combinaisons.
3. Vérifier le récap ELIOR.
4. Scénarios d'interaction.
5. Corriger les écarts, re-valider, puis committer.

## Critère de validation

- `npx tsc --noEmit` et `pnpm build` verts.
- Toutes les lignes de la matrice se comportent comme attendu.
- Récap ELIOR cohérent (facturation suit le base).
- Interaction et marqueurs conformes.

## Contrôle /borg

Étape critique (validation transverse, dépend de tout le chantier). Auditer :
- La facturation ne dépend jamais du qualificatif (uniquement du base).
- Aucun statut/base orphelin dans la balance ; aucun qualificatif ne fige une
  chambre due.
- Aucune écriture client ne fixe `created_by`/`updated_at`.
- L'icône de qualificatif n'entre pas en collision avec la pastille « reportée »
  (coins distincts).
- Le commit final n'embarque pas de secrets ni le CSV reconstruit (PII).
