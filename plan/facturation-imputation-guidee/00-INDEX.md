# Plan — Facturation : imputation lisible et guidage directionnel

## Contexte

Aujourd'hui, imputer une facture demande de connaître des CODES (analytique + compte
comptable) qui ne veulent rien dire pour un non-comptable. L'objectif produit est l'inverse :
qu'un collègue **sans maîtrise comptable** impute juste, guidé au maximum. Deux besoins :

1. **Lisibilité** : personne ne doit lire un code. L'entrée se fait par le SENS (famille →
   poste → cas concret), et chaque compte porte un **nom humain** (dictionnaire des comptes),
   pas un numéro. Le numéro reste, mais en second plan, pour le comptable.
2. **Guidage directionnel (« vivant »)** : dès l'import, l'app oriente vers les familles
   PLAUSIBLES pour cet émetteur et écarte (sans jamais interdire) les familles IMPROBABLES —
   un prestataire technique n'atterrit pas sur « alcool ». Principe : « je ne sais pas
   exactement où je vais, mais au moins je prends la bonne direction ; jamais une mauvaise ».

Honnêteté technique assumée : ce n'est **pas de l'IA**. Le guidage est **déterministe** —
fréquences apprises par émetteur (`issuerPrior`) repliées sur les familles du référentiel
(`budgetCategory`), plus des règles simples. Il s'auto-construit à l'usage. Corollaire :
quand l'émetteur est inconnu, on n'invente **aucune** direction (vue neutre) — « je ne sais
pas encore » vaut mieux qu'un faux pas.

Ce chantier PROLONGE la fiabilisation du compte (plan `facturation-compte-fiabilisation`,
déjà réalisé) : le garde-fou et le format unique restent, mais l'affichage écran passe des
numéros aux **noms humains**. Le modèle reste **plusieurs-à-plusieurs** (un code a plusieurs
comptes, un compte est partagé par plusieurs codes) : on ne force aucune fausse hiérarchie
code↔compte ; l'arbre de navigation est un arbre de SENS (section → poste → cas), le seul
honnête dans les données.

Contraintes projet : Supabase PRODUCTION (SQL joué par l'utilisateur, destructif = jeton de
confirmation) ; SQL requis joué AVANT le push ; `security_invoker`/RLS par page ; named
exports, alias `#/` avec extension, simple quotes, pas de point-virgule ; commit/push sur
demande seulement.

---

## Angles à clarifier (tranchés le 2026-08-15)

- **AA1 — Écarter une famille → DOUX.** Une famille improbable est grisée + libellée « rare
  pour cet émetteur » et reléguée, mais JAMAIS masquée ni interdite (porte de sortie toujours
  ouverte).
- **AA2 — Seuil de maturité au niveau FAMILLE → ~3 factures.** On oriente dès ~3 factures
  d'un émetteur (plus bas que le seuil CODE de 5), en restant « départage » jamais bloquant.
- **AA3 — Noms de comptes → AMORÇAGE IMMÉDIAT.** Noms pré-remplis au mieux (descriptions +
  intitulés du plan comptable), affinés ensuite par le comptable via l'éditeur.
- **AA4 — Niveau « poste » → REGROUPER PAR LIBELLÉ.** Les codes de même libellé (ex. « Frais
  de Comptabilité et Audit, RH » = `FACOMPTooo` + `FAFRAISRHo`) forment un seul poste ; le
  code reste l'unité technique dessous.
- **AA5 — Casse hétérogène des sections** (« Frais de Perso » vs MAJUSCULES) → normaliser à
  l'AFFICHAGE, sans réécrire la donnée. Mineur.
- **AA6 — Type d'émetteur → APPRIS.** Guidage 100 % appris de l'historique (aucune saisie ;
  le prior famille encode le « type »). Le type explicite reste en réserve pour une V2 du
  démarrage à froid, hors de ce chantier.

Aucune divergence inter-agents : les deux reconnaissances (cerveau/détection et
référentiel/navigation) couvraient des zones disjointes et concordent.

---

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-dictionnaire-comptes-sql.md](./1-dictionnaire-comptes-sql.md) | Table `facturation_ref_comptes` (compte → nom humain) + RLS + RPC + seed d'amorçage | — | P0 | 3h | dictionnaire en base, éditable | ⚠ |
| 2 | [2-modele-compte-lisible.md](./2-modele-compte-lisible.md) | Métier : `compteLabel`, chargement, format écran par nom humain | 1 | P0 | 2h30 | le compte a un nom partout | |
| 3 | [3-moteur-guidage.md](./3-moteur-guidage.md) | Moteur pur : prior par famille + maturité famille + niveaux plausible/neutre/improbable + démarrage à froid | — | P0 | 3h | guidage déterministe testé | |
| 4 | [4-guidage-a-import.md](./4-guidage-a-import.md) | Branchement à l'import : `IssuerHint` famille, résumé directionnel, alerte « inhabituel » | 2, 3 | P0 | 2h30 | orientation dès le dépôt | |
| 5 | [5-picker-guide.md](./5-picker-guide.md) | Picker : recherche + arbre section → poste → cas, familles orientées/grisées, comptes en noms humains | 2, 3, 4 | P0 | 4h | sélection guidée par le sens | |
| 6 | [6-editeur-dictionnaire.md](./6-editeur-dictionnaire.md) | Éditeur du dictionnaire (comptable nomme/affine) + import du libellé | 1, 2 | P1 | 2h | référentiel des noms maintenable | |
| 7 | [7-surfaces-et-validation.md](./7-surfaces-et-validation.md) | Surfaces techniques (tampon/historique) + validation globale + revue adverse | 1-6 | P0 | 2h | chantier vérifié | ⚠ |

---

## Ordre d'exécution

- **À acter avant l'étape 3** : AA1 (doux/dur), AA2 (seuil famille), AA6 (appris/explicite).
- **Sprint 1 (parallélisable)** : étape 1 (dictionnaire SQL) et étape 3 (moteur pur) sont
  indépendantes — l'une touche la base, l'autre la mémoire émetteur déjà existante.
- **Sprint 2** : étape 2 (modèle lisible, dépend 1).
- **Sprint 3** : étape 4 (guidage à l'import, dépend 2 et 3), puis étape 6 (éditeur, dépend 1-2).
- **Sprint 4** : étape 5 (picker guidé, dépend 2-3-4), puis étape 7 (validation).
- Premier livrable de valeur : à l'issue de l'étape 4, dès l'import l'app affiche déjà « plutôt
  telle famille, rarement telle autre » pour un émetteur connu.

---

## Architecture cible

```
supabase/
├── facturation_ref_comptes.sql        [nouveau]  table compte→libellé + RLS + index
├── facturation_ref_comptes_rpc.sql    [nouveau]  upsert/delete/reimport
└── facturation_ref_comptes_seed.sql   [nouveau]  amorçage des ~50 comptes distincts

src/lib/facturation/
├── types.ts                 [modifié]  CompteLine (compte, libelle)
├── cloudService.ts          [modifié]  fetchComptes + RPC dictionnaire
├── budgetRegistry.ts        [modifié]  index COMPTE_LABEL + compteLabel()
├── imputationFormat.ts      [modifié]  rendu écran par NOM humain (numéro en repli)
├── issuerFamilies.ts        [nouveau]  prior/maturité/niveaux par FAMILLE (pur)
├── detect.ts                [modifié]  IssuerHint.familyPrior exposé dans Detection
├── notices.ts               [modifié]  alerte « inhabituel pour cet émetteur »
└── facturation.test.ts      [modifié]  tests moteur + format + dictionnaire

src/components/facturation/
├── useFacturationModel.ts   [modifié]  query ['facturation','comptes'] + setCompteLabels
├── FacturationBoard.tsx     [modifié]  issuerHintFor calcule le prior famille
├── InvoicePanel.tsx         [modifié]  résumé directionnel + noms humains + alerte
├── CodePicker.tsx           [modifié]  recherche + arbre section→poste→cas + orientation
├── BudgetLinesManager.tsx   [modifié]  onglet/éditeur du dictionnaire des comptes
└── ReferentielImport.tsx    [modifié]  import du libellé de compte (optionnel)
```

Hors périmètre (différé) : refonte de la galaxie en couple, retrait complet du wordpool,
type d'émetteur explicite (AA6 réserve V2), nettoyage table legacy `facturation_budget_lines`.

---

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB (SQL) | — | `facturation_ref_comptes`, `_rpc`, `_seed` |
| Métier (lib) | `types`, `cloudService`, `budgetRegistry`, `imputationFormat`, `detect`, `notices`, `facturation.test` | `issuerFamilies` |
| Composants (UI) | `useFacturationModel`, `FacturationBoard`, `InvoicePanel`, `CodePicker`, `BudgetLinesManager`, `ReferentielImport` | — |

| **Total** | **~13 modifiés** | **4 nouveaux** |
