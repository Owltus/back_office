# Étape 6 — Validation globale

## Objectif

Vérifier de bout en bout : typecheck, build, tests, calcul correct sur la **paire réelle** de
fichiers fournie, routage/ingestion Edge, RLS et rôles, déploiement. Confirmer le Point de
correction n°1 (alignement des dates) sur données réelles.

## Contexte

Dernière étape (critique). Elle s'appuie sur les CSV fournis dans `doc/` :
`4401NACH_in_house_guests_report_DAILY_20260810030258.csv` (In-House, jour 2026-08-10) et
`4401NACH_addon_production_report_DAILY_20260810120502.csv` (Addon, date métier 2026-08-09).

## Fichier(s) impacté(s)

- Aucun (validation). Corrections ponctuelles si un critère échoue.

## Travail à réaliser

### 1. Typecheck + build + tests

- `npx tsc --noEmit` (client) — vert.
- `pnpm build` — vert, vérifier qu'aucun chunk n'explose.
- `pnpm test` — `addon.test.ts` et `amounts.test.ts` verts, non-régression des tests PDJ existants.

### 2. Contrôle du calcul sur la paire réelle (Point de correction n°1)

- Importer les DEUX fichiers (manuellement dans la page, en admin) : le In-House se range sous
  `2026-08-10`, l'Addon (métier 2026-08-09) **doit** se ranger sous `2026-08-10` (business +1).
- Sur le jour `2026-08-10`, contrôler le PDF :
  - **PDJ Inclus = 797,27 €** (= (817,00 + 60,00) / 1,1).
  - Couverts PDJ / PDJBB comptés depuis le In-House cohérents (avertissement B1 si 0 couvert).
  - Extras = `Σ max(0, servi − inclus)` ; case « PDJ Extra » vide tant qu'aucune case
    supplémentaire n'est cochée, puis valorisée au prix unitaire PDJ dès qu'on en coche.
  - **Total = PDJ Inclus + Extras** (HT).
- Si l'alignement ne tombe pas juste (jour du board ≠ jour où atterrit l'Addon), c'est
  l'hypothèse +1 à revoir — le signaler AVANT de continuer (ne pas masquer un résultat faux).

### 3. Ingestion Edge (auto)

- Vérifier `detectType` : le nom `..._addon_production_report_DAILY_...` → `'addon'` ; un
  In-House reste `'inhouse'` (pas de régression).
- Test réel ou dry-run (`IMPORT_DRY_RUN`) : un email/POST Addon écrit `pdj_addon_production`
  sans déclencher d'auto-envoi RepJour.
- Rappeler le déploiement : `supabase functions deploy import-report --no-verify-jwt`.

### 4. RLS + matrice de rôles

- Un compte **sans** `page:pdj` : lit 0 ligne de `pdj_addon_production`, ne peut pas écrire.
- Un compte `lecture` : lit, ne peut pas insérer/modifier (rank < 2).
- Un compte `ecriture` : insère/modifie dans la fenêtre J-3 ; `gestion`/admin hors fenêtre.
- L'import manuel (admin) écrit bien la table sous RLS ; l'Edge (service_role) écrit hors RLS.

### 5. Non-régression PDJ

- Board In-House inchangé (grille, cases servi, impression, suppression jour, purge RGPD).
- Analytique PDJ inchangée.

## Ordre d'exécution

1. tsc + build + tests.
2. Import de la paire réelle + contrôle des montants (Point de correction n°1).
3. Vérif Edge (routage + pas d'auto-envoi) + rappel déploiement.
4. Matrice RLS/rôles.
5. Non-régression.

## Critère de validation

- Build + tsc + tests verts.
- PDJ Inclus = 797,27 € sur la paire réelle ; alignement des dates confirmé.
- Addon détecté et routé côté Edge, sans auto-envoi ; déployé `--no-verify-jwt`.
- RLS conforme (défaut fermé, écriture bornée) sur `pdj_addon_production`.
- Aucune régression sur l'existant PDJ.

## Contrôle /borg

Étape critique (validation globale). Auditer :
- Cohérence du calcul HT (arrondi au total, division par zéro gardée, extras valorisés au bon
  prix unitaire) contre un contrôle manuel sur la paire réelle.
- Étanchéité RLS de `pdj_addon_production` (lecture ET écriture bornées `page:pdj`).
- Le pipeline auto n'e-maille jamais sur un import Addon (bloc `maybeAutoSendRepjour` intact).
- Aucune policy réintroduite dans les fichiers de table (autorité unique).
- `import-report` redéployé avec `--no-verify-jwt` (sinon pipeline muet).
