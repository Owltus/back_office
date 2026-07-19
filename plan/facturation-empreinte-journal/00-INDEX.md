# Plan — Empreinte (hash) par PDF + journal d'apprentissage

## Contexte

Aujourd'hui, l'apprentissage de la facturation (au tamponnage) et son désapprentissage
n'ont AUCUNE trace persistante par document. Deux conséquences, confirmées par l'analyse
facteur-humain : (1) re-déposer le même PDF le fait réapprendre → double comptage qui fabrique
un faux émetteur « fort » ; (2) corriger une erreur d'une facture déjà fermée oblige à re-déposer
le PDF ET à reproduire à la main l'émetteur + les codes fautifs (`handleReplayUnlearn`), au risque
d'éroder l'apprentissage d'un autre code.

Le chantier ajoute une EMPREINTE (hash) par PDF et un JOURNAL D'APPRENTISSAGE persistant :
`hash → { codes, émetteur, deltas de mots, date }`. Version COMPLÈTE (choix utilisateur) :
le journal stocke les `deltas`, ce qui permet de désapprendre EXACTEMENT une facture passée en
rejouant ces deltas en soustraction, **sans re-déposer le PDF**. Le hash sert aussi à détecter
un doublon au dépôt.

- **Contrainte CLAUDE.md (à jour)** : backend Supabase désormais DÉDIÉ à cette app (plus partagé)
  mais PROD LIVE. Écritures via RPC `SECURITY DEFINER` à garde de rôle (`super_utilisateur`/`admin`),
  RLS + policy SELECT seule, aucune policy d'écriture. Le SQL est EXÉCUTÉ PAR L'UTILISATEUR
  (fichiers `supabase/*.sql`). Dégradation gracieuse si la table n'existe pas.
- **Invariant à respecter** : la symétrie learn/unlearn repose sur un INSTANTANÉ figé au tampon
  (`learnedCodes`/`learnedIssuer`). Le journal stocke ce même instantané + les `deltas`, jamais
  l'état courant. Clé émetteur = `issuerKey` (canonique), jamais le libellé brut.

---

## Angles à clarifier

- **D1 — Quoi hasher ? (DIVERGENCE d'agents). Concerne les étapes 1 et 4.**
  L'agent *métier* recommande deux stratégies selon la source : PDF **natif → hash du TEXTE**
  extrait (identité sémantique, résiste à un ré-export), scan **OCR → hash des OCTETS** (le texte
  OCR n'étant pas reproductible d'un scan à l'autre). L'agent *DB* suppose un hash du texte partout.
  - **Option A retenue (recommandée)** : HYBRIDE — `native` → `hashText(normalize(text))`,
    `ocr` → `hashBytes(file)`. On stocke `method` dans le journal pour tracer la fiabilité.
  - **Option B (écartée)** : tout-octets. Plus simple, mais un même PDF ré-exporté / re-généré
    donne un hash différent → le doublon « même facture, fichier régénéré » n'est plus détecté.

- **D2 — Confidentialité / volumétrie (rodin — coût du « complet »). Concerne les étapes 2 et 3.**
  Les tables actuelles ne stockent que des agrégats « rien de reconstructible ». Le journal, lui,
  stocke UN SAC DE MOTS par facture (`deltas`) → plus proche du contenu, et la table croît
  linéairement avec le NOMBRE de factures (non plafonnée par `prune`).
  - **Assumé (choix utilisateur : version complète)** : on accepte ce compromis pour obtenir le
    désapprentissage sans PDF. Garde-fous : tokens déjà filtrés par `tokenize` (sans chiffre, ni
    date, ni stop-word, ni nom d'émetteur), en-tête du fichier SQL qui l'assume explicitement,
    surveillance de la croissance. (Repli possible plus tard : ne stocker que `codes`+`issuer` et
    exiger le re-dépôt du PDF — « version légère ».)

- **D3 — Sort du « Corriger une facture rejouée » existant. Concerne l'étape 6.**
  Le journal rend `handleReplayUnlearn` inutile pour les factures journalisées, mais pas pour les
  anciennes (apprises AVANT le journal, sans entrée).
  - **Option A retenue (recommandée)** : le GARDER comme repli, mais ne l'afficher que si la
    facture courante n'a PAS d'entrée journal (`record.hash` absent du journal). Sinon, proposer
    directement le désapprentissage exact.

- **D4 — Anti-double-comptage au re-tampon. Concerne l'étape 5.**
  Si un doublon (hash déjà au journal) est re-tamponné, faut-il RE-apprendre ?
  - **Option A retenue (recommandée)** : NON. Le tampon + téléchargement se font (l'utilisateur
    veut son PDF), mais l'apprentissage est SAUTÉ (pas de ré-incrément des nuages). Un bandeau
    l'explique. C'est le vrai correctif du double comptage.

---

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-hash-type-journal.md](./1-hash-type-journal.md) | Module hash pur + type `JournalEntry` | — | P0 | 1h30 | `hash.ts` (`sha256Hex`/`hashText`/`hashBytes`/`hashDocument`) + type journal + tests |  |
| 2 | [2-table-rpc-journal.md](./2-table-rpc-journal.md) | Table + RPC journal (DB) | 1 | P0 | 2h | `facturation_learned_docs.sql` (table + `_record` + `_forget`) + ajout au reset | ⚠ |
| 3 | [3-services-journal.md](./3-services-journal.md) | Services : lecture + wrappers RPC | 2 | P0 | 1h | `cloudService.ts` : `fetchJournal`/`recordLearnedDoc`/`forgetLearnedDoc` |  |
| 4 | [4-cache-hash-doublon.md](./4-cache-hash-doublon.md) | Cache journal + hash au dépôt + doublon | 1, 3 | P1 | 2h | 5e `useQuery`, `InvoiceRecord.hash/duplicate`, détection doublon (bandeau) |  |
| 5 | [5-enregistrement-tampon-undo.md](./5-enregistrement-tampon-undo.md) | Enregistrement au tampon + undo + garde | 3, 4 | P1 | 1h30 | journal écrit au tampon, effacé à l'undo, réapprentissage sauté sur doublon |  |
| 6 | [6-ui-factures-apprises.md](./6-ui-factures-apprises.md) | Section « Factures apprises » + désapprendre par hash | 3, 5 | P1 | 2h30 | section modal + `unlearnDocByHash` + repli replay conditionnel |  |
| 7 | [7-validation-globale.md](./7-validation-globale.md) | Validation globale | 1-6 | P0 | 1h | tsc/vitest/build verts, scénario, audit /borg | ⚠ |

## Ordre d'exécution

Séquentiel avec deux amorces parallélisables :

- **Sprint A** : 1‖2 (le module pur et la DB sont indépendants ; 2 n'a besoin que du CONTRAT de type, pas du code de 1).
- **Sprint B** : 3, puis 4‖5 partiellement (5 dépend de 4 pour le flag doublon), puis 6.
- **Clôture** : 7.

## Architecture cible

```
src/lib/facturation/
  hash.ts                    (NOUVEAU, pur) sha256Hex, hashText, hashBytes, hashDocument
  types.ts                   (MODIF) + JournalEntry ; InvoiceRecord += hash?, duplicate?
  cloudService.ts            (MODIF) + fetchJournal / recordLearnedDoc / forgetLearnedDoc
  facturation.test.ts        (MODIF) + tests hash + patchs journal purs
src/components/facturation/
  useFacturationModel.ts     (MODIF) + 5e query ['facturation','journal']
  useFacturationCuration.ts  (MODIF) + unlearnDocByHash
  FacturationBoard.tsx       (MODIF) hash + détection doublon dans processInvoice
  InvoicePanel.tsx           (MODIF) record journal au tampon, undo, garde anti-doublon, repli replay
  FacturationRevue.tsx       (MODIF) section « Factures apprises »
  InvoiceList.tsx            (MODIF) badge « doublon » sur la vignette (léger)
supabase/
  facturation_learned_docs.sql   (NOUVEAU, EXÉCUTÉ PAR L'UTILISATEUR)
  facturation_reset_DANGER.sql   (MODIF) ajouter la table au truncate
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB | `facturation_reset_DANGER.sql` | `facturation_learned_docs.sql` |
| Métier (lib) | `types.ts`, `cloudService.ts`, `facturation.test.ts` | `hash.ts` |
| Composants (UI) | `useFacturationModel.ts`, `useFacturationCuration.ts`, `FacturationBoard.tsx`, `InvoicePanel.tsx`, `FacturationRevue.tsx`, `InvoiceList.tsx` | — |
| **Total** | **9 modifiés** | **2 nouveaux** |
