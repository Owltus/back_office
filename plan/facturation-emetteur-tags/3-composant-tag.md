# Étape 3 — Composant `Tag` réutilisable

## Objectif

Fournir une pastille de domaine réutilisable (colorée par tag) pour afficher les
tags dans le modal — et potentiellement ailleurs (rail droit, filtres).

## Contexte

Aucun `badge`/`chip`/`tag` n'existe dans `ui/` ni `shared/`. Le patron de style de
référence du projet est `src/components/shared/LockBadge.tsx` (`rounded-full`, bord
+ fond teinté `/10`, texte teinté). Les classes Tailwind ne peuvent pas être
générées dynamiquement (purge) → il faut une **table statique** de classes
littérales par tag (D6).

## Fichier(s) impacté(s)

- `src/components/facturation/Tag.tsx` (nouveau)

## Travail à réaliser

### 1. `Tag.tsx` — pastille + table de couleurs

```tsx
import { cn } from '#/lib/utils.ts'

/*
 * Pastille de domaine (tag) pour la facturation. Style calqué sur LockBadge
 * (rounded-full, bord + fond teinté). Couleurs en table STATIQUE : les classes
 * Tailwind doivent être littérales pour survivre au purge. Un tag inconnu retombe
 * sur une teinte neutre.
 */
const TAG_COLORS: Record<string, string> = {
  Technique: 'border-slate-400/30 bg-slate-400/10 text-slate-300',
  'Énergie & fluides': 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  Hébergement: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  Restauration: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  'IT & logiciels': 'border-violet-500/30 bg-violet-500/10 text-violet-400',
  Administratif: 'border-zinc-400/30 bg-zinc-400/10 text-zinc-300',
  RH: 'border-teal-500/30 bg-teal-500/10 text-teal-400',
  Commercial: 'border-pink-500/30 bg-pink-500/10 text-pink-400',
  Finance: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  Prestataires: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400',
  Déplacements: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
  Location: 'border-lime-500/30 bg-lime-500/10 text-lime-400',
  'Revenus annexes': 'border-rose-500/30 bg-rose-500/10 text-rose-400',
}
const NEUTRAL = 'border-border bg-secondary/40 text-muted-foreground'

export function Tag({
  label,
  active,
  onClick,
  className,
}: {
  label: string
  active?: boolean
  onClick?: () => void
  className?: string
}) {
  const tone = TAG_COLORS[label] ?? NEUTRAL
  const base =
    'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none'
  if (!onClick) {
    return <span className={cn(base, tone, className)}>{label}</span>
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        base,
        'transition-colors',
        active ? tone : 'border-border text-muted-foreground hover:bg-secondary/60',
        className,
      )}
    >
      {label}
    </button>
  )
}
```

Le composant sert **deux usages** : `<Tag label>` (affichage passif sur une ligne)
et `<Tag label onClick active>` (chip cliquable de la barre de filtre — teinté si
actif, neutre sinon).

## Ordre d'exécution

1. Créer `Tag.tsx`.
2. `npx tsc --noEmit`.

## Critère de validation

- `tsc` vert.
- `<Tag label="Technique" />` rend une pastille teintée ; un label hors table rend
  la teinte neutre (pas de classe manquante).
- Les classes de `TAG_COLORS` sont toutes littérales (aucune interpolation).
