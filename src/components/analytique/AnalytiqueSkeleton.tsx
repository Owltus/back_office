import { Skeleton } from '#/components/ui/skeleton.tsx'
import { TuileSquelette } from '#/components/shared/skeleton/PageShapes.tsx'
import {
  cardsGridClass,
  chartsGridClass,
} from '#/components/analytique/gridClasses.ts'
import { CHART_HEIGHT } from '#/components/analytique/chartConstants.ts'

/*
 * Squelette de chargement des pages analytique — reflet 1:1 du layout construit
 * (cartes de synthèse + tableau borné à défilement interne + graphiques), aux
 * MÊMES classes de mise en page (`shrink-0` pour cartes/graphes, `flex-1` pour le
 * tableau). Rendu à la place du contenu, DANS la colonne flex de `AnalytiqueShell`,
 * pour un chargement perçu fluide et SANS saut de layout à l'arrivée des données.
 * Purement décoratif (aria-hidden).
 *
 * ⚠ Sert AUSSI au squelette de ROUTE (`RouteSkeleton`, variante `analytique`),
 * qui dessinait jusqu'au 2026-09-24 sa propre forme : 4 cartes en `p-4`, 5
 * colonnes, 8 lignes et DEUX graphes — sur des pages qui en déclarent jusqu'à 8
 * colonnes, 31 lignes et un seul graphe. C'est `/repjour/analytique`, la page au
 * plus gros écart mesuré du chantier (+58 %), qui en pâtissait le plus. Une
 * seule silhouette désormais, paramétrée par le chemin.
 *
 * ⚠ Ses imports doivent rester LÉGERS : il entre dans le chunk d'entrée par
 * `RouteSkeleton`. D'où `gridClasses.ts` plutôt que `AnalytiqueCards`/`Charts`.
 */
export function AnalytiqueSkeleton({
  cols = 5,
  charts = 2,
  rows = 10,
  cards = 4,
  cardCols = 4,
  cardLines = 3,
}: {
  cols?: number
  charts?: number
  rows?: number
  /** Nombre de cartes de synthèse. 0 = pas de rangée de cartes.
   *
   * ⚠ L'exemple cité ici jusqu'au 2026-09-24 — « Rapro mensuel, qui n'affiche
   * aucune carte » — était PÉRIMÉ : cette page en rend quatre depuis. Le
   * commentaire décrivait un état du code disparu, ce qui est pire qu'une
   * absence de commentaire. Le cas `0` reste néanmoins utile pour toute page
   * qui n'aurait pas de rangée de cartes. */
  cards?: number
  /** Colonnes de la grille de cartes — miroir du board. 4 par défaut ; 6 pour
   * PDJ, 7 pour Parking annuel. */
  cardCols?: number
  /** Lignes par carte : 3 (label + valeur + sous-texte, cas de toutes les pages
   * actuelles) ou 2 (label + valeur seule). Évite qu'une carte squelette soit
   * plus haute que la vraie. */
  cardLines?: number
}) {
  return (
    <>
      {/* Cartes de synthèse (masquées si `cards === 0`).
          ⚠ `TuileSquelette`, pas un gabarit maison : les vraies cartes sont des
          `StatTile` (liseré + `py-[0.55rem]`, ~72 px). Le gabarit `p-4` utilisé
          ici jusqu'au 2026-09-24 en faisait ~104 px — 30 px de trop par rangée,
          et sans le liseré de couleur. C'était le dernier squelette du lot à ne
          pas avoir migré vers `stat-tile`. */}
      {cards > 0 && (
        <div className={cardsGridClass(cardCols)} aria-hidden="true">
          {Array.from({ length: cards }).map((_, i) => (
            <TuileSquelette key={i} sub={cardLines >= 3} />
          ))}
        </div>
      )}

      {/* Tableau : reflet du bornage responsive d'AnalytiqueTable (naturel sous
          lg, borné à partir de lg). */}
      <div
        className="overflow-hidden rounded-xl border border-border bg-card lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
        aria-hidden="true"
      >
        <div className="flex shrink-0 items-center gap-4 border-b border-border bg-muted px-3 py-2.5">
          <Skeleton className="h-3 w-24" />
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="ml-auto h-3 w-10" />
          ))}
        </div>
        <div className="no-scrollbar lg:min-h-0 lg:flex-1 lg:overflow-hidden">
          <div className="divide-y divide-border/50">
            {Array.from({ length: rows }).map((_row, i) => (
              <div key={i} className="flex items-center gap-4 px-3 py-2.5">
                <Skeleton className="h-3 w-24" />
                {Array.from({ length: cols }).map((_col, j) => (
                  <Skeleton key={j} className="ml-auto h-3 w-10" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Graphiques (un seul → pleine largeur, comme le board). Le titre est un
          `h3 text-sm mb-3` dans le vrai graphe : même gabarit ici. */}
      <div className={chartsGridClass(charts)} aria-hidden="true">
        {Array.from({ length: charts }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <Skeleton className="mb-3 h-5 w-40" />
            <Skeleton
              className="w-full rounded-lg"
              style={{ height: CHART_HEIGHT }}
            />
          </div>
        ))}
      </div>
    </>
  )
}

/**
 * Paramètres de silhouette d'une page analytique, déduits du CHEMIN.
 *
 * ⚠ C'est ce qui permet au squelette de ROUTE de dessiner la bonne forme avant
 * qu'aucun board ne soit monté. Les valeurs sont celles que chaque board passe
 * à `AnalytiqueSkeleton` — relevées une à une le 2026-09-24 en comptant les
 * `<th>` et les `<StatCard>` de chaque page. Toute page analytique nouvelle
 * doit être ajoutée ici, sinon elle retombe sur le repli.
 *
 * `rows` : une vue MENSUELLE liste les jours du mois (jusqu'à 31), une vue
 * ANNUELLE les douze mois. Le chemin les distingue (`/analytique/2026/9`).
 */
export function paramsAnalytique(pathname: string): {
  cols: number
  rows: number
  cards: number
  cardCols: number
  charts: number
} {
  // Une vue mensuelle porte l'année et le mois dans son chemin.
  const mensuel = /\/analytique\/\d{4}\/\d{1,2}/.test(pathname)
  const rows = mensuel ? 31 : 12

  if (pathname.startsWith('/pdj'))
    return { cols: 8, rows, cards: 6, cardCols: 6, charts: 1 }
  if (pathname.startsWith('/repjour'))
    return { cols: 7, rows, cards: 4, cardCols: 4, charts: 2 }
  if (pathname.startsWith('/parking'))
    return { cols: mensuel ? 6 : 7, rows, cards: 4, cardCols: 4, charts: 1 }
  if (pathname.startsWith('/caisse'))
    return { cols: 6, rows, cards: 4, cardCols: 4, charts: 1 }
  if (pathname.startsWith('/rapro'))
    return { cols: 5, rows, cards: 4, cardCols: 4, charts: 1 }

  // Repli : la forme la plus courante (4 cartes, un graphe).
  return { cols: 6, rows, cards: 4, cardCols: 4, charts: 1 }
}
