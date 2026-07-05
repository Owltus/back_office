-- =============================================================================
-- affiche_templates — modèles d'affiche persistés (page Affichage)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
-- Script ré-exécutable (create ... if not exists, drop policy if exists, etc.).
--
-- Backend partagé : ce script ne touche QUE la nouvelle table applicative
-- `affiche_templates`. Il ne modifie aucune table existante. La fonction
-- `get_user_role()` est supposée déjà déployée (utilisée telle quelle).
--
-- Droits (D1) : lecture pour tous les authentifiés ; écriture (insert/update/
-- delete) réservée aux rôles 'super_utilisateur' et 'admin'.
-- Chargement côté app (D3) : TanStack Query (pas de Realtime) → pas de bloc
-- `alter publication supabase_realtime`.
-- =============================================================================

-- ---- Table + index -----------------------------------------------------------
create table if not exists public.affiche_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  icon text not null default 'alert',
  color text not null default 'okko'
    check (color in ('bw', 'okko', 'red', 'blue', 'yellow')),
  title_fr text not null default '',
  message_fr text not null default '',
  title_en text not null default '',
  message_en text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists affiche_templates_sort_idx
  on public.affiche_templates (sort_order, name);

-- ---- Trigger updated_at (fonction DÉDIÉE, ne rien écraser d'existant) --------
create or replace function public.affiche_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists affiche_templates_set_updated_at on public.affiche_templates;
create trigger affiche_templates_set_updated_at
  before update on public.affiche_templates
  for each row execute function public.affiche_set_updated_at();

-- ---- RLS ---------------------------------------------------------------------
alter table public.affiche_templates enable row level security;

-- LECTURE : tous les authentifiés (les 3 rôles)
drop policy if exists "affiche read (authenticated)" on public.affiche_templates;
create policy "affiche read (authenticated)"
  on public.affiche_templates for select
  to authenticated using (true);

-- INSERT : super_utilisateur + admin
drop policy if exists "affiche insert (super/admin)" on public.affiche_templates;
create policy "affiche insert (super/admin)"
  on public.affiche_templates for insert
  to authenticated
  with check (get_user_role() in ('super_utilisateur', 'admin'));

-- UPDATE : super_utilisateur + admin
drop policy if exists "affiche update (super/admin)" on public.affiche_templates;
create policy "affiche update (super/admin)"
  on public.affiche_templates for update
  to authenticated
  using (get_user_role() in ('super_utilisateur', 'admin'))
  with check (get_user_role() in ('super_utilisateur', 'admin'));

-- DELETE : super_utilisateur + admin
drop policy if exists "affiche delete (super/admin)" on public.affiche_templates;
create policy "affiche delete (super/admin)"
  on public.affiche_templates for delete
  to authenticated
  using (get_user_role() in ('super_utilisateur', 'admin'));

-- ---- Seed des 7 modèles historiques (idempotent : seulement si table vide) ---
-- Transcrit à l'identique de src/lib/poster/templates.ts (collection).
-- E'...' pour préserver les sauts de ligne \n\n ; apostrophes doublées ''.
insert into public.affiche_templates
  (name, icon, color, title_fr, message_fr, title_en, message_en, sort_order)
select * from (values
  (
    'Machine à café en panne', 'coffee', 'okko',
    'MACHINE À CAFÉ TEMPORAIREMENT INDISPONIBLE',
    E'Notre machine à café a besoin d''un petit repos ! Bonne nouvelle : sa jumelle vous accueille juste à côté pour vous servir un excellent café. Pendant ce temps, notre équipe s''active pour ramener celle-ci en service.\n\nMerci de votre compréhension !',
    'COFFEE MACHINE TEMPORARILY UNAVAILABLE',
    E'Our coffee machine needs a little rest! Good news: its twin is waiting right next door to serve you an excellent coffee. In the meantime, our team is working hard to get this one back in service.\n\nThank you for your understanding!',
    0
  ),
  (
    'Maintenance ascenseur', 'elevator', 'okko',
    'MAINTENANCE ASCENSEUR',
    E'Notre ascenseur bénéficie d''une maintenance essentielle pour garantir son bon fonctionnement tout au long de l''année. Pendant cette courte période, les escaliers restent à votre disposition. Notre équipe travaille activement pour rétablir le service au plus vite.\n\nMerci de votre compréhension et de votre patience !',
    'ELEVATOR MAINTENANCE',
    E'Our elevator is undergoing essential maintenance to ensure its smooth operation throughout the year. During this short period, the stairs remain at your disposal. Our team is working actively to restore service as quickly as possible.\n\nThank you for your understanding and patience!',
    1
  ),
  (
    'Coupure d''eau', 'droplet', 'blue',
    'COUPURE D''EAU PROGRAMMÉE',
    E'En raison d''une maintenance nécessaire sur notre réseau d''eau, le service sera temporairement indisponible. Nos équipes œuvrent pour rétablir l''eau courante dans les meilleurs délais.\n\nNous nous excusons sincèrement pour ce désagrément et vous remercions de votre patience !',
    'SCHEDULED WATER OUTAGE',
    E'Due to necessary maintenance on our water network, the service will be temporarily unavailable. Our teams are working to restore running water as soon as possible.\n\nWe sincerely apologize for this inconvenience and thank you for your patience!',
    2
  ),
  (
    'Coupure électrique', 'power_outage', 'yellow',
    'COUPURE ÉLECTRIQUE PLANIFIÉE',
    E'Dans le cadre d''un contrôle de sécurité sur nos installations électriques, une brève coupure de courant est programmée et ne durera que quelques instants. Cette vérification est essentielle pour assurer le bon fonctionnement de nos équipements. Nos équipes œuvrent pour rétablir le service dans les meilleurs délais.\n\nNous nous excusons sincèrement pour ce désagrément et vous remercions de votre patience !',
    'PLANNED POWER OUTAGE',
    E'As part of a safety inspection of our electrical installations, a brief power outage is scheduled and will last only a few moments. This inspection is essential to ensure the proper functioning of our equipment. Our teams are working to restore service as soon as possible.\n\nWe sincerely apologize for this inconvenience and thank you for your patience!',
    3
  ),
  (
    'Test alarme incendie', 'fire_alarm', 'red',
    'TEST D''ALARME INCENDIE',
    E'Un test de notre système d''alarme incendie sera effectué aujourd''hui. Vous entendrez une sonnerie pendant 5 minutes, mais ne vous inquiétez pas : c''est juste un exercice ! Aucune évacuation n''est nécessaire. Continuez vos activités normalement.\n\nNous nous excusons sincèrement pour cette gêne et vous remercions de votre compréhension !',
    'FIRE ALARM TEST',
    E'A test of our fire alarm system will be conducted today. You will hear an alarm for 5 minutes, but don''t worry: it''s just a drill! No evacuation is necessary. Continue your activities normally.\n\nWe sincerely apologize for this inconvenience and thank you for your understanding!',
    4
  ),
  (
    'Peinture fraîche', 'wet_paint', 'okko',
    'ATTENTION PEINTURE FRAÎCHE',
    E'Nous embellissons votre hôtel ! Attention à ne pas toucher les murs fraîchement peints. Nous vous remercions de votre patience pendant cette période d''amélioration. Le résultat en vaudra la chandelle !',
    'CAUTION WET PAINT',
    E'We are beautifying your hotel! Please be careful not to touch freshly painted walls. We thank you for your patience during this improvement period. The result will be worth it!',
    5
  ),
  (
    'Toilettes indisponibles', 'toilet_out', 'okko',
    'TOILETTES TEMPORAIREMENT FERMÉES',
    E'Ces toilettes sont temporairement indisponibles. Nous vous invitons à utiliser les toilettes de votre chambre. Notre équipe technique travaille à résoudre le problème dans les meilleurs délais.\n\nNous nous excusons sincèrement pour ce désagrément et vous remercions de votre compréhension !',
    'RESTROOMS TEMPORARILY CLOSED',
    E'These restrooms are temporarily unavailable. We invite you to use the restrooms in your room. Our technical team is working to resolve the issue as soon as possible.\n\nWe sincerely apologize for this inconvenience and thank you for your understanding!',
    6
  )
) as seed(name, icon, color, title_fr, message_fr, title_en, message_en, sort_order)
where not exists (select 1 from public.affiche_templates);
