# Étape 5 — Données fictives et comptes de test

## Objectif

Une base locale qui RESSEMBLE à l'hôtel en marche : 90 jours de rapports, des
petits-déjeuners, un parking rempli, des caisses, trois classeurs avec
images. Chaque page de l'app a quelque chose à montrer. AUCUNE donnée réelle.

## Fichier(s) impacté(s)

- `supabase/seed.sql` (généré, versionné)
- `supabase/seed/generer.ts` (générateur, graine fixe, B6) + `generer.test.ts`
- `supabase/seed/images/` (3 à 5 images `.webp` dessinées, sans personne)
- `package.json` (`db:seed:generer`)

## Travail à réaliser

1. **Référentiels**, repris des scripts versionnés : `classeur_periodicites`,
   `hotel_rooms`, `literie_stock`, `baby_cots`, `parking_tarifs`,
   `affiche_templates`, `easter_eggs`, `facturation_ref_comptes`,
   `facturation_ref_imputations`, `facturation_budget_lines`.
2. **Socle fabriqué** : `hotel_config` (80 chambres, TVA 10 %), `budget` de
   l'année, `forecast_days`.
3. **Comptes** (`auth.users` + `profiles` + `user_page_permissions`), un par
   cas :

   | Compte | Rôle | Droits |
   |---|---|---|
   | `admin@exemple.test` | admin | tout |
   | `gestion@exemple.test` | utilisateur | gestion sur les 9 pages |
   | `ecriture@exemple.test` | utilisateur | écriture sur les 9 pages |
   | `lecture@exemple.test` | utilisateur | lecture seule |
   | `aucun@exemple.test` | utilisateur | aucune page |
   | `reception@exemple.test` | utilisateur | le profil du compte partagé de la réception |

   Mot de passe commun (B3), écrit dans le seed, local seulement.
4. **Volume réaliste** (D6-B) : générateur à graine fixe, 90 jours autour de
   la date du jour. Noms de clients tirés d'une liste fictive évidente
   (« Client Test 042 »), plaques « AA-000-AA » fictives,
   `server_report_recipients` = `rapport@exemple.test` seulement.
5. **Classeurs** : copie du classeur d'essai n° 24 (lorem ipsum, vitrine des
   fonctions) RÉÉCRITE depuis le dépôt, jamais exportée de la prod ; plus un
   classeur « Procédures » fictif de 30 documents, pour la pagination.
6. Le seed se rejoue par `pnpm db:reset`.

## Implications propres

- 100 % local. Le générateur ne lit JAMAIS la prod.
- Avec la graine fixe, une capture d'écran faite aujourd'hui se refait
  identique demain, à la date près.

## Phase de test /martin

- Famille A : les invariants du générateur (fast-check sur la graine) —
  aucun chevauchement de réservations parking (contrainte
  `parking_no_overlap`), cases PDJ ≤ 2, dates dans la fenêtre, toutes les
  FK satisfaites.
- Contrôle PII : `grep` des motifs de l'étape 0 sur `supabase/seed*` →
  0 résultat. Toutes les adresses se terminent par `@exemple.test`.
- `db:reset` deux fois → mêmes comptes de lignes (déterminisme).

## Critère de validation

- Connexion avec chacun des 6 comptes ; chaque page affiche des données ou
  un refus cohérent avec ses droits.
- Commit sans push.

## Contrôle /borg

- Zéro donnée réelle (motifs, domaines, noms).
- Les comptes de test n'existent qu'en local (le seed n'est jamais joué en
  prod : `db push` ne joue pas `seed.sql`).
