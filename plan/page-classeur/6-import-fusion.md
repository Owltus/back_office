# Étape 6 — Import JSON, fusion, historique, retour arrière

## Objectif

Réécrire en TypeScript les 1 300 lignes de `files.rs` : validation du
fichier, import comme nouveau classeur, fusion dans un classeur existant
avec prévisualisation, instantané avant fusion, restauration.

## Fichier(s) impacté(s)

- `src/lib/classeur/merge/schema.ts` — types `ClasseurJson`, `ChapterJson`,
  `ItemJson`, `parseImportJson` (v1 accepté, v2 nominal, types inconnus
  ignorés)
- `src/lib/classeur/merge/merge.ts` — **pur** : `planifierFusion(local,
  fichier, { replace })` rend la liste d'actions (`insert`, `update`,
  `unchanged`, `skip`, `delete`) avec les règles de Registre :
  correspondance par `uuid` d'abord, sinon par slug du chapitre + titre ;
  `updated_at` fait foi (dernier écrit gagne) ; mode `replace` supprime ce
  qui n'est pas dans le fichier
- `src/lib/classeur/merge/apply.ts` — exécute le plan via le service
  (écritures unitaires sous RLS), enregistre l'instantané dans
  `classeur_merge_history` AVANT d'écrire, élague l'historique (10 derniers)
- `src/lib/classeur/merge/history.ts` — lecture, restauration (purge douce +
  réinsertion depuis l'instantané, avec instantané de sécurité si l'état
  courant diffère), suppression d'une entrée
- `src/components/classeur/dialogs/MergePreviewDialog.tsx`
- `src/components/classeur/dialogs/HistoriqueDialog.tsx` (ex partie
  « Données » de `SettingsDialog`)

## Travail à réaliser

1. Porter `do_merge` en fonction pure sur des tableaux d'objets nus ;
   tests unitaires exhaustifs (uuid, slug, v1 sans uuid, replace, doublons,
   chapitre supprimé puis réimporté).
2. L'application du plan n'est pas transactionnelle (pas de RPC) : écrire
   l'instantané d'abord, puis les actions dans l'ordre chapitres → éléments ;
   en cas d'échec au milieu, l'utilisateur dispose de l'instantané.
3. Taille de fichier bornée (`MAX_JSON_BYTES`).

## Critère de validation

- `merge.test.ts` : les cinq compteurs (`inserted`, `updated`, `unchanged`,
  `skipped`, `deleted`) sur une matrice de cas, dont un export réel de
  Registre.
- En production : import d'un export, puis fusion du même fichier =
  `unchanged` partout.

## Contrôle /borg

- Aucune écriture avant l'instantané.
- Aucune suppression physique.
