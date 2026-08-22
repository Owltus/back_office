import { useRef, type ReactNode } from 'react'
import { Printer } from 'lucide-react'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { usePrintShortcut } from '#/components/shared/usePrintShortcut.ts'
import {
  useResponsiveShell,
  isTouchDeviceNow,
} from '#/components/shared/useResponsiveShell.ts'
import { MobileToolbar, ToolbarCell } from '#/components/shared/MobileToolbar.tsx'
import { useNavbarSubtitle } from '#/lib/navbarSubtitle.ts'
import { AnalytiqueSkeleton } from '#/components/analytique/AnalytiqueSkeleton.tsx'
import { printAnalytique } from '#/lib/analytique/pdf.ts'
import { cn } from '#/lib/utils.ts'

// `ToolbarCell` vit désormais dans `shared/MobileToolbar.tsx` (socle commun à
// toutes les pages, pas seulement analytique) — ré-exporté ici pour ne rien
// casser des imports existants (`RaproAnalytiqueBoard.tsx`, `RaproMonthlyBoard.tsx`
// l'importent depuis ce fichier).
export { ToolbarCell }

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
 * pages analytique (repjour/PDJ/parking/caisse) qui ne les activent pas — les
 * deux seuils ci-dessous (`isNavbarMobile`, `isTouchDevice`) sont TOUJOURS
 * calculés (un Hook ne peut pas être conditionnel) mais ne changent le rendu
 * QUE si le board a fourni `mobileIdentity`/`mobileToolbar` ; sinon ils restent
 * inutilisés.
 * `mobileIdentity` déplace un contenu (fourni par le board, PAS forcément égal
 * à `title` — ex. « Analytique 2026 » quand `title` reste « Analytique » sur
 * l'en-tête desktop, où l'année est déjà visible à côté via YearNav) en
 * sous-titre de la Navbar globale sous 1024px (voir lib/navbarSubtitle.ts) —
 * seuil VOLONTAIREMENT identique à celui de la Navbar elle-même (hamburger ↔
 * onglets, fixe pour toute l'app), PAS celui, indépendant, de la grille
 * chambres/KPI (768px, rapro.css — un essai d'alignement dessus a été fait
 * puis abandonné) : la Navbar doit rester COMPLÈTE tout du long de sa propre
 * plage en mode hamburger, quelle que soit la densité déjà affichée par la
 * grille en dessous — l'année/le mois n'y est sinon plus visible nulle part,
 * la barre basse ayant remplacé le `YearNav`/bouton retour de l'en-tête.
 * `mobileToolbar` remplace les `actions` de l'en-tête par une barre d'outils
 * basse fixe sur ÉCRAN TACTILE (`(hover:none) and (pointer:coarse)`, PAS une
 * largeur — une tablette tactile large a la barre basse comme un téléphone ;
 * un ordinateur en fenêtre étroite garde la barre du haut), à laquelle le
 * shell fournit sa propre cellule Imprimer (le board place les siennes autour).
 */
export function AnalytiqueShell({
  title,
  actions,
  loading = false,
  skeleton,
  printTitle,
  mobileIdentity,
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
  /** Sous 1024px, déplace ce contenu dans la Navbar globale (sous-titre de
   *  page) et retire `title` de l'en-tête — même mécanisme que /rapro. N'est
   *  PAS forcément égal à `title` : la vue annuelle passe ici « Analytique
   *  2026 » alors que `title` reste « Analytique » sur l'en-tête desktop, où
   *  l'année est déjà visible via YearNav — sur la Navbar (mobile), c'est le
   *  seul endroit qui la montre encore, la barre basse ayant remplacé le
   *  `YearNav`/bouton retour de l'en-tête. Absent (défaut) : comportement
   *  actuel inchangé. */
  mobileIdentity?: ReactNode
  /** Cellules PROPRES au board (navigation temporelle, retour…) pour la barre
   *  d'outils basse fixe sur écran tactile ; reçoit la cellule Imprimer déjà
   *  construite par le shell (`null` si `printTitle` absent) à placer où le
   *  board veut. Absent (défaut) : pas de barre basse, `actions` reste dans
   *  l'en-tête à toutes les tailles — comportement actuel inchangé. */
  mobileToolbar?: (printCell: ReactNode | null) => ReactNode
  children: ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const { isNavbarMobile, isTouchDevice } = useResponsiveShell()
  // GATÉ par `isNavbarMobile` (≠ posé inconditionnellement) : sans ce garde,
  // le sous-titre resterait posé même quand la Navbar n'en montre plus rien
  // (≥ 1024px), un résidu qui ne se nettoierait qu'au démontage complet du
  // composant plutôt qu'au bon moment.
  useNavbarSubtitle(isNavbarMobile ? (mobileIdentity ?? null) : null)

  const handlePrint = () => {
    const root = rootRef.current
    if (!printTitle || loading || !root) return
    // Ouverture SYNCHRONE (avant l'await de printAnalytique) : un window.open()
    // lancé après un await sort du geste utilisateur aux yeux du bloqueur de
    // popups, qui le bloquerait silencieusement. Seul le tactile en a besoin
    // (l'iframe cachée + autoPrint marche déjà sur ordinateur) — détecté par
    // pointeur, pas par largeur d'écran, pour ne pas casser un navigateur de
    // bureau redimensionné en fenêtre étroite.
    const printWindow = isTouchDeviceNow() ? window.open('', '_blank') : null
    void printAnalytique(root, printTitle, printWindow)
  }
  usePrintShortcut(handlePrint)

  // Bouton d'impression placé AVANT les actions du board : la navigation
  // temporelle (YearNav) reste collée au bord droit, comme le veut la convention.
  //
  // `max-sm:size-11` seulement quand ce bouton reste le SEUL affichage mobile
  // de la page (les 8 boards sans `mobileToolbar`, où il peut réellement
  // apparaître sur un téléphone sous 640px). Sur Rapro (`mobileToolbar`
  // fourni), ce bouton d'en-tête est garanti non-tactile (remplacé par sa
  // propre cellule dans la barre basse dès qu'un doigt est détecté) :
  // l'agrandir au rétrécissement de fenêtre désaccorderait sa taille de celle
  // du bouton Retour/StepNav voisin, restés fixes pour la même raison.
  const headerActions =
    printTitle != null ? (
      <>
        <PrintButton
          onClick={handlePrint}
          disabled={loading}
          iconOnly
          className={mobileToolbar ? undefined : 'max-sm:size-11'}
          tipLabel={loading ? 'Chargement des données…' : 'Imprimer / PDF'}
        />
        {actions}
      </>
    ) : (
      actions
    )
  // Sur écran tactile, une barre basse remplace les actions de l'en-tête
  // (comme /rapro) : `undefined`, pas un masquage CSS, pour que PageHeader
  // sorte vraiment du flux s'il ne reste plus rien à afficher (cf.
  // shared/PageHeader.tsx).
  const desktopActions =
    mobileToolbar && isTouchDevice ? undefined : headerActions

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
          mobileToolbar && isTouchDevice && 'pb-20',
        )}
      >
        <PageHeader
          title={mobileIdentity != null && isNavbarMobile ? undefined : title}
          actions={desktopActions}
          // "end" quand `mobileToolbar` est fourni : ce groupe n'existe alors
          // que côté souris (remplacé par la barre basse sur écran tactile),
          // le repli « aux deux bords » pensé pour le pouce n'a plus de sens.
          actionsAlign={mobileToolbar ? 'end' : 'responsive'}
        />
        {loading ? <AnalytiqueSkeleton {...skeleton} /> : children}
      </div>
      <MobileToolbar visible={Boolean(mobileToolbar) && isTouchDevice}>
        {mobileToolbar?.(printToolbarCell)}
      </MobileToolbar>
    </PageContainer>
  )
}
