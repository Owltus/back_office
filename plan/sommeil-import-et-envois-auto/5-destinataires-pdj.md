# Étape 5 — Destinataires PDJ (table + service + modale)

## Objectif

Une liste de destinataires dédiée au PDJ, gérable dans l'app (comme la liste serveur
RepJour), réutilisant l'infrastructure existante.

## Qui

MOI (code) + TOI (exécution du SQL).

## Décision liée

[C-INFRA] garde RLS : `page:pdj` (recommandé, cohérent avec la page) vs `page:repjour`.

## Fichier(s)

- `supabase/pdj_report_recipients.sql` (nouveau, calqué sur server_report_recipients)
- `src/lib/repjour/services/recipients.ts` (ajout d'une instance)
- (réutilisé tel quel) `src/components/repjour/RecipientsModal.tsx`

## Travail à réaliser

1. SQL : copier `supabase/server_report_recipients.sql` → `pdj_report_recipients`
   (mêmes colonnes email/name/type/active + CHECK format + RLS). Adapter la garde de
   page (`page:pdj` niveau gestion pour l'écriture, lecture page pdj). À jouer par toi.
2. `recipients.ts` : `export const pdjReportRecipients =
   makeRecipientsService('pdj_report_recipients')`.
3. Réutiliser `RecipientsModal` avec `service={pdjReportRecipients} title="Destinataires PDJ"`
   (aucune modif du composant).

## Critère de validation

- Un gestionnaire PDJ peut ajouter/éditer/désactiver des destinataires PDJ.
- Un compte sans la page PDJ ne peut pas écrire (RLS).

## Contrôle /borg

Critique (RLS/SQL) : vérifier la garde de page correcte, le CHECK format e-mail,
et l'absence d'écriture directe possible hors niveau gestion.
