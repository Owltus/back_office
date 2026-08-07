# Étape 5 — Validation + déploiement

## Objectif

Mettre en ligne les garde-fous sans rien casser, et prouver le comportement.

## Fichier(s) impacté(s)

- `supabase/functions/import-report/*` (déploiement)
- `supabase/forecast_days_imported_at.sql` (exécution par l'utilisateur)

## Travail à réaliser

### 1. SQL (utilisateur)

Exécuter `supabase/forecast_days_imported_at.sql` dans le SQL Editor.

### 2. Déploiement (utilisateur) — ATTENTION verify_jwt

```
supabase functions deploy import-report --no-verify-jwt
```

⚠️ **Sans `--no-verify-jwt`, le 401 revient** (la passerelle réactive verify_jwt
par défaut ; `import-report` est protégée par `X-Import-Secret`, pas par le JWT).
Ne PAS redéployer `send-report` ici (elle doit garder verify_jwt).

Idéalement, figer aussi dans `supabase/config.toml` :
`[functions.import-report]` → `verify_jwt = false` (pour ne plus jamais l'oublier).

### 3. Validation

- **Dry-run** (`IMPORT_DRY_RUN=true`) : renvoyer Comparison seul → logs
  « Forecast pas frais → pas d'envoi » ; puis Forecast frais → « aurait envoyé ».
- **Réel restreint** : `REPORT_TEST_TO` sur ton adresse, `IMPORT_DRY_RUN=false` →
  vérifier 1 envoi RepJour quand les deux frais, 0 si Forecast manquant.
- **Manuel** : bouton Envoyer → part toujours, même auto abstenu.
- **Idempotence** : ré-import → pas de second envoi auto.

## Critère de validation

- Forecast manquant/périmé → aucun RepJour auto ; manuel ok.
- Comparison + Forecast frais → 1 RepJour auto, projeté juste.
- PDJ auto inchangé et calé cycle.
- Plus de 401 (verify_jwt off), imports OK.

## Contrôle /borg

Étape finale. Revue globale : pas de double envoi, pas d'envoi avec projeté
périmé, filet manuel intact, `verify_jwt` bien off pour import-report seulement,
aucune régression d'import, SQL additif non destructif.
