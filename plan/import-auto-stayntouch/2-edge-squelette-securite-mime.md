# Étape 2 — Edge Function : squelette, sécurité, extraction du CSV, détection du type

## Objectif

Poser la fonction `import-report` : elle reçoit l'e-mail brut relayé par le Worker,
vérifie le secret partagé, extrait la (les) pièce(s) jointe(s) CSV du MIME, et
**détecte quel rapport** c'est (Comparison / Forecast / In-House). Aucune écriture
métier encore.

## Qui

**MOI** (code). Déploiement à l'Étape 6.

## Fichier(s)

- `supabase/functions/import-report/index.ts` (nouveau) — calqué sur la structure
  Deno de `supabase/functions/send-report/index.ts`.

## Travail à réaliser

1. **Sécurité** : rejeter (401) toute requête sans `X-Import-Secret` valide (secret
   comparé à `Deno.env.get('IMPORT_SECRET')`).
2. **Extraction MIME** : parser le corps `message/rfc822` reçu et en sortir les
   pièces jointes `text/csv` (nom + contenu). Utiliser `postal-mime` (compatible
   Deno via `npm:`/`esm.sh`). Gérer **1..N** pièces jointes.
3. **Détection du type** (extensible) : une table de règles `{type, matchNom,
   matchContenu}` reproduisant `detectFileType` (RepJour) + la signature In-House
   (colonnes `Room,Status,Guest Name,…`). Un CSV non reconnu → 422 + log (pas
   d'écriture).
4. **Dispatch** : router chaque CSV reconnu vers son importeur (Étapes 3/4), encore
   en stub ici (log « reconnu: comparison » etc.).
5. Réponse : 200 avec un résumé `{type, rows, ok}` par pièce jointe ; erreurs
   génériques au client, détail en `console.error` (même modèle que send-report).

## Critère de validation

- `npx tsc`/déploiement OK ; un appel de test (email brut collé) renvoie le bon
  `type` détecté pour chacun des 3 exports réels.
- Secret manquant/faux → 401. CSV inconnu → 422.
