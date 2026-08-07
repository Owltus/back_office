# Plan — Remédiation de l'audit des envois auto

## Contexte

Un swarm d'audit (5 agents : fonctionnel RepJour, fonctionnel PDJ, sécurité Edge,
sécurité SQL, cohérence UI) a passé en revue les 19 commits du chantier « import
automatique + envois auto ». Verdict : aucune faille de sécurité critique ou haute,
scripts SQL non destructifs, RLS conforme. Mais six défauts de fiabilité/cohérence
fonctionnelle sont à corriger. Ce chantier les traite un par un, puis produit des
commits propres. Aucune opération destructrice n'est engagée sans confirmation ;
le SQL reste exécuté par l'utilisateur.

## Angles à clarifier (divergences remontées par le swarm)

- **Point 1 — sévérité divergente** : l'agent PDJ le classe MAJEUR, l'agent RepJour
  MINEUR. Tranché par recoupement (deux agents l'ont trouvé, correctif trivial,
  scénario réaliste) → traité en priorité HAUTE. Rien à trancher côté utilisateur.
- **Point 4 — contradiction avec un choix de conception documenté** : l'agent
  RepJour qualifie le « catch-up » (envoi d'un rapport de la veille) de bug, mais
  le commentaire de `repjour_auto_send.sql:22-23` le présente comme VOULU. Le
  restreindre au cycle courant CHANGE ce comportement documenté. À confirmer :
  veut-on bien supprimer le rattrapage automatique des jours antérieurs ?
- **Point 3 — profondeur du correctif** : éliminer TOTALEMENT la course concurrente
  demanderait un déclencheur DB (trigger `after insert/update` appelant un envoi
  idempotent), soit un chantier plus lourd. La correction pragmatique retenue
  (candidat borné au cycle + résilience aux deux ordres d'arrivée) réduit fortement
  la fenêtre mais en laisse une résiduelle très étroite. À confirmer : correctif
  pragmatique suffisant, ou on veut la solution trigger (plus lourde) ?
- **Point 2 — fenêtre transitoire déjà ACTIVE** : la migration `imported_at` a été
  jouée aujourd'hui, donc les anciens Forecast paraissent « frais » jusqu'au prochain
  import réel. Le correctif propre est un `UPDATE` de masse ponctuel (remise à un
  horodatage ancien) → **mass UPDATE = confirmation explicite requise** (CLAUDE.md),
  exécuté par l'utilisateur.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-rollback-reservation-envoi.md](./1-rollback-reservation-envoi.md) | Rollback réservation sur échec envoi (RepJour + PDJ) | — | P0 | 45min | Envoi auto ré-essayable après un échec Resend | |
| 2 | [2-fenetre-transitoire-imported-at.md](./2-fenetre-transitoire-imported-at.md) | Fermer la fenêtre transitoire `imported_at` | — | P0 | 15min | Aucun envoi auto sur Forecast périmé post-migration | ⚠ |
| 3 | [3-course-concurrente.md](./3-course-concurrente.md) | Résilience à la course entre les 2 e-mails | 4 | P1 | 1h | Plus d'envoi manqué quand les 2 fichiers arrivent | |
| 4 | [4-candidat-cycle-courant.md](./4-candidat-cycle-courant.md) | Borner le candidat au cycle courant (anti catch-up) | — | P1 | 45min | Jamais un rapport de la veille avec un projeté d'un autre cycle | |
| 5 | [5-chambres-hors-inventaire.md](./5-chambres-hors-inventaire.md) | Cohérence chambres hors inventaire (PDJ) | — | P1 | 45min | PDF auto cohérent avec lui-même et avec la feuille imprimée | |
| 6 | [6-impasse-ux-repjour.md](./6-impasse-ux-repjour.md) | Corriger l'impasse UX import RepJour | — | P2 | 20min | Plus de cul-de-sac « charge-le ci-dessous » pour un non-admin | |
| 7 | [7-validation-commits.md](./7-validation-commits.md) | Validation globale + commits propres | 1,2,3,4,5,6 | P0 | 30min | tsc + deno check + build OK, commits organisés | ⚠ |

## Ordre d'exécution

Séquentiel : 1 → 4 → 3 (3 s'appuie sur le candidat borné de 4) → 2 → 5 → 6 → 7.
Les étapes 4 et 3 touchent toutes deux `autoSend.ts` (logique de candidat) et sont
implémentées ensemble dans le même fichier, documentées comme deux correctifs.

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Edge (Deno) | `import-report/autoSend.ts`, `import-report/autoSendPdj.ts`, `import-report/index.ts` | — |
| SQL | — | `supabase/forecast_days_reset_imported_at.sql` |
| Client | `src/components/repjour/boards/DashboardBoard.tsx` | — |
| Plan | — | `plan/remediation-audit-envois-auto/*` |

| **Total** | **4 modifiés** | **2 nouveaux** |
