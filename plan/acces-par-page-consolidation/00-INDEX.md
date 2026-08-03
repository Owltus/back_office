# Plan — Consolidation des accès par page (lecture / écriture / gestion)

## Contexte

L'app veut trois niveaux d'accès **par page** : `lecture` (consulter les données
et l'analytique, sans rien modifier), `ecriture` (éditer/modifier les données),
`gestion` (niveau supérieur). Ce chantier part d'un constat de reconnaissance :

> **Le modèle « 3 niveaux par page » existe déjà et est déployé** (chantier
> `plan/droits-par-page/`). Il est complet de bout en bout : registre
> `src/lib/permissions/`, contexte `can(page, min)` / `pageLevel(page)`, garde
> `PageGuard`, matrice d'attribution dans `/comptes`, table `user_page_permissions`
> + RPC `SECURITY DEFINER`, et RLS par page **avec seuils** (`lecture ≥ 1`,
> `ecriture ≥ 2`, `gestion = 3`) déjà écrites côté Supabase.

Le chantier n'est donc **pas** de construire le système, mais de le **finir et
l'homogénéiser** : donner un sens concret au niveau `gestion` (jusqu'ici défini
mais peu utilisé), combler les actions mutantes non gardées, et nettoyer la dette
(ancien modèle par rôle qui subsiste par endroits).

**Décision produit structurante (fournie par l'utilisateur)** — sémantique de
`gestion` = **le passé verrouillé** :

- `ecriture` peut modifier le **futur** et le **présent** librement, plus un
  **passé récent** (fenêtre de grâce de **7 jours**) et **toute donnée encore en
  cours / d'actualité** (ex. une réservation longue commencée il y a plus de 7 j
  mais dont le séjour n'est pas terminé).
- `gestion` peut en plus modifier le **passé figé** (au-delà de 7 jours et non en
  cours). C'est le seul niveau qui « rouvre » l'historique.

Ce principe unifie ce qui existait déjà de façon éparse :

| Page    | `ecriture` (présent/futur + grâce)                | `gestion` (passé verrouillé)                 |
|---------|--------------------------------------------------|----------------------------------------------|
| Parking | résa en cours + futures + terminées depuis ≤ 7 j | résa terminées depuis > 7 j                  |
| Caisse  | feuille du jour / non clôturée + grâce 24 h *(déjà en place)* | réouverture des feuilles clôturées *(déjà)* |
| Rapro   | jour non validé                                  | réouverture d'un jour validé *(à ajouter)*   |

## Angles à clarifier

- **D-gestion-passe (tranchée par l'utilisateur).** `gestion` = éditer le passé
  verrouillé. Parking : fenêtre de grâce **7 jours** sur la date de fin de séjour
  (`start_date + nights`). Étapes 1, 2, 3, 5.
- **D-borne-parking (recommandée).** La bascule écriture→gestion se fait sur la
  **date de fin de séjour** (`start_date + nights ≥ aujourd'hui − 7 j`) : une résa
  encore en cours reste modifiable en écriture quel que soit son début. À
  confirmer vs une borne sur la date de début. Étape 2.
- **D-facturation (REPORTÉE par l'utilisateur).** La facturation n'a aucun gating
  intra-board, mais reste protégée côté serveur (RPC durcies à `>= 2`) et n'est de
  facto accordée qu'aux admins. **Décision : hors périmètre de ce chantier.**
  L'étape 4 est conservée comme dossier de référence mais **différée** (angle mort
  résiduel uniquement si `facturation:lecture` est un jour accordé à un non-admin).
- **D-pages-utilitaires (tranchée par l'utilisateur).** `/comptes`, `/easter-eggs`,
  `/profil` restent hors registre par page (prérogatives de grade `admin` /
  self-service). `/gestion` budgétaire est **rattachée à `repjour:gestion`**
  (option b) : le budget est de la donnée repjour, l'admin a déjà `gestion` partout,
  et cela supprime le dernier `grade` binaire. Étape 7.
- **D-super-utilisateur (recommandée).** Le rôle legacy `super_utilisateur`
  (traité comme `utilisateur` via `gradeOf`, non attribuable dans l'UI) est retiré
  du type `UserRole`. Vérifier qu'aucun compte prod ne le porte encore avant de
  supprimer. Étape 7.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-spec-gestion-passe-verrouille.md](./1-spec-gestion-passe-verrouille.md) | Spécifier `gestion` = passé verrouillé (doc + constantes) | — | P0 | 1h30 | Doc de référence + `lib/permissions/actions.ts` | |
| 2 | [2-parking-fenetre-7-jours.md](./2-parking-fenetre-7-jours.md) | Parking : fenêtre 7 j côté client (service + board + UI) | 1 | P0 | 3h | `canManage` + verrou temporel sur les résa passées | |
| 3 | [3-rls-parking-passe.md](./3-rls-parking-passe.md) | Parking : RLS temporelle sur `parking_reservations` | 2 | P0 | 1h30 | Policy écriture/gestion + fenêtre 7 j en base | ⚠ |
| ~~4~~ | [4-facturation-gating-intra-board.md](./4-facturation-gating-intra-board.md) | **DIFFÉRÉ** — Facturation : gating dans le board (hors périmètre, décision utilisateur) | — | — | — | (conservé comme référence) | |
| 5 | [5-rapro-reouverture-gestion.md](./5-rapro-reouverture-gestion.md) | Rapro : réouverture d'un jour validé réservée `gestion` | 1 | P1 | 2h30 | Symétrie avec la caisse (UI + service + RLS) | ⚠ |
| 6 | [6-trous-ecriture-et-affichage.md](./6-trous-ecriture-et-affichage.md) | Combler les actions non gardées + niveau `gestion` affichage | 1 | P1 | 2h | « Envoyer par email » gardé, suppression template = gestion | |
| 7 | [7-nettoyage-legacy.md](./7-nettoyage-legacy.md) | Retirer `super_utilisateur`, corriger `affiche_templates.sql`, revoir `/gestion` | 1 | P1 | 2h30 | Un seul modèle de garde, SQL sans régression | ⚠ |
| 8 | [8-audit-rls-et-validation.md](./8-audit-rls-et-validation.md) | Audit RLS complet + validation (tsc / build / tests) | 2,3,5,6,7 | P0 | 2h | `verif_securite.sql` étendu, non-régression | ⚠ |

## Ordre d'exécution

- **Jalon 1 — socle.** Étape 1 (décision figée + constantes partagées). Bloque tout.
- **Jalon 2 — parking (le cas de référence de l'utilisateur).** Étapes 2 puis 3
  (client d'abord, RLS ensuite ; ne jamais livrer le client sans la RLS en prod).
- **Jalon 3 — homogénéisation, parallélisable.** Étapes 5 et 6 indépendantes
  entre elles (features distinctes), toutes après l'étape 1. (Étape 4 facturation
  différée, hors périmètre.)
- **Jalon 4 — dette.** Étape 7 (nettoyage legacy), après avoir vérifié les comptes prod.
- **Jalon 5 — verrou final.** Étape 8 (audit RLS + validation), en dernier.

Les étapes 3, 5, 7 produisent du SQL **exécuté par l'utilisateur** dans Supabase →
SQL Editor (aucun outil d'exécution direct côté assistant). Aucune opération
destructrice sans `WHERE` ciblé ; les changements de policy sont `drop … create`
idempotents.

## Architecture cible

```
src/lib/permissions/
  levels.ts              [modifié]  retrait super_utilisateur du pont gradeOf
  actions.ts             [nouveau]  descripteur central action → niveau requis + fenêtres de grâce
src/lib/parking/
  editability.ts         [nouveau]  isReservationEditable(res, today, level) — fenêtre 7 j
src/components/parking/
  ParkingBoard.tsx       [modifié]  canManage + verrou temporel par résa
src/components/rapro/
  RaproBoard.tsx         [modifié]  réouverture réservée gestion
src/lib/rapro/service.ts [modifié]  canReopen(sheet, level)
src/components/affiche/AffichageBoard.tsx  [modifié]  suppression template = gestion
src/components/repjour/boards/DashboardBoard.tsx [modifié]  garde « Envoyer par email »
src/routes/gestion.tsx   [modifié]  PageGuard vs ProtectedRoute (décision D-pages-utilitaires)
src/lib/repjour/types.ts, roles.ts  [modifié]  retrait super_utilisateur

supabase/
  page_permissions_rls.sql          [modifié]  parking : fenêtre temporelle écriture/gestion
  rapro_reopen_gestion.sql          [nouveau]  réouverture rapro = gestion (RLS + RPC)
  affiche_templates.sql             [modifié]  retrait des policies legacy get_user_role
  verif_securite.sql                [modifié]  contrôles étendus (fenêtres temporelles)
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Permissions (lib) | `permissions/levels.ts` | `permissions/actions.ts` |
| Parking | `ParkingBoard.tsx` | `lib/parking/editability.ts` |
| Facturation | *(différé — hors périmètre)* | — |
| Rapro | `RaproBoard.tsx`, `lib/rapro/service.ts` | — |
| Affichage / Repjour | `AffichageBoard.tsx`, `DashboardBoard.tsx` | — |
| Routes / legacy | `gestion.tsx`, `repjour/types.ts`, `repjour/roles.ts` | — |
| SQL (exécuté par l'utilisateur) | `page_permissions_rls.sql`, `affiche_templates.sql`, `verif_securite.sql` | `rapro_reopen_gestion.sql` |
| **Total** | **~11 modifiés** | **~3 nouveaux** |
