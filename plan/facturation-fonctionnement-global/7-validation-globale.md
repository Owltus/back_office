# Étape 7 — Validation globale

## Objectif

Vérifier la cohérence de bout en bout du nouveau fonctionnement : types, tests, build, et le
comportement métier attendu (émetteur prudent, nuages propres, revue semi-autonome), sans
régression sur la détection existante ni la galaxie.

## Contexte

Dernière étape (validation post-chantier). Le chantier touche la détection, le vocabulaire,
la galaxie, la DB (denylist, exécutée par l'utilisateur) et l'UI — un contrôle global est
nécessaire.

## Fichier(s) impacté(s)

- Aucun nouveau. Validation transverse des étapes 1 à 6.

## Travail à réaliser

### 1. Contrôles automatiques

```bash
npx tsc --noEmit
npx vitest run src/lib/facturation
pnpm build
npx prettier --write <fichiers modifiés>
```

### 2. Scénario métier

- Émetteur < 5 confirmations → aucun effet fort (mots seuls).
- Émetteur concentré + mots muets → propose son code marqué « à vérifier ».
- Mots votant B fortement chez un émetteur habituel de A → B gagne (mots priment).
- Un token boilerplate (siret, iban…) ne participe plus au scoring ; un token présent dans
  ≥ 60 % des codes (base ≥ 8 codes) est ignoré (max_df).
- Nom d'émetteur absent des nuages ; galaxie toujours peuplée (émetteur depuis `IssuerCodes`).
- File de revue : un outlier `{A:12, Z:1}` remonte ; le bannir l'exclut ensuite.

### 3. Non-régression

- Détection sans émetteur / base immature : comportement identique à l'existant.
- Dégradation gracieuse si denylist non déployée.
- Galaxie et affichage des probabilités cohérents.

## Ordre d'exécution

1. Contrôles automatiques.
2. Scénario métier (idéalement base réelle peuplée).
3. Non-régression galaxie / détection / affichage.

## Critère de validation

- `npx tsc --noEmit`, `npx vitest run`, `pnpm build` verts.
- Scénario métier conforme (émetteur prudent, nuages propres, revue fonctionnelle).
- Aucune régression détection / galaxie / affichage.

## Contrôle /borg

- **Sécurité** : aucune écriture DB directe ni DDL exécuté par l'assistant ; toutes les
  écritures passent par les RPC `SECURITY DEFINER` à garde de rôle.
- **Déterminisme / tests** : aucun test de scoring existant cassé ; max_df inerte sur les
  fixtures (garde N≥8) ; nouveaux tests déterministes.
- **Séparation métier/vue** : `anomalies.ts`, `issuerDenylist.ts`, `issuerCodes.ts`,
  `wordpool.ts` restent purs (aucun React/DOM/Supabase).
- **Cohérence des données** : clé émetteur alignée entre `issuers`, `issuer_codes`,
  `denylist` ; rename/merge/delete propagent partout (pas d'orphelins).
