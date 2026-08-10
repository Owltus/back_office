# Étape 5 — Frontend : import manuel Addon + calcul + injection PDF

## Objectif

Dans `BreakfastBoard.tsx` : accepter le CSV Addon Production à l'import manuel (aiguillage par
contenu), charger l'Addon du jour, calculer les 3 montants HT (inclus / extras / total) et les
injecter dans les cases déjà présentes du PDF. Aucune card à l'écran ; le rendu ne se voit qu'à
l'impression.

## Contexte

- Import manuel actuel : `loadFiles` (L260-328) envoie TOUS les `.csv` à `mergeCsvFiles`
  (format In-House uniquement). Un CSV Addon y serait rejeté. Il faut **aiguiller par contenu**
  avant `mergeCsvFiles`.
- Gating inchangé : `canManualImport = canEdit && (MANUAL_IMPORT_ENABLED_FOR_ALL || grade === 'admin')`
  → import manuel réservé aux admins, comme le In-House (« comme pour le in house »).
- Les 3 cases du PDF existent déjà, **vides** : `L606-614`, `.pdj-stats-revenue` /
  `.pdj-revenue-value` (déjà centrées, déjà `print-only`, `pdj.css:364-388`). On remplit la valeur.
- Extras (décision A1) : `Σ max(0, breakfasts_served − breakfasts_included)` sur `dayRows`.
  Correspond aux cases cochées « non attendues » (le style gras/plein = attendu/inclus existe déjà).
- Couverts : `countCovers(dayRows)` (Étape 2) depuis `addons` + `adults` + `children`.

## Fichier(s) impacté(s)

- `src/components/pdj/BreakfastBoard.tsx` (modifié)

## Travail à réaliser

### 1. Aiguillage de l'import (`loadFiles`)

Avant d'appeler `mergeCsvFiles`, répartir les fichiers lus par **type détecté sur le contenu** :
- Addon si le contenu contient `Addon Production` (préambule `Report Name`) OU (`Total Count`
  ET `Total Revenue` SANS `Guest Name`). Sinon In-House.
- In-House → chemin existant (`mergeCsvFiles` → `importRows`).
- Addon → `parseAddonProduction(content)` par fichier ; mapper vers `AddonProductionDbRow`
  avec `service_date = breakfastServiceDate(businessDate)` (+1 jour) et `source_file = name` ;
  concaténer, puis `importAddonProduction(rows)`.
- Sélection mixte (In-House + Addon dans le même dépôt) : traiter les deux lots, agréger le
  `notice` (« In-House : N jours · Addon : M jours »). Un fichier Addon sans date métier →
  message d'erreur clair, non bloquant pour les autres.
- Après import Addon, `invalidateQueries(['pdj'])` (recouvre `['pdj','addons',…]`), et recaler
  `selectedDate` sur le jour du petit-déjeuner importé (`breakfastServiceDate`).

Adapter les libellés bouton/dropzone : accepter « In-House ou Addon Production » (tooltip L471,
texte dropzone L546-549) sans en faire deux boutons.

### 2. Charger l'Addon du jour

Nouveau `useQuery` :
```ts
const { data: addonRows = [] } = useQuery({
  queryKey: ['pdj', 'addons', selectedDate],
  queryFn: () => fetchAddonProduction(selectedDate),
})
```

### 3. Calculer les montants (`useMemo`)

```ts
const amounts = useMemo(() => {
  if (addonRows.length === 0) return null            // pas d'Addon → cases vides
  const covers = countCovers(dayRows)
  const extrasCount = dayRows.reduce(
    (s, r) => s + Math.max(0, r.breakfasts_served - r.breakfasts_included), 0)
  return computePdjAmounts({
    addon: addonRows.map((r) => ({ code: r.code, count: r.total_count, revenue: r.revenue_ttc })),
    covers,
    extrasCount,
  })
}, [addonRows, dayRows])
```

### 4. Injecter dans les 3 cases (L606-614)

Remplacer le `map` sur labels fixes par 3 cases explicites :
- **PDJ Inclus €** : `amounts ? fmtEur(amounts.includedHT, 2) : ''` (toujours si Addon présent, centré).
- **PDJ Extra €** : valeur **uniquement** si extras présents et chiffrables :
  `amounts && amounts.extrasHT != null && amounts.extrasHT > 0 ? fmtEur(amounts.extrasHT, 2) : ''`
  (sinon chaîne vide → case gardée, valeur vide — décision D1). La grille reste à 3 colonnes.
- **Total €** : `amounts ? fmtEur(amounts.totalHT, 2) : ''`.

Garder la structure `.pdj-revenue` / `.pdj-revenue-value` / `.pdj-revenue-label` (aucun CSS
à changer, décision D1). Import `fmtEur` depuis `#/lib/pdj/format.ts`.

### 5. Avertissements défensifs (décision B1, discret)

Si `amounts?.warnings.length`, afficher un message court dans la zone `notice`/`error`
existante (`print:hidden`, L429-434), sans card ni bloc dédié. Style « anomalie seulement »
(cf. conventions UX hôtelier). Ne jamais afficher de message quand tout va bien.

## Ordre d'exécution

1. Aiguillage `loadFiles` + libellés.
2. `useQuery` addon du jour.
3. `useMemo` amounts (covers + extras + `computePdjAmounts`).
4. Injection dans les 3 cases + `fmtEur`.
5. Avertissements dans la zone existante.
6. `npx tsc --noEmit`.

## Critère de validation

- Aucun changement visible à l'écran (pas de card) ; les 3 montants n'apparaissent qu'au PDF.
- Import manuel : un CSV Addon est accepté et rangé sous le bon jour (petit-déjeuner) ;
  un CSV In-House reste importé comme avant ; un dépôt mixte fonctionne.
- PDF : « PDJ Inclus » toujours rempli quand l'Addon du jour existe ; « PDJ Extra » rempli
  seulement s'il y a des extras, sinon vide ; « Total » = inclus + extras.
- Jour sans Addon importé → 3 cases vides (comportement historique préservé).
- `npx tsc --noEmit` vert.
