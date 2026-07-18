# Étape 6 — Validation globale

## Objectif

Vérifier que le chantier tient d'un bout à l'autre : types, tests, build, et le scénario
métier « part de zéro → s'éduque → reconnaît par émetteur ». S'assurer qu'aucune régression
n'est introduite (galaxie, affichage des probabilités, re-détection en séance).

## Contexte

Dernière étape (validation post-chantier). Le chantier touche la couche de détection, la DB
(nouvelle table + RPC exécutées par l'utilisateur), l'UI et la galaxie — un contrôle global
est nécessaire avant de considérer le lot terminé.

## Fichier(s) impacté(s)

- Aucun nouveau. Validation transverse de tous les fichiers des étapes 1 à 5.

## Travail à réaliser

### 1. Contrôles automatiques

```bash
npx tsc --noEmit
npx vitest run src/lib/facturation
pnpm build
npx prettier --write <fichiers modifiés>
```

### 2. Scénario métier « éducation depuis zéro »

- Base vide : un dépôt s'abstient (pas de règle-libellé, pas de prior) → conforme.
- Tamponner 3 factures d'un même émetteur vers le même code → l'émetteur devient
  « concentré » → un 4e dépôt du même émetteur propose ce code avec source « émetteur ».
- Tamponner un émetteur multi-codes → prior en départage, pas d'exclusion (anti-collapse).
- Cas « gaz frigorigène clim » : le mot « gaz » ne force plus *Gaz conso* (règle retirée) ;
  seule l'éducation (émetteur + mots du corps) tranche.

### 3. Non-régression

- Émetteur inconnu / prior undefined → détection identique à l'existant.
- Galaxie : nœuds/liens émetteur toujours présents (depuis `issuerCodes`).
- Affichage des probabilités et bannière `immature` cohérents.

## Ordre d'exécution

1. Lancer les contrôles automatiques.
2. Dérouler le scénario métier (idéalement avec l'utilisateur, la vraie base OKKO).
3. Vérifier la non-régression galaxie/affichage.

## Critère de validation

- `npx tsc --noEmit`, `npx vitest run`, `pnpm build` verts.
- Scénario « éducation depuis zéro » conforme (abstention à froid, filtre émetteur après
  éducation, anti-collapse sur multi-codes).
- Aucune régression galaxie / affichage / re-détection.

## Contrôle /borg

- **Sécurité** : aucune écriture directe en base ; toutes les écritures passent par les RPC
  `SECURITY DEFINER` avec garde de rôle (issuer_codes_learn/unlearn/forget). SQL exécuté par
  l'utilisateur.
- **Déterminisme / tests** : les tests de scoring existants non liés à l'émetteur restent
  verts ; les tests adaptés (émetteur) sont déterministes.
- **Cohérence des données** : la clé `issuer` reste alignée entre `facturation_issuers` et
  `facturation_issuer_codes` ; rename/merge/delete propagent bien (pas d'orphelins).
- **Anti-collapse** : vérifier qu'un émetteur multi-codes ne collapse pas sur un seul code.
