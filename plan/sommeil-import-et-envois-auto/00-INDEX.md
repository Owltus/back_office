# Plan — Mise en sommeil de l'import manuel + envois automatiques (RepJour & PDJ)

## Contexte

L'import des rapports StayNTouch est désormais **automatique** (Cloudflare → Edge
Function `import-report` → base). Ce chantier prolonge cette bascule :

1. **Mettre en sommeil** l'import MANUEL côté utilisateur dans RepJour et PDJ
   (masquer/désactiver sans supprimer le code) — l'ingestion est automatique.
2. **RepJour — envoi automatique** : une fois le **Comparison ET le Forecast** du
   jour importés (les deux nécessaires), envoyer automatiquement le rapport
   journalier par e-mail (même contenu que le bouton « Envoyer via serveur (dev) »).
3. **PDJ — envoi** : une **liste de destinataires** pour envoyer le PDJ par e-mail,
   depuis un **nouvel expéditeur** `noreply@pdj.naostack.com`.

Principe directeur (rappelé par l'utilisateur) : **prendre le temps de bien
comprendre, respecter les bonnes pratiques, ne rien casser.** L'import manuel et
l'envoi existants restent fonctionnels ; tout est additif ou réversible (flags).

## Architecture cible (résumé)

```
IMPORT (déjà en place)          ENVOI AUTO (ce chantier)
StayNTouch ─▶ import-report ──▶ base ──┐
                                       ├─(Comparison+Forecast du jour présents)
                                       ▼
                              envoi auto RepJour ─▶ Resend ─▶ destinataires
                                (noreply@repjour.naostack.com)

PDJ (In-House déjà importé) ─▶ base ─▶ envoi PDJ ─▶ Resend ─▶ liste PDJ
                                        (noreply@pdj.naostack.com, NOUVEAU domaine)

UI : import manuel RepJour + PDJ  ->  MIS EN SOMMEIL (flag), code conservé
```

## Décisions tranchées (validées par l'utilisateur)

- **[C-CONTENU] Contenu de l'e-mail PDJ** : un **texte simple** (grandes lignes :
  date, nombre de PDJ inclus…) + les **cartes de la page PDJ** (les 6 tuiles de
  totaux) en HTML, **comme le RepJour** ; **+ un PDF joint** = la feuille PDJ du
  jour (équivalent du bouton « Imprimer » de la page PDJ).
- **[C-DECLENCHE] Déclenchement** : **AUTOMATIQUE** (les rapports arrivent ~2h30
  chaque jour → envoi auto à ce moment), RepJour comme PDJ.
- **[FALLBACK] Bouton manuel de secours OBLIGATOIRE** (RepJour ET PDJ) : si l'auto
  bloque, un admin doit pouvoir **déclencher l'envoi à la main**. Non bridé par la
  garde d'idempotence de l'auto (renvoi explicite autorisé).
- **[UI-ENVOI] Groupe d'actions admin dans la barre du HAUT** (RepJour ET PDJ) : à
  côté de « Imprimer », un groupe d'icônes admin réunissant :
  - **Envoyer** (icône + tooltip) → ouvre TOUJOURS le modal de vérification
    (`ServerSendDialog`) listant les destinataires, avant tout envoi manuel ;
  - **Gérer les destinataires** (⚙️ icône + tooltip) → ouvre `RecipientsModal`
    (déjà existant, généralisé `service` + `title`) sur la liste de la page
    (`serverReportRecipients` pour RepJour, `pdjReportRecipients` pour PDJ).
  RepJour : on **relocalise** dans le PageHeader le bouton serveur (qui construit
  déjà l'e-mail complet + PDF) **et** le ⚙️ destinataires existants, et on **retire**
  l'ancien groupe inline « Copier l'image / Envoyer par email (mailto) / (dev) »
  devenu redondant. PDJ : groupe équivalent créé dans sa barre.
- **[B-PDF] PDF du RepJour auto** : **PDF joint** (comme le bouton actuel).
- **[A-FILET] Import manuel en sommeil** : **masqué aux utilisateurs, GARDÉ pour
  les admins** (filet + Forecast multi-mois analytique).
- **[C-SENDER] Expéditeur PDJ** : `noreply@pdj.naostack.com` = expéditeur (nouveau
  domaine à vérifier dans Resend + DNS Cloudflare, Étape 8).
- **[C-INFRA] Fonction d'envoi PDJ** : **étendre `send-report`** (champ `kind`).

## RISQUE N°1 À VALIDER EN PREMIER — jsPDF côté serveur (Deno)

Les deux e-mails (RepJour + PDJ) exigent un **PDF joint**. Or le générateur PDF
existant (`buildRepjourPdf`, jsPDF) tourne côté NAVIGATEUR, et le PDJ n'a **aucun**
générateur PDF (seulement une impression CSS). Il faut donc faire tourner **jsPDF
dans l'Edge Function Deno** — jsPDF peut supposer des globals navigateur.

→ **Étape 2 commence par un test de faisabilité jsPDF en Deno.** S'il passe : on
génère les 2 PDF côté serveur. S'il échoue : repli à décider avec l'utilisateur
(HTML seul temporairement, ou génération PDF par un autre moyen). **Ne pas
construire tout l'envoi avant d'avoir tranché ce risque.**

Décisions techniques déjà cadrées par l'exploration (non bloquantes) :
- **Ordre d'arrivée** : si le Comparison arrive AVANT le Forecast, `daily_reports.pm_*`
  vaut 0 (+ alerte) et le Forecast ne recalcule pas. L'envoi auto devra
  **recalculer le projeté** à la complétion, sinon l'e-mail partirait faux.
- **Idempotence** : `report_send_throttle` est par utilisateur → inadapté. Il faut
  une garde **par date de rapport** (colonne `daily_reports.auto_sent_at` ou table
  dédiée), posée atomiquement (deux invocations quasi simultanées).
- **Autorisation de l'auto-envoi** : `send-report` exige un JWT admin ; l'auto n'a
  pas d'utilisateur → extraire la logique d'envoi en **module Deno partagé** appelé
  en service_role par `import-report` (contourne JWT/throttle admin), plutôt que
  d'assouplir la garde admin.
- **Rendu e-mail serveur** : `reportHtml.ts` est PUR → portable en Deno (recopie,
  comme `import-report/repjour.ts`). `EmailData` est reconstructible depuis
  `daily_reports` (mois) + `budget`.
- **Garde-fou `REPORT_TEST_TO`** : tant qu'il est posé, tout envoi ne part qu'aux
  adresses de test → parfait pour valider l'auto-envoi sans risque.

## Phases

| # | Fichier | Phase | Qui | Dépend de | Effort | Critique |
|---|---------|-------|-----|-----------|--------|----------|
| 1 | [1-sommeil-import-manuel.md](./1-sommeil-import-manuel.md) | Mettre en sommeil l'import manuel RepJour + PDJ (flag) | MOI | — | 1 h | |
| 2 | [2-rendu-email-repjour-serveur.md](./2-rendu-email-repjour-serveur.md) | Porter le rendu e-mail RepJour en Deno | MOI | — | 3 h | |
| 3 | [3-module-envoi-partage.md](./3-module-envoi-partage.md) | Module d'envoi Deno partagé (Resend) appelable en service_role | MOI | 2 | 2 h | ⚠ |
| 4 | [4-declencheur-repjour-auto.md](./4-declencheur-repjour-auto.md) | Déclencheur « Comparison+Forecast présents » + recompute pm_* + idempotence | MOI (SQL: TOI) | 2,3 | 3 h | ⚠ |
| 5 | [5-destinataires-pdj.md](./5-destinataires-pdj.md) | Table + service + modale destinataires PDJ | MOI (SQL: TOI) | — | 1 h | ⚠ |
| 6 | [6-rendu-email-pdj.md](./6-rendu-email-pdj.md) | Rendu e-mail PDJ (nouveau, totaux) | MOI | 5 | 2 h | |
| 7 | [7-envoi-pdj.md](./7-envoi-pdj.md) | Envoi PDJ (extension send-report + nouvel expéditeur) + UI/déclenchement | MOI | 3,5,6 | 3 h | ⚠ |
| 8 | [8-infra-domaine-pdj.md](./8-infra-domaine-pdj.md) | Vérifier pdj.naostack.com (Resend + DNS) + secrets + déploiement | TOI (guidé) | 7 | 30 min | ⚠ |
| 9 | [9-validation-bout-en-bout.md](./9-validation-bout-en-bout.md) | Validation dry-run + logs + envois test | TOI + MOI | 1-8 | 1 h | ⚠ |

## Ordre d'exécution

- **Sprint A (indépendant)** : Étape 1 (sommeil import) — livrable isolé, aucun risque.
- **Sprint B (RepJour auto)** : 2 → 3 → 4 (séquentiel : rendu, puis module d'envoi,
  puis déclencheur/idempotence).
- **Sprint C (PDJ)** : 5 et 6 en parallèle, puis 7. Dépend du module d'envoi (3).
- **Sprint final** : 8 (infra, toi) → 9 (validation).

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Flag / UI RepJour | `src/components/repjour/boards/DashboardBoard.tsx`, `ForecastImportButton.tsx`, `src/lib/repjour/constants.ts` | — |
| UI PDJ | `src/components/pdj/BreakfastBoard.tsx` | — |
| Edge (envoi) | `supabase/functions/send-report/index.ts` | `supabase/functions/import-report/report-render.ts`, `.../send-mail.ts` (modules partagés Deno) |
| Edge (déclencheur) | `supabase/functions/import-report/{index,repjour}.ts` | — |
| Rendu PDJ | — | `src/lib/pdj/reportHtml.ts` (+ copie Deno) |
| Destinataires | `src/lib/repjour/services/recipients.ts` | `supabase/pdj_report_recipients.sql` |
| SQL idempotence | — | `supabase/repjour_auto_send.sql` (colonne/ table + garde) |

| **Total** | **~6 modifiés** | **~5 nouveaux** |
