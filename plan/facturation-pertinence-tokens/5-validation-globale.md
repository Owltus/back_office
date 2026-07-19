# Étape 5 — Validation globale

## Objectif

Vérifier la cohérence de bout en bout de l'amélioration de pertinence : types, tests, build, et le
comportement attendu (générique filtré, parasites du contexte masqués, mots produit préservés), sans
régression sur la détection, la symétrie learn/unlearn ni la galaxie.

## Contexte

Dernière étape. Le chantier touche la tokenisation, le scoring, le câblage board et l'affichage — un
contrôle global s'impose. Point sensible : le filtre adaptatif ne doit JAMAIS toucher `countTokens`
(deltas d'apprentissage = source de la df ET symétrie des compteurs partagés).

## Fichier(s) impacté(s)

- Aucun nouveau. Validation transverse des étapes 1 à 4.

## Travail à réaliser

### 1. Contrôles automatiques

```bash
npx tsc --noEmit
npx vitest run src/lib/facturation
pnpm build
npx prettier --write <fichiers modifiés>
```

### 2. Scénario métier (base réelle, par l'utilisateur)

- Tamponner quelques factures d'un même fournisseur → une fois `DOC_STOP_MIN_DOCS` atteint, le nom
  du fournisseur / du client / l'adresse (ex. `legallais`, `accor`, `strasbourg`) cessent de voter
  et disparaissent du panneau de mots de la galaxie et des comptes de la revue.
- Les mots de NATURE PRODUIT (`outils`, `lame`, `scie`, `foret`, `pile`, `beton`…) restent présents
  et continuent de discriminer l'imputation.
- Le générique (`reglement`, `livraison`, `echeance`, `facturation`…) n'apparaît plus JAMAIS (couche
  1, dès la 1re facture).

### 3. Non-régression

- Détection sans stoplist (base immature / journal vide) : comportement identique à l'existant.
- `countTokens` inchangé → apprentissage et désapprentissage (journal, undo) toujours symétriques.
- Galaxie et comptes cohérents ; aucun mot produit perdu par sur-filtrage.

## Ordre d'exécution

1. Contrôles automatiques.
2. Scénario métier (idéalement base réelle peuplée).
3. Non-régression détection / learn-unlearn / galaxie.

## Critère de validation

- `npx tsc --noEmit`, `npx vitest run`, `pnpm build` verts.
- Scénario conforme (générique filtré, parasites du contexte masqués après quelques factures, mots
  produit préservés).
- Aucune régression détection / symétrie learn-unlearn / galaxie.

## Contrôle /borg

- **Symétrie learn/unlearn** : vérifier que le filtre adaptatif n'est branché QUE sur
  `scoreInvoice`/`detect` et JAMAIS sur `countTokens` (deltas figés au journal intacts ; la df se
  dérive de ces deltas).
- **Rétro-compatibilité de signature** : `detect`/`scoreInvoice`/`redetect` restent appelables sans
  le paramètre `stop` (tous les appels positionnels existants et les tests passent).
- **Dégradation gracieuse** : journal vide / table absente → stoplist vide → scoring et affichage
  identiques à l'existant ; couche 1 seule active.
- **Sur-filtrage** : garde `DOC_STOP_MIN_DOCS` respectée ; aucun mot de nature produit dans
  `INVOICE_STOPWORDS` (audit de la liste contre les fixtures de test) ; biais mono-émetteur assumé
  (D4) et non aggravé.
- **Cohérence UI/scoring** : `visibleWords` (affichage) et l'exclusion `idf==0` (scoring) reposent
  sur la MÊME stoplist → ce qui est montré = ce qui peut voter.
