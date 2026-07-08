# Étape 4 — RaproBoard : grille cochable + navigation par jour

## Objectif

Le cœur visible : une grille **étages → chambres** (reprise du rendu PDJ), chaque chambre portant une **checkbox « non faite »**, surmontée d'une barre de **navigation par jour** (chevrons + sélecteur de date) reprise de la caisse, et d'un compteur « N non faites / 80 ». L'état se charge/sauvegarde via TanStack Query.

## Contexte

Rendu chambres calqué sur `src/components/pdj/BreakfastBoard.tsx` (`useMemo` `floors`, `Math.floor(room/100)`, grille `.pdj-floors` → cartes `.pdj-floor` avec tableau HTML natif). Ici on part de `FLOORS` (étape 1), plus simple : pas de données PMS, juste une case par chambre.

Navigation par jour calquée sur `CaisseBoard.tsx` (section navigation) mais sans shift : la clé est la date-string. `DatePickerButton` (`src/components/form/fields.tsx`) est réutilisable **tel quel** (props `value`/`onChange`/`min`/`max`). Chevrons `ChevronLeft`/`ChevronRight` de `lucide-react`.

Écriture : pour de simples checkboxes, un `setQueryData` optimiste au toggle + `saveNotDone` en arrière-plan suffit (pas besoin de l'autosave sophistiqué anti-clobber de la caisse). En cas d'échec, `invalidateQueries({ queryKey: ['rapro'] })` resynchronise.

Décision D4 (primitive checkbox) : cette étape suppose l'**Option A** (`ui/checkbox.tsx` shadcn). Si D4=B, utiliser `ui/switch.tsx` ; si D4=C, un `<input type="checkbox">` natif stylé `.rapro-*`.

## Fichier(s) impacté(s)

- `src/components/rapro/RaproBoard.tsx` (nouveau)
- `src/styles/rapro.css` (nouveau)
- `src/components/ui/checkbox.tsx` (nouveau, si D4=A — via `pnpm dlx shadcn@latest add checkbox`)

## Travail à réaliser

### 1. Primitive checkbox (si D4=A)

`pnpm dlx shadcn@latest add checkbox` — vendored dans `src/components/ui/checkbox.tsx`, **jamais retouché à la main** (convention projet).

### 2. Navigation par jour

Reprendre la mécanique caisse en version « jour » (cf. étape 1 `day.ts`) :

```ts
const [selectedDate, setSelectedDate] = useState(() => today())
const todayStr = today()
const { data: oldestDay } = useQuery({
  queryKey: ['rapro', 'oldest'],
  queryFn: fetchOldestDay,
})
const lowerDay = oldestDay ?? todayStr          // pas d'amorçage -1 (cf. D1/day)
const atLatest = selectedDate >= todayStr
const atLower = selectedDate <= lowerDay
const goStep = (d: number) =>
  setSelectedDate((cur) => clampDay(addDays(cur, d), lowerDay, todayStr))
const goDate = (v: string) => setSelectedDate(clampDay(v, lowerDay, todayStr))
```

Barre UI (calquée `CaisseBoard.tsx`) :

```
[ChevronLeft onClick=goStep(-1) disabled=atLower]
[DatePickerButton value=selectedDate onChange=goDate min={lowerDay} max={todayStr}]
[ChevronRight onClick=goStep(1) disabled=atLatest]
```

### 3. Chargement + état des cases

```ts
const isWriter = role === 'super_utilisateur' || role === 'admin'
const { data: day } = useQuery({
  queryKey: ['rapro', 'day', selectedDate],
  queryFn: () => fetchDay(selectedDate),
})
const notDone = day?.roomsNotDone ?? new Set<number>()

function toggle(room: number, value: boolean) {
  const next = new Set(notDone)
  value ? next.add(room) : next.delete(room)
  // optimiste : on met à jour le cache immédiatement
  queryClient.setQueryData(['rapro', 'day', selectedDate], (prev) => ({
    reportDate: selectedDate,
    roomsNotDone: next,
    comment: day?.comment ?? '',
  }))
  saveNotDone(selectedDate, next, day?.comment ?? '').catch(() =>
    queryClient.invalidateQueries({ queryKey: ['rapro'] }),
  )
}
```

### 4. Grille étages → chambres

`FLOORS.map` → une carte `.rapro-floor` par étage, une ligne/case par chambre :

```tsx
<div className="rapro-floors">
  {FLOORS.map(({ floor, rooms }) => (
    <div key={floor} className="rapro-floor">
      <h3>Étage {floor}</h3>
      {rooms.map((room) => (
        <label key={room} className={cn('rapro-room', notDone.has(room) && 'rapro-room-flagged')}>
          <Checkbox
            checked={notDone.has(room)}
            onCheckedChange={(v) => toggle(room, v === true)}
            disabled={!isWriter}
          />
          <span>{room}</span>
        </label>
      ))}
    </div>
  ))}
</div>
```

### 4b. Compteur (D5 = Option A)

En-tête : `{notDone.size} chambre(s) non faite(s) / {ROOM_COUNT}`. Pas de calcul d'écart Réception/Étages agrégé (réservé à D5 = Option B).

### 5. Styles `.rapro-*` — `src/styles/rapro.css`

Réutiliser l'ossature `.pdj-floors` / `.pdj-floor` (grille responsive 1→2→3 colonnes, cartes) en préfixe `.rapro-*`. `.rapro-room` = ligne flex (case + numéro `tabular-nums`) ; `.rapro-room-flagged` = fond d'alerte (rouge/ambre sobre) pour les chambres cochées. Prévoir une section `@media print` si l'impression est souhaitée (calquée sur `pdj.css`).

## Ordre d'exécution

1. Acter D4 et D5.
2. (Si D4=A) ajouter la primitive `ui/checkbox.tsx`.
3. Écrire `RaproBoard.tsx` : navigation → chargement query → grille → compteur.
4. Écrire `src/styles/rapro.css`.
5. `npx tsc --noEmit`.

## Critère de validation

- La grille affiche les 6 étages et 80 chambres, dans l'ordre.
- Cocher une chambre la marque « non faite » (feedback visuel `.rapro-room-flagged`) et persiste (visible après navigation aller-retour de jour).
- Un `utilisateur` (lecture seule) voit les cases mais ne peut pas les modifier (`disabled`).
- La navigation ne dépasse pas aujourd'hui (chevron droit désactivé) ni le plus ancien jour enregistré (chevron gauche désactivé) ; le date picker borne pareil.
- `npx tsc --noEmit` vert.
