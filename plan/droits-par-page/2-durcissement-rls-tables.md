# Étape 2 — Durcissement RLS des tables métier

## Objectif

Rendre la granularité **réellement étanche** : remplacer, sur chaque table métier, la garde d'écriture globale actuelle (`get_user_role() in ('super_utilisateur','admin')`) par une garde **par page + niveau** appuyée sur `get_page_level` (Étape 1). Après cette étape, un compte « Lecture sur Parking » est refusé en base s'il tente d'écrire dans le parking, même via l'API — pas seulement dans l'UI.

## Contexte

Toutes les tables suivent le même patron : `SELECT` ouvert aux authentifiés (conservé), écritures gardées par rôle. On garde le `SELECT` ouvert (la visibilité fine d'une page est assurée par le masquage navbar + `PageGuard` de l'Étape 5 ; ouvrir la lecture en base évite de casser les vues analytiques transverses). On resserre **uniquement** `INSERT`/`UPDATE`/`DELETE`. Correspondance niveau → action : **Écriture** (`rank >= 2`) pour la saisie courante, **Gestion** (`rank = 3`) pour les suppressions et les transitions d'état sensibles. La logique spéciale de `caisse_sheets` (verrou 24 h, delete admin) est **conservée** : on ne change que la partie « qui a le droit », pas la fenêtre temporelle.

Mapping page → tables (voir D-mapping de l'index) :

| Page | Tables | Fichiers `supabase/` |
|---|---|---|
| repjour | daily_reports, forecast_days, pms_daily_metrics | (daily_reports/forecast_days : socle repjour) + `pms_daily_metrics.sql` |
| pdj | pdj_breakfasts | `pdj_breakfasts.sql` |
| parking | parking_reservations | `parking_realtime.sql` |
| rapro | rapro_sheets, rapro_rooms | `rapro_sheets.sql`, `rapro_rooms.sql` |
| caisse | caisse_sheets | `caisse_sheets.sql` |
| affichage | affiche_templates | `affiche_templates.sql` |
| facturation | facturation_* (14 objets) | tous les `facturation_*.sql` (gardes RPC) |

## Fichier(s) impacté(s)

- `supabase/pdj_breakfasts.sql`, `supabase/parking_realtime.sql`, `supabase/rapro_sheets.sql`, `supabase/rapro_rooms.sql`, `supabase/pms_daily_metrics.sql`, `supabase/affiche_templates.sql` (policies write réécrites)
- `supabase/caisse_sheets.sql` (policies write réécrites, verrou 24 h + delete admin conservés)
- `supabase/facturation_{budget_lines_rpc,wordpool,issuers,issuer_codes,issuer_denylist,learned_docs,corrections}.sql` (gardes des RPC réécrites)
- (daily_reports / forecast_days : selon leur emplacement SQL, à localiser au lancement)

## Travail à réaliser

### 1. Patron de réécriture des policies (tables « simples »)

Exemple `parking_reservations` (page `parking`). Idempotent (`drop policy if exists` + `create`) :

```sql
-- Écriture (INSERT/UPDATE) : au moins Écriture sur la page parking
drop policy if exists "parking insert" on public.parking_reservations;
create policy "parking insert" on public.parking_reservations
  for insert to authenticated
  with check (public.page_level_rank(public.get_page_level('parking')) >= 2);

drop policy if exists "parking update" on public.parking_reservations;
create policy "parking update" on public.parking_reservations
  for update to authenticated
  using (public.page_level_rank(public.get_page_level('parking')) >= 2)
  with check (public.page_level_rank(public.get_page_level('parking')) >= 2);

-- Suppression : Gestion
drop policy if exists "parking delete" on public.parking_reservations;
create policy "parking delete" on public.parking_reservations
  for delete to authenticated
  using (public.page_level_rank(public.get_page_level('parking')) = 3);
```

Répliquer le patron pour `pdj_breakfasts` ('pdj'), `rapro_sheets`/`rapro_rooms` ('rapro'), `pms_daily_metrics` ('repjour'), `affiche_templates` ('affichage'). Décider par table si DELETE exige Gestion ou Écriture (proposé : DELETE = Gestion partout, aligné sur `isAdmin` actuel).

### 2. Cas `caisse_sheets` (verrou 24 h préservé)

Conserver la structure existante ; ne remplacer que le test de rôle :
- INSERT : `page_level_rank(get_page_level('caisse')) >= 2`.
- UPDATE : `>= 2` **ET** clause temporelle inchangée (`now() < validated_at + interval '24 hours'` **OU** `get_page_level('caisse') = 'gestion'` pour l'équivalent de l'admin qui rouvre hors grâce).
- DELETE : `get_page_level('caisse') = 'gestion'` (remplace `admin` seul).

Le trigger d'estampillage (`caisse_stamp`, du chantier sécurité) reste intact.

### 3. Cas `rapro` / clôture

Les transitions d'état (clôturer/réouvrir) passent par des `UPDATE` de `rapro_sheets` : garde `>= 2` (Écriture) pour clôturer, `= 3` (Gestion) pour réouvrir si l'on veut réserver la réouverture au niveau haut — à aligner sur le comportement UI de l'Étape 6.

### 4. Gardes des RPC `facturation`

Chaque RPC `SECURITY DEFINER` du domaine facturation teste aujourd'hui :
```sql
if get_user_role() not in ('super_utilisateur','admin') then raise exception 'not authorized'; end if;
```
Remplacer par :
```sql
if public.page_level_rank(public.get_page_level('facturation')) < 2 then raise exception 'not authorized'; end if;
```
Passer en revue les ~20 RPC (budget lines, wordpool, issuers, issuer_codes, issuer_denylist, learned_docs, corrections). Distinguer si certaines suppressions doivent exiger Gestion (`= 3`).

## Ordre d'exécution

1. Vérifier que `get_page_level` / `page_level_rank` existent (Étape 1 exécutée).
2. Réécrire chaque script SQL (assistant), idempotent.
3. L'utilisateur exécute table par table, en vérifiant après chacune (critères ci-dessous) — ne pas tout jouer en une transaction géante.
4. Cas particuliers (caisse, rapro, facturation) en dernier, plus sensibles.

## Critère de validation

- Un compte « Lecture sur Parking » : `SELECT` OK, `INSERT/UPDATE/DELETE` refusés en base (tester via l'API/SQL, pas l'UI).
- Un compte « Écriture sur Parking » : saisie OK, `DELETE` refusé (si DELETE = Gestion).
- Un compte « Gestion sur Caisse » : peut rouvrir hors grâce ; « Écriture sur Caisse » : bloqué après 24 h (verrou conservé).
- Un `admin` : tout permis partout (via `get_page_level = 'gestion'`).
- Aucune régression de lecture (les vues analytiques et boards restent alimentés).
- Scripts idempotents.

## Contrôle /borg

Étape critique (réécriture des RLS de ~14 tables = sécurité réelle des données). /borg doit auditer : aucune table métier ne se retrouve sans policy write (blocage total) ni avec un `with check (true)` accidentel (fuite) ; le verrou 24 h de la caisse reste effectif ; `get_page_level` est bien appelée avec la BONNE clé de page sur chaque table (pas de copier-coller d'une mauvaise page) ; les RPC facturation refusent bien un niveau < Écriture ; pas de récursion RLS (la table `user_page_permissions` interrogée par `get_page_level` a une policy SELECT self/admin qui ne boucle pas).
