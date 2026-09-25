import { useCallback, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Search } from 'lucide-react'

import { Input } from '#/components/ui/input.tsx'
import { iconEntries } from '#/lib/classeur/naming.ts'
import { cn } from '#/lib/utils.ts'

/** Icônes rendues par lot (7 colonnes × 18 lignes) : la bibliothèque en compte plus de 1 500. */
const PAGE_SIZE = 126

/**
 * Sélecteur d'icône Lucide — porté de Registre (`components/IconPicker.tsx`).
 * Recherche par nom, grille à chargement progressif au défilement, l'icône
 * retenue mise en avant. Le nom Lucide est ce qui part en base (`icon`).
 */
export function IconPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (name: string) => void
}) {
  const [search, setSearch] = useState('')
  const gridRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q === '') return iconEntries
    return iconEntries.filter(([name]) => name.toLowerCase().includes(q))
  }, [search])

  // Assez de lots pour que l'icône déjà choisie soit visible d'emblée.
  const [visibleCount, setVisibleCount] = useState(() => {
    const idx = iconEntries.findIndex(([name]) => name === value)
    return idx >= PAGE_SIZE ? idx + PAGE_SIZE : PAGE_SIZE
  })

  const handleSearch = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setVisibleCount(PAGE_SIZE)
  }, [])

  const handleScroll = useCallback(() => {
    const el = gridRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filtered.length))
    }
  }, [filtered.length])

  // Ref de rappel : centre l'icône choisie à l'ouverture, sans effet.
  const selectedRef = useCallback((node: HTMLButtonElement | null) => {
    node?.scrollIntoView({ block: 'center' })
  }, [])

  const visible = filtered.slice(0, visibleCount)
  const pluriel = filtered.length > 1 ? 's' : ''

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={search}
          onChange={handleSearch}
          placeholder="Rechercher une icône"
          aria-label="Rechercher une icône"
          className="h-8 pl-8 text-sm"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} icône{pluriel}
        {search.trim() !== '' && ` trouvée${pluriel}`}
      </p>

      <div
        ref={gridRef}
        onScroll={handleScroll}
        className="h-56 overflow-y-auto rounded-md border border-input p-2"
      >
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Aucune icône ne correspond.
          </p>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {visible.map(([name, IconComp]) => (
              <button
                key={name}
                ref={name === value ? selectedRef : undefined}
                type="button"
                onClick={() => onChange(name)}
                title={name}
                aria-label={name}
                aria-pressed={value === name}
                className={cn(
                  'flex items-center justify-center rounded-md p-2 transition-colors',
                  value === name
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <IconComp className="size-5" />
              </button>
            ))}
          </div>
        )}
      </div>

      {value !== '' && (
        <p className="text-xs text-muted-foreground">
          Sélection :{' '}
          <span className="font-medium text-foreground">{value}</span>
        </p>
      )}
    </div>
  )
}
