# Plan — Corrections de l'audit de sécurité

## Contexte

L'audit de sécurité multi-agents (8 lentilles + vérification adversariale) a conclu que la surface est globalement saine : Edge Functions correctement gardées côté serveur, aucun secret dans le bundle, pas de sink XSS exploitable, PII/RGPD maîtrisés, pas d'IDOR sur les boards opérationnels. Deux constats concrets ont néanmoins été CONFIRMÉS (confiance 9/10), et deux angles morts côté base — non vérifiables depuis le dépôt — restent à lever.

Les deux constats confirmés partagent une racine unique : des colonnes que le design traite comme SERVEUR (`validated_at`, `validated_by`, `*_by`) sont acceptées du client sans `WITH CHECK` ni trigger d'estampillage. Un `super_utilisateur` peut (a) post-dater `validated_at` pour que la fenêtre de grâce de 24 h ne se referme jamais, gardant une feuille de caisse validée éditable indéfiniment (contournement du verrou D1), et (b) attribuer une signature/création (`validated_by`, `created_by`, `imported_by`) à l'UUID d'un collègue. L'exploitation exige déjà le rôle super/admin : ce sont des faiblesses d'intégrité et de non-répudiation INTERNES, pas des failles distantes ou ouvertes à un `utilisateur` simple.

Les deux angles morts (auto-escalade de `profiles.role`, autorisation interne de la RPC `admin_update_password`) sont potentiellement plus graves (escalade de privilèges / prise de contrôle de compte) MAIS résident dans des définitions hébergées sur la base Supabase partagée, absentes du dépôt — probablement déjà couvertes par l'app `repjour` co-hébergée. Il faut les vérifier avant tout.

Contrainte critique : backend Supabase PARTAGÉ. Les tables applicatives de cette app (`caisse_sheets`, `rapro_sheets`, `rapro_rooms`, `pms_daily_metrics`) peuvent être durcies via leurs scripts SQL, EXÉCUTÉS PAR L'UTILISATEUR dans Supabase → SQL Editor (jamais par l'assistant). En revanche `profiles` et les RPC partagées sont hors périmètre d'écriture : toute correction éventuelle sur elles se COORDONNE, elle ne se patche pas unilatéralement.

## Angles à clarifier

- Vérification G1 (`profiles.role`) : le dépôt référence un « trigger anti-escalade de rôle » préexistant sur la base partagée. À CONFIRMER dans le dashboard : la policy `UPDATE` de `profiles` (ou un trigger) interdit-elle à un non-admin de changer son propre `role` ? Si oui → aucune action. Si non → escalade totale possible, mais la correction touche une table PARTAGÉE → coordination avec l'app `repjour`, pas un patch unilatéral.
- Vérification G2 (`admin_update_password`) : cette RPC `SECURITY DEFINER` revérifie-t-elle en interne que l'appelant est admin ? Corps non présent dans le dépôt. Même logique de coordination si défaut.
- Approche du correctif F1/F2 : estampillage par trigger `BEFORE` (recommandé — robuste, indépendant du client) versus simple resserrement de `WITH CHECK`. Le trigger est retenu car il neutralise le post-datage à la source ; le `WITH CHECK` seul ne suffirait pas à borner `validated_at`.
- Étape 4 (alignement client) : purement optionnelle. Une fois les colonnes estampillées serveur, le payload client qui les envoie encore est ignoré (le trigger écrase). Les retirer est du nettoyage ; à ne faire que si l'affichage optimiste immédiat n'en dépend pas.
- Étape 5 (rétention RGPD) : `csv-archive/comparison.csv` (noms PMS bruts) et `parking_reservations.client` (nom du client) n'ont pas de fenêtre de purge, contrairement au PDJ. Décision de rétention, pas une faille (bucket privé, aucune URL publique).

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-verif-angles-morts-db.md](./1-verif-angles-morts-db.md) | Vérifier côté Supabase : anti-escalade de `profiles.role` (G1) + contrôle admin interne de `admin_update_password` (G2) | — | P0 | 30min | Requêtes d'inspection + verdict ; SQL correctif conditionnel (coordonné, table partagée) | ⚠ |
| 2 | [2-durcissement-caisse.md](./2-durcissement-caisse.md) | Trigger d'estampillage serveur sur `caisse_sheets` (`validated_at`/`validated_by`, `created_by` figé) — corrige F1 (verrou) + F2-caisse | — | P0 | 1h | `supabase/caisse_sheets.sql` mis à jour, exécuté par l'utilisateur | ⚠ |
| 3 | [3-figer-identite-rapro-pms.md](./3-figer-identite-rapro-pms.md) | Triggers d'estampillage d'identité sur `rapro_sheets`, `rapro_rooms`, `pms_daily_metrics` (F2) | — | P1 | 1h | 3 scripts SQL mis à jour, exécutés par l'utilisateur | ⚠ |
| 4 | [4-alignement-client.md](./4-alignement-client.md) | Retirer `validated_at`/`validated_by` des payloads client (caisse + rapro), désormais serveur | 2, 3 | P2 | 30min | Services TS nettoyés, `tsc` + `build` verts | |
| 5 | [5-retention-rgpd.md](./5-retention-rgpd.md) | Décision de rétention `csv-archive` + `parking_reservations.client` ; purge optionnelle | — | P2 | 30min | Décision actée (+ `pg_cron` parking optionnel) | |

## Ordre d'exécution

Séquentiel, par impact décroissant. **Étape 1 d'abord** : elle lève (ou confirme) le risque le plus grave, à coût quasi nul (inspection). **Étapes 2 et 3** ensuite : durcissement des tables PROPRES à l'app (aucune coordination requise), scripts réécrits par l'assistant puis exécutés par l'utilisateur dans Supabase. **Étape 4** après 2-3 : nettoyage client optionnel, seule étape que l'assistant applique et valide (`tsc` + `build`). **Étape 5** indépendante, décision de rétention.

Rappel : les étapes 1, 2, 3 (et le `pg_cron` optionnel de l'étape 5) sont du SQL EXÉCUTÉ PAR L'UTILISATEUR. L'assistant produit les scripts ; il ne joue rien contre la base partagée.

## Architecture cible

```
supabase/
├── caisse_sheets.sql         ← + fonction caisse_stamp() + trigger (F1 + F2)   [modifié]
├── rapro_sheets.sql          ← + estampillage validated_by/created_by (F2)     [modifié]
├── rapro_rooms.sql           ← + estampillage created_by (F2)                   [modifié]
└── pms_daily_metrics.sql     ← + estampillage imported_by (F2)                  [modifié]
src/lib/
├── caisse/service.ts         ← retrait validated_at/validated_by du payload     [modifié, opt.]
└── rapro/service.ts          ← retrait validated_at/validated_by du payload     [modifié, opt.]
(vérification seule, hors dépôt : profiles RLS + admin_update_password)
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB / Supabase (exécuté par l'utilisateur) | `supabase/{caisse_sheets,rapro_sheets,rapro_rooms,pms_daily_metrics}.sql` | — |
| Métier (assistant, optionnel) | `src/lib/caisse/service.ts`, `src/lib/rapro/service.ts` | — |
| Vérification (dashboard, hors dépôt) | `profiles` RLS, RPC `admin_update_password` | — |
| **Total** | **4 SQL + 2 TS (opt.)** | **0** |
