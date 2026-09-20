# Étape 8 — Parking : ne dessiner que les colonnes visibles

> **SANS OBJET — vérifiée le 2026-09-20, c'est déjà le cas.**
> Aucune ligne de code modifiée.

## Ce que disait l'audit

« `ParkingBoard.tsx:145-147` charge d'emblée 270 jours, et le tableau `days` est
parcouru en entier trois fois dans le JSX (`:1690`, `:1706`, `:1839`) sans
filtrage sur la fenêtre visible — 270 nœuds DOM pour l'en-tête, qui deviennent
390 puis 510 à mesure que l'utilisateur fait défiler. La page devient de plus en
plus lente pendant la séance. »

C'était présenté comme le pire composant de l'audit.

## Ce que dit le code

`LOAD_PAST_DAYS = 90` et `LOAD_FUTURE_DAYS = 180` bornent la fenêtre de
**chargement des données** — combien de jours de réservations sont rapatriés de
la base. Elles ne décrivent pas ce qui est dessiné.

Le tableau `days` est construit à `ParkingBoard.tsx:791` :

```ts
const days = useMemo(() => {
  if (!startDate || visibleDays <= 0) return [] as Date[]
  return Array.from({ length: visibleDays }, (_, i) =>
    addDays(startDate, offset + i),
  )
}, [startDate, offset, visibleDays])
```

et `visibleDays` vaut, à la ligne 651 :

```ts
const visibleDays =
  containerW > 0 ? Math.max(1, Math.floor(containerW / dayMinW)) : 0
```

**`days` ne contient donc QUE les jours tenant à l'écran** — une vingtaine à une
quarantaine selon la largeur de la fenêtre et le mode compact. C'est la seule
définition de `days` du fichier (vérifié), et les trois parcours cités itèrent
bien sur celui-là. Le planning est déjà virtualisé, par construction : `offset`
est l'index du premier jour visible, et tout le positionnement
(`left: i * dayW`) est relatif à cette fenêtre.

Le filtrage des réservations en `:1861` n'est donc pas « la seule chose qui soit
filtrée », contrairement à ce que dit l'audit : il est nécessaire **en plus**,
parce que `reservations` porte, lui, toute la fenêtre de chargement.

Quant à `dayInfo` (`:807`), il boucle sur `visibleDays × reservations`, soit
environ 30 × 608 ≈ 18 000 itérations — de l'ordre de la milliseconde.

## Pourquoi l'erreur

L'agent a lu les deux constantes de chargement et en a déduit le nombre de
colonnes rendues, sans remonter à la construction de `days`. Les deux notions
portent des noms proches et vivent à 650 lignes d'écart dans un fichier de 2 112.

## Ce qu'il ne faut PAS faire

Surtout pas « virtualiser » ce qui l'est déjà. Introduire un découpage
supplémentaire de `days` casserait le positionnement (`left: i * dayW` suppose
que `i` est l'index dans la fenêtre visible) et mettrait en danger le
glisser-déposer, la copie, l'annulation et les mises à jour optimistes en vol —
pour un gain nul.
