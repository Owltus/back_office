-- ============================================================================
-- email_recipients — CONTRAINTE DE FORMAT sur `email` (M4).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, EN DEUX TEMPS.
-- Seule garantie NON contournable contre le détournement du mailto: (la
-- validation cliente est contournable via la clé anon + PostgREST direct).
--
-- ⚠ NE PAS jouer les deux étapes dans le même batch : un CHECK posé sur une
--   table dont une ligne viole déjà la condition ÉCHOUE et annule la transaction.
-- ============================================================================

-- Étape 1 — CONTRÔLER d'abord (doit renvoyer 0 ligne).
select id, email, name, type, active
from public.email_recipients
where email !~ '^[^\s@;,?&#<>"]+@[^\s@;,?&#<>"]+\.[A-Za-z]{2,}$';

-- Si des lignes remontent : ce sont de VRAIES adresses. Les LIRE et corriger à
-- la main. Ne jamais les supprimer par réflexe. Puis relancer le contrôle → 0.

-- Étape 2 — SEULEMENT si le contrôle renvoie 0 ligne, exécuter SÉPARÉMENT :
--
--   alter table public.email_recipients
--     drop constraint if exists email_recipients_email_format;
--
--   alter table public.email_recipients
--     add constraint email_recipients_email_format
--     check (email ~ '^[^\s@;,?&#<>"]+@[^\s@;,?&#<>"]+\.[A-Za-z]{2,}$');
--
-- POURQUOI : la classe de caractères exclut  ?  &  #  ;  ,  <  >  "  et les
-- espaces — précisément ce qui permettrait à une adresse stockée de détourner
-- l'URL mailto (sujet/corps/destinataires cachés).
