# Étape 5 — Validation globale

## Objectif

Vérifier que les deux volets tiennent ensemble, sans régression, avant de proposer
un commit.

## Contexte

Étape de clôture. Les volets A (apprentissage émetteur) et B (tags) sont
indépendants mais partagent `types.ts` et `constants.ts` ; on valide l'ensemble.

## Fichier(s) impacté(s)

- Aucun (vérification seule ; correctifs ponctuels si un critère échoue).

## Travail à réaliser

### 1. Vérifications automatiques

```bash
npx tsc --noEmit
npx vitest run
pnpm build
```

Attendu : tsc propre, tous les tests verts (dont les nouveaux tests
d'apprentissage multi-codes), build + prerender OK.

### 2. Vérification navigateur (feature `/facturation`, admin)

Volet A :
- Charger une facture d'un émetteur inconnu → saisir son nom, choisir plusieurs
  imputations, « Mémoriser ».
- Charger une seconde facture contenant ce nom → imputations pré-sélectionnées
  automatiquement, card « appris ».
- Nom < 4 caractères → bouton « Mémoriser » désactivé.

Volet B :
- Ouvrir le modal : tags visibles et colorés sur chaque ligne.
- Cliquer un tag (ex. « Technique ») → seules les lignes du domaine restent ;
  recliquer réaffiche tout.
- Tag + recherche texte se combinent (ET).

Note harness : l'injection de PDF synthétiques peut router vers l'OCR (Tesseract,
CDN) et bloquer la lecture — ce n'est pas un bug applicatif. Privilégier un vrai PDF
natif, ou piloter l'état via le store si besoin.

### 3. Prettier / cohérence

```bash
npx prettier --write "src/lib/facturation/*.ts" "src/components/facturation/*.tsx"
```

## Critère de validation

- `tsc` + `vitest` + `build` verts.
- Les deux volets fonctionnent en navigateur (critères ci-dessus).
- Aucune régression sur le modal existant (recherche, sélection multiple, tampon
  multi-lignes), la détection, ni le tampon.

## Contrôle /borg

Dernière étape du chantier → audit global léger :
- Cohérence `types.ts` ↔ usages (`BudgetLine.tags` non optionnel bien peuplé sur les
  55 lignes ; `InvoiceRecord.supplierName` présent partout où un record est créé).
- Pas de règle apprise à mot-clé trop court capable de polluer la détection
  (garde-fou `MIN_LEARN_LEN` effectif).
- Pas de classe Tailwind dynamique dans `TAG_COLORS` (toutes littérales) — sinon
  purge et tags incolores en prod.
- `rememberRule` remplace bien l'intégralité du set d'un émetteur (pas de fusion qui
  ferait réapparaître des codes retirés).
