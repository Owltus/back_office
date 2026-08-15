-- ============================================================================
-- facturation_ref_comptes — SEED d'AMORÇAGE (numéro -> nom humain).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, APRÈS
-- facturation_ref_comptes.sql (+ le RPC). Ré-exécutable (on conflict do nothing :
-- additif, n'écrase JAMAIS un nom affiné à la main via l'éditeur).
--
-- AMORÇAGE VOLONTAIREMENT APPROXIMATIF : un nom au mieux par compte distinct présent dans
-- facturation_ref_imputations_seed.sql (57 comptes), dérivé de la description dominante du
-- couple et des intitulés du plan comptable général. Le comptable AFFINE ensuite via
-- l'éditeur du dictionnaire (rôle gestion). Ne pas considérer ces libellés comme officiels.
--
-- Certains comptes recouvrent plusieurs usages (ex. 60630000, 61550000, 65190000) : on a
-- retenu l'usage dominant. À arbitrer par le comptable.
-- ============================================================================

insert into public.facturation_ref_comptes (compte, libelle) values
  ('60377000', 'Variation de stocks (fournitures)'),
  ('60400000', 'Prestations refacturées aux clients'),
  ('60611000', 'Eau et assainissement'),
  ('60612000', 'Électricité'),
  ('60612100', 'Gaz'),
  ('60612200', 'Chauffage urbain'),
  ('60621000', 'Linge et literie (hébergement)'),
  ('60623000', 'Uniformes et vêtements de travail'),
  ('60630000', 'Petit matériel et fournitures d''exploitation'),
  ('60632000', 'Produits d''entretien'),
  ('60633000', 'Petit outillage et fournitures diverses'),
  ('60640000', 'Fournitures administratives et de bureau'),
  ('60650000', 'Vaisselle et verrerie'),
  ('60660000', 'Décoration, fleurs et plantes'),
  ('60670000', 'Décoration événementielle et saisonnière'),
  ('60710000', 'Achats de denrées (nourriture et boissons soft)'),
  ('60750000', 'Achats de boissons alcoolisées'),
  ('60760000', 'Achats de boutique et articles refacturés'),
  ('60770000', 'Produits d''accueil'),
  ('60980000', 'Ristournes et coopération commerciale'),
  ('61100000', 'Sous-traitance générale (gardiennage, prestations)'),
  ('61110000', 'Délogements clients'),
  ('61120000', 'Location et blanchissage du linge'),
  ('61150000', 'Sous-traitance diverse et traiteur'),
  ('61350000', 'Locations mobilières (matériel, copieur)'),
  ('61550000', 'Entretien et réparations ponctuels'),
  ('61561000', 'Maintenance informatique et TPE'),
  ('61564000', 'Maintenance des équipements (ascenseurs, cuisine)'),
  ('61567500', 'Maintenance hygiène et sécurité (HACCP, légionelle)'),
  ('61810000', 'Documentation et journaux'),
  ('62110000', 'Personnel intérimaire'),
  ('62140000', 'Mise à disposition de personnel'),
  ('62223000', 'Commissions OTA et distribution (Booking, Expedia)'),
  ('62230000', 'Formation du personnel'),
  ('62260000', 'Honoraires comptables et paie'),
  ('62261000', 'Honoraires d''audit'),
  ('62270000', 'Frais d''actes et de contentieux'),
  ('62281000', 'Redevances de gestion (RBO)'),
  ('62310000', 'Publicité et annonces (réseaux sociaux)'),
  ('62340000', 'Cadeaux, gratifications et offerts clientèle'),
  ('62400000', 'Transport sur achats et livraisons'),
  ('62510000', 'Voyages et déplacements'),
  ('62570000', 'Réceptions et restauration (déplacements, séminaires)'),
  ('62600000', 'Affranchissement et frais postaux'),
  ('62610000', 'Téléphone, internet et télécoms'),
  ('62780000', 'Frais et commissions bancaires'),
  ('62782000', 'Commission d''encaissement AMEX'),
  ('62783000', 'Commission d''encaissement ADYEN'),
  ('62784000', 'Commission d''encaissement ANCV'),
  ('62810000', 'Abonnements et cotisations professionnels'),
  ('64720000', 'Œuvres sociales et CSE'),
  ('64750000', 'Médecine du travail'),
  ('65110000', 'Redevances de marque et publicité'),
  ('65160000', 'Droits d''auteur et redevances (SACEM, SPRE)'),
  ('65190000', 'Licences et abonnements logiciels'),
  ('65400000', 'Pertes sur créances irrécouvrables'),
  ('65800000', 'Autres charges de gestion courante')
on conflict (compte) do nothing;

-- Contrôle : select count(*) from public.facturation_ref_comptes;  -- attendu : 57
