# Étape 4 — Validation globale

## Objectif

Vérifier l'ensemble sans régression ; le plein effet exige l'exécution du SQL par
l'utilisateur.

## Fichier(s) impacté(s)

- Aucun (vérification ; correctifs ponctuels si besoin).

## Travail à réaliser

```bash
npx tsc --noEmit
npx vitest run
pnpm build
npx prettier --write "src/lib/facturation/*.ts" "src/components/facturation/*.tsx"
```

Vérification navigateur (après SQL exécuté par l'utilisateur) :
- Déposer une facture d'un émetteur, taper son nom, tamponner → un
  `facturation_issuer_learn` part.
- Redéposer une facture du même émetteur (même en-tête) → champ Émetteur
  **pré-rempli** automatiquement.
- Émetteur inconnu → champ vide.

Dégradation gracieuse : sans la table, aucun pré-remplissage, aucune erreur.

## Critère de validation

- tsc + vitest + build verts.
- Reconnaissance + apprentissage émetteur fonctionnels (après SQL).
- Aucune régression : nuages de mots, détection, tampon, modal tags.

## Contrôle /borg

Dernière étape → audit :
- L'apprentissage émetteur passe UNIQUEMENT par la RPC (aucun INSERT client).
- Garde `record.learned` : pas de double apprentissage.
- Priorité de pré-remplissage respectée (appris > seed > vide) ; aucun émetteur
  inventé quand inconnu.
