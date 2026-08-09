# Étape 1 — Edge : retirer l'envoi AUTO du PDJ

## Objectif

Le pipeline `import-report` n'envoie plus de PDJ après l'import In-House. L'import
In-House lui-même (écriture `pdj_breakfasts`) est CONSERVÉ.

## Fichier(s) impacté(s)

- `supabase/functions/import-report/index.ts` (modifié)
- `supabase/functions/import-report/autoSendPdj.ts` (supprimé)
- `supabase/functions/_shared/pdj/render.ts` (supprimé)
- `supabase/functions/_shared/pdj/pdf.ts` (supprimé)

## Travail à réaliser

### 1. Retirer le déclenchement auto PDJ dans index.ts

- Supprimer l'import `import { maybeAutoSendPdj } from './autoSendPdj.ts'`.
- Supprimer le bloc `4c. ENVOI AUTOMATIQUE du PDJ` (le `const touchedPdj = …` + le
  `if (touchedPdj) { … maybeAutoSendPdj … }`).
- NE PAS toucher : l'import In-House (la branche `type === 'inhouse'` →
  `importInhouse`), ni l'envoi auto RepJour, ni la garde horaire.

### 2. Supprimer les fichiers d'envoi/rendu PDJ (Edge)

- `autoSendPdj.ts` (envoi auto PDJ).
- `_shared/pdj/render.ts` (sujet + HTML e-mail PDJ).
- `_shared/pdj/pdf.ts` (PDF PDJ pour pièce jointe).

Vérifier qu'après suppression, `_shared/pdj/rooms.ts` (KNOWN_ROOMS, stayKind) n'est
plus importé QUE par du code supprimé : s'il n'est plus utilisé nulle part, le
supprimer aussi ; sinon le garder.

## Ordre d'exécution

1. Éditer `index.ts` (retirer import + bloc PDJ).
2. Supprimer les 3 fichiers.
3. Vérifier les imports orphelins (`rooms.ts`).

## Critère de validation

- `deno check --node-modules-dir=auto supabase/functions/import-report/index.ts` OK.
- Aucune référence résiduelle à `autoSendPdj` / `_shared/pdj/render` / `_shared/pdj/pdf`.
- L'import In-House et l'envoi auto RepJour intacts (relecture).
