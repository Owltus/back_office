import { useRef, type ReactNode } from 'react'
import { Printer } from 'lucide-react'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { usePrintShortcut } from '#/components/shared/usePrintShortcut.ts'
import { useMatchMedia } from '#/components/shared/useMatchMedia.ts'
import { useNavbarSubtitle } from '#/lib/navbarSubtitle.ts'
import { AnalytiqueSkeleton } from '#/components/analytique/AnalytiqueSkeleton.tsx'
import { printAnalytique } from '#/lib/analytique/pdf.ts'
import { cn } from '#/lib/utils.ts'

/**
 * Cellule de la barre d'outils basse mobile : icône au-dessus du libellé,
 * `flex-1`, même gabarit que la barre basse de /rapro (première page à
 * l'avoir reçue). Partagée par le shell (cellule Imprimer, voir
 * `mobileToolbar` ci-dessous) et par les boards qui l'activent (leurs propres
 * cellules de navigation).
 */
export function ToolbarCell({
  icon,
  label,
  onClick,
  disabled = false,
  ariaLabel,
  bordered = true,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  ariaLabel: string
  /** Filet vertical à gauche de la cellule — faux pour la 1re cellule d'une barre. */
  bordered?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-muted-foreground transition-colors active:bg-accent active:text-foreground disabled:pointer-events-none disabled:opacity-40',
        bordered && 'border-l border-border',
      )}
    >
      {icon}
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  )
}

/*
 * Coquille commune des pages analytique (parentes annuelles ET enfants mensuelles).
 *
 * Possède le layout partagé : `PageContainer`, colonne flex, `PageHeader` (titre +
 * actions), et la branche de chargement (squelette reflet du layout). Chaque board
 * ne fournit QUE son contenu (cartes, tableau, graphiques) via `children` — une
 * modification de mise en page se fait donc ici, une seule fois, pour les 10 pages.
 *
 * IMPRESSION : `printTitle` active le bouton « Imprimer / PDF » (icône seule, et
 * Ctrl/Cmd+P), commun aux boards. Le PDF est bâti par `printAnalytique`, qui LIT le
 * contenu déjà rendu sous `rootRef` (cartes → tableau → graphes) — une seule
 * mécanique pour toutes les pages analytique, présentes et futures. Le document
 * reflète la page : cartes, puis TOUS les mois / jours, puis le(s) graphe(s).
 *
 * Bornage RESPONSIVE (`lg:min-h-0`) : sous `lg`, la page suit son flux naturel et
 * défile normalement (le tableau prend toute sa hauteur, tous les mois visibles) ;
 * à partir de `lg`, la colonne est bornée au viewport et le tableau gère son propre
 * défilement interne. Sans ce garde-fou, sur petit écran les cartes (2 lignes) et
 * les graphiques empilés (`shrink-0`) écrasaient le tableau `flex-1` à 0 — il
 * disparaissait, sans défilement pour le rattraper.
 *
 * MODE MOBILE (`mobileIdentity` / `mobileToolbar`) : mêmes mécanismes que /rapro,
 * exposés en props STRICTEMENT OPTIONNELLES pour ne rien changer aux 8 autres
 * pages analytique (repjour/PDJ/parking/caisse) qui ne les activent pas.
 * `mobileIdentity` déplace `title` en sous-titre de la Navbar globale sous
 * 1024px (voir lib/navbarSubtitle.ts) ; `mobileToolbar` remplace les `actions`
 * de l'en-tête par une barre d'outils basse fixe sous 640px, à laquelle le
 * shell fournit sa propre cellule Imprimer (le board place les siennes autour).
 */
export function AnalytiqueShell({
  title,
  actions,
  loading = false,
  skeleton,
  printTitle,
  mobileIdentity = false,
  mobileToolbar,
  children,
}: {
  title: ReactNode
  actions?: ReactNode
  loading?: boolean
  skeleton?: {
    cols?: number
    charts?: number
    rows?: number
    cards?: number
    cardCols?: number
    cardLines?: number
  }
  /** Active le bouton « Imprimer / PDF » et sert de titre au document
   *  (ex. « Caisse · 2026 »). Absent → page non imprimable, pas de bouton. */
  printTitle?: string
  /** Sous 1024px, déplace `title` dans la Navbar globale (sous-titre de page)
   *  au lieu de l'en-tête — même mécanisme que /rapro. Absent (défaut) :
   *  comportement actuel inchangé. */
  mobileIdentity?: boolean
  /** Cellules PROPRES au board (navigation temporelle, retour…) pour la barre
   *  d'outils basse fixe sous 640px ; reçoit la cellule Imprimer déjà construite
   *  par le shell (`null` si `printTitle` absent) à placer où le board veut.
   *  Absent (défaut) : pas de barre basse, `actions` reste dans l'en-tête à
   *  toutes les tailles — comportement actuel inchangé. */
  mobileToolbar?: (printCell: ReactNode | null) => ReactNode
  children: ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const isNavbarMobile = useMatchMedia('(max-width: 1023.98px)')
  const showTopToolbar = useMatchMedia('(min-width: 640px)')
  useNavbarSubtitle(mobileIdentity ? title : null)

  const handlePrint = () => {
    const root = rootRef.current
    if (!printTitle || loading || !root) return
    // Ouverture SYNCHRONE (avant l'await de printAnalytique) : un window.open()
    // lancé après un await sort du geste utilisateur aux yeux du bloqueur de
    // popups, qui le bloquerait silencieusement. Seul le tactile en a besoin
    // (l'iframe cachée + autoPrint marche déjà sur ordinateur) — détecté par
    // pointeur, pas par largeur d'écran, pour ne pas casser un navigateur de
    // bureau redimensionné en fenêtre étroite.
    const isTouchDevice = window.matchMedia(
      '(hover: none) and (pointer: coarse)',
    ).matches
    const printWindow = isTouchDevice ? window.open('', '_blank') : null
    void printAnalytique(root, printTitle, printWindow)
  }
  usePrintShortcut(handlePrint)

  // Bouton d'impression placé AVANT les actions du board : la navigation
  // temporelle (YearNav) reste collée au bord droit, comme le veut la convention.
  const headerActions =
    printTitle != null ? (
      <>
        <PrintButton
          onClick={handlePrint}
          disabled={loading}
          iconOnly
          className="max-sm:size-11"
          tipLabel={loading ? 'Chargement des données…' : 'Imprimer / PDF'}
        />
        {actions}
      </>
    ) : (
      actions
    )
  // Sous 640px, une barre basse remplace les actions de l'en-tête (comme /rapro) :
  // `undefined`, pas un masquage CSS, pour que PageHeader sorte vraiment du flux
  // s'il ne reste plus rien à afficher (cf. shared/PageHeader.tsx).
  const desktopActions =
    mobileToolbar && !showTopToolbar ? undefined : headerActions

  const printToolbarCell =
    printTitle != null ? (
      <ToolbarCell
        icon={<Printer className="size-5" />}
        label="Imprimer"
        onClick={handlePrint}
        disabled={loading}
        ariaLabel={loading ? 'Chargement des données…' : 'Imprimer / PDF'}
      />
    ) : null

  return (
    <PageContainer className="lg:min-h-0">
      <div
        ref={rootRef}
        className={cn(
          'mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 lg:min-h-0',
          mobileToolbar && 'max-sm:pb-20',
        )}
      >
        <PageHeader
          title={mobileIdentity && isNavbarMobile ? undefined : title}
          actions={desktopActions}
        />
        {loading ? <AnalytiqueSkeleton {...skeleton} /> : children}
      </div>
      {mobileToolbar && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-border bg-card/95 backdrop-blur-md sm:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {mobileToolbar(printToolbarCell)}
        </nav>
      )}
    </PageContainer>
  )
}
