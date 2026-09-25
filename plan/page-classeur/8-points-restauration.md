# Étape 8 — Points de restauration (mineurs / majeurs)

## Objectif

Remplacer l'« historique des imports » (un instantané seulement avant une
fusion JSON ou une restauration) par de vraies sauvegardes : un point de
restauration pris facilement, même pour une petite modification, une
dizaine conservées, en distinguant mineurs et majeurs.

## Contexte

Demande de l'utilisateur, nuit du 25 au 26/09 : « un système que j'avais
créé en m'inspirant de GitHub, commits, embranchements… quelque chose de
plus simple : de vraies sauvegardes pour revenir en arrière, même sur une
petite partie du contenu, des points de restauration créés facilement, une
dizaine, mineurs et majeurs ». Décision livrée sans accord préalable, à
valider au réveil.

Audit de l'existant : `classeur_merge_history` ne recevait un instantané
qu'avant une fusion (`apply.ts`) ou une restauration (`history.ts`) ; une
modification faite à la main (document, feuille, chapitre) n'était jamais
sauvegardée ; élagage à 10 sans distinction ; suppression réservée à
`gestion`. La restauration elle-même (fusion en remplacement) avait été
auditée par propriétés le 25/09 et reste le mécanisme de retour arrière.

## Fichier(s) impacté(s)

- `supabase/classeur_points_restauration_2026-09-26.sql` (JOUÉ) et
  `supabase/classeur_2026-09-25.sql` (autorité, à jour)
- `src/lib/classeur/restauration.ts`, `pointsAutoGarde.ts`,
  `restauration.test.ts`
- `src/lib/classeur/service.ts` (garde d'écriture `definirGardeEcriture`,
  `avantEcriture(ref)` dans toutes les écritures)
- `src/lib/classeur/merge/{snapshot,apply,history}.ts`, tests
- `src/lib/classeur/types.ts` (`PointKind`, `kind`, `label`, `taille`)
- `src/components/classeur/hooks/useMerge.ts`
  (`useCreerPointRestauration`)
- `src/components/classeur/dialogs/HistoriqueDialog.tsx` (réécrit),
  `ClasseurDashboard.tsx` (carte « Points de restauration »)

## Travail réalisé

### 1. Base

Colonnes `kind` (`auto | manuel | fusion | securite`, défaut `fusion`),
`label`, `taille` (trigger `pg_column_size(snapshot)`), index
`(classeur_id, kind, merged_at desc)`. Policy delete : `gestion`, ou rang
`ecriture` sur les seuls points `auto` (sinon l'historique d'un compte
écriture grandirait sans borne).

### 2. Point automatique (mineur)

Pris avant la première écriture d'une session, au plus un par quart
d'heure et par classeur. La garde est posée dans le service, donc toute
écriture y passe quel que soit l'écran. Résolution élément → chapitre →
classeur mémorisée. Jamais bloquante. Suspendue pendant une fusion ou une
restauration (`sansPointsAuto`).

### 3. Points majeurs

`manuel` (nommé dans le dialogue, toujours écrit), `fusion` (avant un
import), `securite` (avant une restauration). Quota partagé de 10 ; les
`securite` sont élagués en premier.

### 4. Dédoublonnage

Un point non manuel n'est pas écrit s'il est égal au dernier point, tous
genres confondus (corrigé après le contrôle navigateur : la première
version comparait au dernier point du même genre et a dupliqué 43 ko).

## Critère de validation

- `tsc`, lint, 1058 tests, build : verts (26/09 01h).
- SQL joué : 6 contrôles OK, `verif_advisor.sql` 11/11.
- Navigateur, classeur id 2 : point manuel (43 ko) ; point auto pris avant
  un renommage (l'instantané porte l'ancien nom) ; restauration qui
  rétablit le nom, 10 chapitres intacts, point de sécurité qui conserve
  l'état abandonné.

## Questions ouvertes pour l'utilisateur

- Fenêtre des points auto : 15 min. Plus court = plus de points, plus de
  poids (un point = ~43 ko pour le Registre de Sécurité).
- Quotas 10 + 10.
- « Avant la session » plutôt qu'« après chaque écriture » : l'état
  d'arrivée est l'état courant, figé par le prochain point.
- Trois points d'essai laissés en base (manuel « Contrôle du 26/09 avant
  essai », auto, sécurité) : à supprimer depuis le dialogue ou à garder.
