# Étape 9 ⚠ — Heures d'école dans les plafonds

## Objectif

Le temps passé au CFA compte comme du temps de travail (Code du travail
L6222-24) : il entre dans les plafonds du jour et de la semaine, surtout pour
un mineur (8 h par jour, 35 h par semaine, L3162-1).

## Dépend de

1.

## Faits établis

- Les jours d'école comptent dans les jours travaillés (`generateur.ts:432-440`), pas leurs minutes (`generateur.ts:480-494`, `verificateur.ts:221-228`).
- `heuresDues` retire déjà les jours d'école du contrat (`regles.ts:132-148`).

## Fichier(s) impacté(s)

- Migration `supabase/migrations/2026102812xxxx_planning_heures_ecole.sql` : `alter table planning_salaries add column heures_ecole_jour smallint not null default 420 check (heures_ecole_jour between 0 and 600)` (en minutes, D2 = A). Ajout de colonne seulement, aucun retrait.
- `src/lib/planning/types.ts`, `regles.ts`, `generateur.ts`, `verificateur.ts`, `semaine.ts:343-349,567-585`.
- `equipe/CalendrierEcole.tsx` ou la section École de la fiche (champ « Une journée d'école compte… h »).
- Tests : `regles.test.ts:51-110`, `verificateur.test.ts:381`, `generateur.test.ts:189`, `auditMoteur.test.ts`, pgTAP `05_planning`.

## Travail à réaliser

1. La journée d'école ajoute `heures_ecole_jour` aux minutes de la semaine dans le vérificateur (R-SEMAINE-MAX) et comme constante dans le modèle (`minutes` de la semaine).
2. Un jour d'école reste sans shift (déjà le cas) : le plafond journalier n'a donc pas à changer.
3. Règle neuve testée acceptée ET refusée : mineur, 2 jours d'école (14 h) + 3 jours de 7 h = 35 h accepté ; + 1 h de plus refusé.
4. Écart voulu avec le prototype écrit dans le test (l'oracle différentiel ne tient plus sur ce point).

## Phase de test /martin

Propriété : pour toute semaine générée, minutes de l'hôtel + école ≤ plafond de la personne.

## Critère de validation

- `pnpm db:reset` puis `supabase migration up --local` ; pgTAP vert (hors 20-21 déjà rouges sur données de dev) ; 134 tests moteur verts avec les attendus mis à jour.

## Contrôle /borg

- Migration additive seule (pas de `drop`, pas de `rename`), défaut posé, CHECK borné.
- Aucune régression sur le décompte des jours (6e jour, 3 repos sur deux semaines).
- `copier-prod-plan.test.ts` : la nouvelle colonne n'est pas anonymisée et passe la copie.

## Révisé le 2026-10-29, décision utilisateur

« Les heures d'école sont considérées comme des journées de travail
complètes, donc attention pour les 35 ou 39 heures, bien penser les choses. »

- Un jour d'école vaut une journée de contrat : `journeeContrat` dans
  `regles.ts` (8 h au-delà de 35 h, journée étoile ; contrat / 5 sinon ; au
  moins 8 h pour un forfait jours ou un extra, la valeur prudente).
- Heures dues : décompté comme un jour d'absence (comme le prototype).
  39 h + 2 jours = 23 h avec l'étoile sur un jour qui reste (24 h sans
  étoile fixée), 35 h + 2 jours = 21 h, 39 h + 1 jour = 31 h (32 h sans
  étoile), école et absences sur 5 jours = 0.
- Plafond de la semaine (vérificateur et générateur) : la même journée par
  jour d'école. Dues et plafond restent d'accord.
- La colonne `heures_ecole_jour`, sa migration (jamais livrée), le champ de
  la fiche et `MINUTES_ECOLE_JOUR` sont retirés. La fiche dit : « Un jour
  d'école compte comme une journée de travail complète. »
