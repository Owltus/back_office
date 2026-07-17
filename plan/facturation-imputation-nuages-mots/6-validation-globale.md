# Étape 6 — Validation globale

## Objectif

Vérifier l'ensemble sans régression, en tenant compte du fait que le plein effet
(corpus partagé) nécessite l'exécution du SQL par l'utilisateur.

## Contexte

Étape de clôture. Le module `wordpool` et l'intégration sont testables même sans la
table (graine côté client). La partie Supabase (lecture/apprentissage réel) exige
que l'utilisateur ait exécuté `supabase/facturation_wordpool.sql`.

## Fichier(s) impacté(s)

- Aucun (vérification ; correctifs ponctuels si un critère échoue).

## Travail à réaliser

### 1. Vérifications automatiques

```bash
npx tsc --noEmit
npx vitest run
pnpm build
```

Attendu : tsc propre, tests verts (dont wordpool + détection recalibrée), build +
prerender OK.

### 2. Vérification navigateur — dégradation gracieuse (table absente)

Avant même le SQL : charger une facture → le scoring tourne sur la **graine** (pas
d'erreur bloquante), la card affiche une proba/abstention cohérente. Un échec de
`fetchClouds` (table inexistante) ne casse pas l'UI.

### 3. Vérification navigateur — cycle complet (après SQL exécuté par l'utilisateur)

- Charger une facture d'un nouveau fournisseur → imputer manuellement → tamponner →
  vérifier un appel RPC `facturation_wordpool_learn` (onglet réseau).
- Recharger une facture au vocabulaire proche → le(s) bon(s) code(s) remontent avec
  une proba plus haute et des mots votants affichés.
- Cas ambigu / peu de mots → abstention (« à choisir manuellement »).

Note harness : injection de PDF synthétiques peut router vers l'OCR (Tesseract, CDN)
et bloquer la lecture — préférer un vrai PDF natif, ou piloter via le store.

### 4. Prettier

```bash
npx prettier --write "src/lib/facturation/*.ts" "src/components/facturation/*.tsx"
```

## Critère de validation

- tsc + vitest + build verts.
- Dégradation gracieuse prouvée (fonctionne sans la table).
- Cycle apprentissage → amélioration observable (après SQL).
- Aucune régression : détection par règles, modal tags, tampon multi-lignes, émetteur.

## Contrôle /borg

Dernière étape → audit global :
- L'apprentissage n'écrit QUE via la RPC (jamais d'INSERT client direct), et une
  seule fois par facture (garde `learned`).
- Une règle apprise / vérité terrain n'est jamais diluée par un vote statistique.
- Aucune persistance localStorage résiduelle pour l'apprentissage (D5).
- La lecture du modèle est cachée (une fois/session), l'écriture par delta (pas de
  transfert du modèle complet).
- Poids automatiques : un mot ubiquitaire ne pilote jamais une imputation (IDF≈0).
