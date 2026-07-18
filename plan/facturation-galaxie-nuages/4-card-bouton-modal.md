# Étape 4 — Card + bouton + modal dans le rail droit

## Objectif

Une nouvelle card en haut du rail droit (au-dessus d'« Imputation comptable ») avec
un bouton « Prévisualisation graphique » ; le clic ouvre un modal plein écran
contenant la galaxie.

## Contexte

Le pool (graine + nuages serveur) est déjà calculé dans `FacturationBoard`. On le
passe à la card, qui construit le modèle (`buildGalaxy`) et le donne à `GalaxyView`
dans un `Dialog`.

## Fichier(s) impacté(s)

- `src/components/facturation/GalaxyCard.tsx` (nouveau)
- `src/components/facturation/FacturationBoard.tsx` (modification : monte la card en haut du rail droit)

## Travail à réaliser

### 1. `GalaxyCard.tsx`

```tsx
import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { GalaxyView } from '#/components/facturation/GalaxyView.tsx'
import { buildGalaxy } from '#/lib/facturation/galaxy.ts'
import type { WordPool } from '#/lib/facturation/wordpool.ts'

export function GalaxyCard({ pool }: { pool: WordPool }) {
  const [open, setOpen] = useState(false)
  const model = useMemo(() => buildGalaxy(pool), [pool])
  const empty = model.nodes.length === 0

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={empty}
        onClick={() => setOpen(true)}
      >
        <Sparkles className="size-4" />
        Prévisualisation graphique
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="h-[85vh] max-w-5xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-4 py-2.5">
            <DialogTitle className="text-base">
              Galaxie des imputations
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            {open && <GalaxyView model={model} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

Note : `GalaxyView` (et d3) n'est instancié que quand `open` est vrai → chargement
paresseux effectif.

### 2. `FacturationBoard` — monter la card en haut du rail droit

Dans le rail droit (`aside` de droite), AVANT le titre « Imputation comptable »,
insérer `<GalaxyCard pool={pool} />`. `pool` existe déjà dans le composant.

Vérifier que l'`aside` droit devient un conteneur `flex flex-col gap-…` pour
empiler la card puis le panneau.

## Ordre d'exécution

1. `GalaxyCard.tsx`.
2. Monter dans `FacturationBoard` (rail droit, au-dessus d'Imputation comptable).
3. `npx tsc --noEmit`.

## Critère de validation

- Card visible en haut à droite ; bouble désactivé si le pool est vide.
- Le clic ouvre le modal ; d3 se charge alors (chunk séparé) ; la galaxie s'affiche.
- Fermer/rouvrir fonctionne.
