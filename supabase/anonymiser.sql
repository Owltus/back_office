-- =====================================================================
-- ANONYMISATION d'une copie de la prod — BASE LOCALE SEULEMENT
-- =====================================================================
-- Joué par `copier-prod` (plan environnement-dev-docker-2026-10-12, étape 14,
-- D22), juste après le chargement des données de la prod dans la base
-- locale. JAMAIS en prod : il réécrit des données réelles. `copier-prod` ne
-- le joue qu'avec `--local`, et le hook garde-prod refuse toute commande qui
-- viserait la prod.
--
-- Colonnes : inventaire du catalogue (releve-prod.md, rubrique 8).
--   - Noms de clients → « Client n », le MÊME n pour le même nom (casse et
--     espaces ignorés) dans toutes les tables : un client qui revient garde
--     son numéro, les regroupements restent justes. Ordre des numéros tiré
--     d'une empreinte, pas de l'ordre alphabétique (qui trahirait les
--     initiales).
--   - Commentaires libres → '' (colonnes NOT NULL).
--   - baby_cot_assignments.label : texte libre ; gardé s'il n'est qu'un
--     numéro de chambre, sinon traité comme un nom.
--   - audit_log.old_data : ces clés sont retirées des copies de lignes.
-- Conservé : personnel (profiles, auteurs), sociétés (pdj.company),
-- adresses des destinataires du rapport (e-mails locaux → Mailpit, D12).
-- =====================================================================

begin;

-- Les triggers d'estampillage et les gardes de fenêtre de dates ne doivent
-- rien réécrire ni refuser : ce n'est pas une saisie.
set local session_replication_role = replica;

create temp table noms_clients on commit drop as
select cle, row_number() over (order by md5(cle)) as n
from (
  select lower(btrim(guest_name)) as cle from public.pdj_breakfasts
  union
  select lower(btrim(client)) from public.parking_reservations
  union
  select lower(btrim(label)) from public.baby_cot_assignments
  where btrim(label) !~ '^[0-9]{1,4}$'
) s
where cle is not null and cle <> '';

update public.pdj_breakfasts b
set guest_name = 'Client ' || n.n
from noms_clients n
where lower(btrim(b.guest_name)) = n.cle;

update public.parking_reservations p
set client = 'Client ' || n.n, comment = ''
from noms_clients n
where lower(btrim(p.client)) = n.cle;
update public.parking_reservations set comment = '' where comment <> '';

update public.baby_cot_assignments a
set label = 'Client ' || n.n
from noms_clients n
where lower(btrim(a.label)) = n.cle;
update public.baby_cot_assignments set comment = '' where comment <> '';

update public.caisse_cautions set comment = '' where comment <> '';
update public.caisse_sheets set comment = '' where comment <> '';
update public.literie_sheets set comment = '' where comment <> '';
update public.rapro_sheets set comment = '' where comment <> '';

update public.audit_log
set old_data = old_data - 'guest_name' - 'client' - 'comment' - 'label'
where old_data ?| array['guest_name', 'client', 'comment', 'label'];

-- Contrôle : plus aucun nom hors « Client n » (sinon tout est annulé).
do $$
declare
  restes bigint;
begin
  select
    (select count(*) from public.pdj_breakfasts
      where guest_name is not null and btrim(guest_name) <> '' and guest_name !~ '^Client [0-9]+$')
  + (select count(*) from public.parking_reservations
      where btrim(client) <> '' and client !~ '^Client [0-9]+$')
  + (select count(*) from public.baby_cot_assignments
      where btrim(label) <> '' and label !~ '^Client [0-9]+$' and btrim(label) !~ '^[0-9]{1,4}$')
  into restes;
  if restes > 0 then
    raise exception 'Anonymisation incomplète : % nom(s) restant(s)', restes;
  end if;
end $$;

commit;
