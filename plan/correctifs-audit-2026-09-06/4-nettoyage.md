# Étape 4 — Nettoyage : email_recipients, code mort, literie, plans

## Objectif

Retirer la table `email_recipients` (lue par du code mort uniquement) et le
code qui la portait, corriger les commentaires périmés de la literie, annoter
les plans qui décrivent encore l'archivage CSV ou le verrouillage de
`email_recipients` comme à faire.

## Contexte

- `email_recipients` : 8 lignes, 1 active. Seul lecteur réel =
  `src/lib/repjour/email.ts`, module sans importateur (le `mailto:` a été
  retiré de `DashboardBoard`). `RecipientsModal` reçoit explicitement
  `serverReportRecipients`. Aucune Edge Function ne la lit.
- `html2canvas` n'a plus d'appelant une fois `email.ts` supprimé.
- Literie : stock 10/10 = 0 + 26 retours − 16 mises en place ; rien à
  recalculer. Les RPC `literie_*` n'existent plus ; les commentaires de
  `LiterieBoard.tsx` et `routes/literie.tsx` le disent encore.
- Archivage CSV : déjà retiré (commit 575bbdd), seuls des plans le décrivent.

## Fichier(s) impacté(s)

- `supabase/email_recipients_drop_2026-09-06.sql` (nouveau, destructif)
- `supabase/email_recipients_rls_hardening.sql`,
  `supabase/email_recipients_email_format.sql` (modifiés : en-tête SUPPRIMÉ)
- `src/lib/repjour/email.ts` (supprimé)
- `src/lib/repjour/services/recipients.ts` (modifié)
- `src/components/repjour/RecipientsModal.tsx` (modifié : prop `service` requis)
- `src/lib/shared/email.ts` (modifié : commentaires)
- `package.json` (modifié : `html2canvas` retiré)
- `src/components/literie/LiterieBoard.tsx`, `src/routes/literie.tsx`
  (modifiés : commentaires)
- `supabase/literie.sql`, `supabase/private_schema_aides.sql` (modifiés :
  blocs `literie_record_movement` / `literie_toggle_bedding` marqués SUPPRIMÉ)
- `plan/securite-pentest-externe/6-durcissements-client-serveur.md`,
  `plan/securite-corrections-audit/5-retention-rgpd.md` (modifiés : note caduc)

## Travail à réaliser

### 1. Sauvegarde hors dépôt

`select * from email_recipients` → fichier dans le scratchpad (adresses =
PII, jamais commitées).

### 2. Drop

```sql
drop table if exists public.email_recipients;
```

### 3. Code

Ordre : `RecipientsModal` (prop requis) → `recipients.ts` (retrait de
`emailRecipients` et des alias) → suppression `email.ts` → `pnpm remove
html2canvas` → commentaires.

## Ordre d'exécution

1. Sauvegarde, script commité, drop appliqué.
2. Code, `tsc`, `pnpm test`, `pnpm build`.

## Critère de validation

- `select to_regclass('public.email_recipients')` = null.
- `grep -r "email_recipients\|html2canvas" src/` → seulement des commentaires
  historiques ou rien.
- Build vert, chunk `html2canvas` absent.

## Contrôle qualité (revue)

Étape critique (`drop table`). Revue manuelle : (1) la sauvegarde existe et
compte 8 lignes ; (2) `send-report` Edge lit toujours
`server_report_recipients` ; (3) `RecipientsModal` monté avec
`serverReportRecipients` dans `DashboardBoard`.
