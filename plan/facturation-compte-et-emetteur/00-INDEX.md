# Plan — Facturation : couple code + compte et apprentissage par émetteur seul

## Contexte

La page `/facturation` n'est PAS un prototype à codes inventés : elle embarque déjà un référentiel de codes en base (`facturation_budget_lines`), un apprentissage par émetteur (`facturation_issuer_codes`), la reconnaissance d'émetteur, l'imputation multiple, une denylist, le tampon PDF (`src/lib/facturation/stamp.ts`) et des écrans de curation. Le chantier est donc une ÉVOLUTION, pas une réécriture.

Trois manques par rapport à la cible validée avec le métier :

1. Le système ne connaît que le **code analytique**, jamais le **compte** comptable. La cible impute par COUPLE `(code_analytique, compte)`, en relation plusieurs-à-plusieurs (un code a plusieurs comptes, un compte sous plusieurs codes).
2. Un moteur de **matching par les mots du contenu** (`wordpool.ts` + couche 2 de `detect.ts` + `SEED_RULES`) tourne encore. Le métier le rejette (piège « gaz » de la climatisation imputé au gaz de ville). L'imputation ne doit venir QUE de l'apprentissage par émetteur.
3. Les codes sont des placeholders inventés (`FACOMPTooo`…). Le vrai référentiel comptable doit être importé (JSON) et **réimportable** sans redéploiement.

Décisions cadrées avec l'utilisateur : reconnaissance émetteur fiabilisée par **SIRET/SIREN** ; **historique** des imputations conservé en base (sans stocker le PDF) ; garde d'accès **inchangée** (permission de page existante). Contraintes projet : Supabase PRODUCTION (SQL exécuté par l'utilisateur, destructif = jeton de confirmation) ; named exports, alias `#/` avec extension, simple quotes, pas de point-virgule.

---

## Angles à clarifier

- **D1 — Forme du référentiel (tranché, technique, à confirmer)** : table **plate** `facturation_ref_imputations` PK `(code_analytique, compte)` répétant `section`/`libelle`/`description`, plutôt que 3 tables normalisées. Justif : ~90 lignes, réimport JSON ligne à ligne trivial, cohérent avec les PK composites existantes.
- **D2 — Mémoire émetteur (tranché, technique, à confirmer)** : **vue d'agrégation** calculée depuis l'historique des imputations, plutôt qu'une table de compteurs à maintenir (évite les RPC learn/unlearn symétriques).
- **D3 — Sort de `facturation_budget_lines`** : remplacé par la table couple. Bascule d'un coup, ou lecture conservée le temps de la migration ? À trancher au démarrage.
- **D4 — Clé émetteur SIREN vs SIRET** : un SIRET = un établissement, un SIREN = l'entreprise. Regrouper par **SIREN** (recommandé) pour réunir les factures d'un même fournisseur multi-sites.
- **D5 — Retrait du wordpool** : suppression transverse (module, table, RPC, niveau « mots » de la galaxie, tests). Confirmer qu'on assume la perte du niveau « mots » de la galaxie (le niveau émetteur→code est, lui, conservé).
- **D6 — Données d'apprentissage existantes** : les compteurs émetteur→code actuels pointent sur des codes inventés. À vider (repartir propre) plutôt qu'à migrer.

---

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-referentiel-couple-sql.md](./1-referentiel-couple-sql.md) | Table `facturation_ref_imputations` (couple) + RLS + RPC réimport + seed JSON | — | P0 | 3h | référentiel couple en base, réimportable | ⚠ |
| 2 | [2-metier-referentiel.md](./2-metier-referentiel.md) | Types + `budgetRegistry` + `cloudService` au couple ; retrait des `SEED_RULES` | 1 | P0 | 2h30 | métier lit le couple depuis Supabase | |
| 3 | [3-retrait-wordpool.md](./3-retrait-wordpool.md) | Suppression du matching par mots (module, detect couche 2, table+RPC, galaxie mots, tests) | — | P0 | 2h30 | imputation = émetteur SEUL | ⚠ |
| 4 | [4-apprentissage-emetteur-couple.md](./4-apprentissage-emetteur-couple.md) | `issuerCodes`/denylist au couple + table `facturation_issuer_codes` étendue | 1, 3 | P0 | 2h30 | apprentissage émetteur → couple | ⚠ |
| 5 | [5-extraction-siret.md](./5-extraction-siret.md) | Extraction SIRET/SIREN + clé émetteur fiabilisée | 4 | P1 | 2h | émetteur reconnu par SIREN | |
| 6 | [6-historique-imputations-sql.md](./6-historique-imputations-sql.md) | Tables `facturation_invoices` + `_invoice_lines` + vue mémoire + RPC | 1, 4 | P1 | 2h30 | historique consultable, mémoire dérivée | ⚠ |
| 7 | [7-ui-couple-candidats-reimport.md](./7-ui-couple-candidats-reimport.md) | UI : couple dans CodePicker/tampon, candidats par émetteur, réimport, historique | 2, 4, 5, 6 | P0 | 4h | parcours complet à l'écran | ⚠ |
| 8 | [8-validation-globale.md](./8-validation-globale.md) | tsc + build + tests + recette bout en bout | 1-7 | P0 | 1h30 | chantier vérifié | ⚠ |

---

## Ordre d'exécution

- **À acter avant l'étape 1** : D1 (forme du référentiel), D3 (sort de `facturation_budget_lines`), D4 (SIREN vs SIRET), D5 (perte galaxie « mots »), D6 (vidage des compteurs actuels).
- **Sprint 1 (parallélisable)** : étape 1 (référentiel SQL) et étape 3 (retrait wordpool) sont indépendantes.
- **Sprint 2** : étape 2 (métier référentiel, dépend 1), puis étape 4 (apprentissage couple, dépend 1 et 3).
- **Sprint 3** : étapes 5 (SIRET) et 6 (historique) après l'étape 4.
- **Sprint 4** : étape 7 (UI) une fois le métier prêt, puis étape 8 (validation globale).
- Premier livrable de valeur : à l'issue de l'étape 4, l'imputation se fait au couple, par émetteur seul (fini le piège des mots).

---

## Architecture cible

```
src/lib/facturation/
├── types.ts                  [modifié]  Imputation = {codeAnalytique, compte}
├── constants.ts              [modifié]  retrait SEED_RULES ; garde TAGS/seuils
├── budgetRegistry.ts         [modifié]  registre au couple
├── cloudService.ts           [modifié]  référentiel couple + réimport + historique ; retrait wordpool
├── detect.ts                 [modifié]  émetteur seul (couche mots retirée)
├── issuerCodes.ts            [modifié]  perIssuer → couple
├── issuerDenylist.ts         [modifié]  denylist au couple
├── issuers.ts / text.ts      [modifié]  clé émetteur SIREN + repli nom
├── siret.ts                  [nouveau]  extraction SIRET/SIREN
├── history.ts                [nouveau]  modèle historique imputations
├── stampLayout.ts / stamp.ts [modifié]  ligne = code + compte
├── wordpool.ts               [supprimé]
├── anomalies.ts / galaxy.ts  [modifié]  retrait niveau « mots »
└── extract.ts / hash.ts / grid.ts / similarity.ts   [inchangés]

src/components/facturation/
├── CodePicker.tsx            [modifié]  sélection couple + compte affiché
├── InvoicePanel.tsx          [modifié]  candidats par émetteur en tête
├── ImputationList.tsx        [modifié]  couple
├── ReferentielImport.tsx     [nouveau]  réimport fichier
├── HistoriqueDialog.tsx      [nouveau]  consultation historique
└── FacturationRevue.tsx / BudgetLinesManager.tsx / galaxie   [modifié]

supabase/
├── facturation_ref_imputations.sql       [nouveau]  table + RLS + seed
├── facturation_ref_imputations_rpc.sql   [nouveau]  réimport bulk
├── facturation_issuer_codes_compte.sql   [nouveau]  extension compte
├── facturation_invoices.sql              [nouveau]  historique + vue mémoire
└── facturation_wordpool_drop.sql         [nouveau]  retrait ciblé
```

---

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB (SQL) | (retrait wordpool) | `facturation_ref_imputations`, `_ref_imputations_rpc`, `_issuer_codes_compte`, `_invoices`, `_wordpool_drop` |
| Métier (lib) | `types`, `constants`, `budgetRegistry`, `cloudService`, `detect`, `issuerCodes`, `issuerDenylist`, `issuers`, `text`, `stampLayout`, `stamp`, `anomalies`, `galaxy` | `siret`, `history` |
| Composants (UI) | `CodePicker`, `InvoicePanel`, `ImputationList`, `FacturationRevue`, `BudgetLinesManager`, galaxie | `ReferentielImport`, `HistoriqueDialog` |
| Tests | `facturation.test.ts` | — |

| **Total** | **~24 modifiés** | **~9 nouveaux** |
