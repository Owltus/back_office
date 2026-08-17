# Étape 2 — Tooltips des cartes du bas de /repjour

## Objectif

Ajouter la prop `hint` aux 12 cartes de la bande de synthèse transverse en
bas de `/repjour` (`DayCrossSummary`, 3 blocs de 4 : PDJ, Parking,
Rapprochement), même mécanisme et même ton que l'étape 1.

## Contexte

Toutes ces cartes affichent une valeur DU JOUR + une moyenne glissante sur 30
jours en `sub` (sauf « Bloquées de la veille », qui n'a pas de moyenne — un
roulement ne s'agrège pas, cf. commentaire du fichier). Les tooltips doivent
décrire la valeur du jour ; mentionner la fenêtre de 30 jours quand un `sub`
existe, pour rester cohérent avec ce qui est affiché juste en dessous.

## Fichier(s) impacté(s)

- `src/components/repjour/DayCrossSummary.tsx` (modifié) — 12 `<StatTile>`,
  lignes ~370-510

## Travail à réaliser

### 1. Bloc PDJ (lignes ~370-402)

```tsx
<StatTile label="PDJ inclus" ...
  hint="Petits-déjeuners inclus dus ce jour (facturés au tarif de la réservation, qu'ils aient été pris ou non)." />

<StatTile label="PDJ Extra" ...
  hint="Petits-déjeuners servis au-delà des inclus ce jour, valorisés au tarif PDJ standard." />

<StatTile label="CA PDJ" ...
  hint="Chiffre d'affaires HT du petit-déjeuner ce jour (inclus + extras). En dessous : moyenne sur les 30 derniers jours." />

<StatTile label="Captage" ...
  hint="Part des clients logés ayant pris un petit-déjeuner ce jour. En dessous : moyenne sur les 30 derniers jours." />
```

### 2. Bloc Parking (lignes ~419-459)

```tsx
<StatTile label="Occupation" ...
  hint="Nombre de places de parking occupées ce jour, toutes réservations confondues. En dessous : moyenne sur les 30 derniers jours." />

<StatTile label="Arrivées" ...
  hint="Nombre d'arrivées parking ce jour. En dessous : moyenne sur les 30 derniers jours." />

<StatTile label="Départs" ...
  hint="Nombre de départs parking ce jour. En dessous : moyenne sur les 30 derniers jours." />

<StatTile label="Captage" ...
  hint="Taux d'occupation du parking rapporté au taux d'occupation de l'hôtel ce jour. En dessous : moyenne sur les 30 derniers jours." />
```

### 3. Bloc Rapprochement (lignes ~476-510)

```tsx
<StatTile label="Nettoyées" ...
  hint="Chambres nettoyées ce jour (par défaut ou en rattrapage). En dessous : moyenne sur les 30 derniers jours clôturés." />

<StatTile label="Refus" ...
  hint="Chambres en refus de service ce jour. En dessous : moyenne sur les 30 derniers jours clôturés." />

<StatTile label="Bloquées du jour" ...
  hint="Chambres occupées non nettoyées ce jour, reportées au lendemain. En dessous : moyenne sur les 30 derniers jours clôturés." />

<StatTile label="Bloquées de la veille" ...
  hint="Chambres bloquées la veille et toujours non résolues aujourd'hui (roulement) — cet indicateur ne s'agrège pas, pas de moyenne." />
```

Ne toucher à AUCUNE autre prop — uniquement l'ajout de `hint`. Pour « Bloquées
de la veille » (pas de `sub`), le tooltip explique justement l'ABSENCE de
moyenne — cohérent avec ce qui est affiché (rien en dessous).

## Ordre d'exécution

1. Bloc PDJ, puis Parking, puis Rapprochement (ordre du fichier).

## Critère de validation

- `npx tsc --noEmit`
- Vérification visuelle sur `/repjour` : survoler chacune des 12 cartes de
  la bande transverse affiche son tooltip, sans troncature.
