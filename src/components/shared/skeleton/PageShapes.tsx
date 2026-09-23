import { Skeleton } from '#/components/ui/skeleton.tsx'
import { ALL_ROOMS } from '#/lib/hotel/rooms.ts'

/*
 * Silhouettes de chargement PAR PAGE.
 *
 * POURQUOI — mesure du 2026-09-23. Le squelette de route dessinait la même
 * forme (4 cartes + tableau de 8 lignes) sur TOUTES les pages, soit 789 px
 * partout. Écart avec le contenu réel, mesuré page par page :
 *
 *   /pdj                  789 -> 1 243 px   (+58 %)
 *   /repjour/analytique   789 -> 1 249 px   (+58 %, en deux temps)
 *   /repjour              789 -> 1 044 px   (+32 %)
 *   /caisse               789 -> 1 015 px   (+29 %)
 *   /literie              789 ->   877 px   (+11 %)
 *   /rapro                789 ->   809 px   (+2 %)
 *   /parking              789 ->   789 px   (0)
 *
 * COMMENT — ces silhouettes réutilisent les VRAIES classes de mise en page
 * (`pdj-stats-grid`, `pdj-floors`, `literie-floors`, `caisse-denoms`…). C'est
 * possible parce que toutes les feuilles de `src/styles/` sont chaînées depuis
 * `styles.css`, donc présentes dans la feuille GLOBALE — pas dans le chunk de
 * la page. Le squelette obtient ainsi les mêmes paddings, les mêmes hauteurs de
 * ligne et la même grille que le contenu, sans importer une ligne de code de
 * board (ce qui annulerait le découpage par route).
 *
 * ⚠ UNE SEULE SILHOUETTE PAR PAGE — la règle qui a coûté le plus cher.
 * Chaque board avait son propre squelette local ET recevait celui de la route.
 * Les deux dérivaient en silence : sur /pdj, 4 cellules par ligne contre 5
 * (215 px manquants) ; sur /repjour, 3 cartes sur `sm:grid-cols-3` contre 4 sur
 * `sm:grid-cols-4`, de sorte que la rangée passait de 4 à 3 puis à 4 colonnes
 * sous les yeux de l'utilisateur. Les boards DÉLÈGUENT donc tous ici. Ne jamais
 * réécrire une silhouette dans un board : la corriger ici.
 *
 * ⚠ Ces silhouettes restent des RÉFLEXIONS : si un board change de structure,
 * elles dérivent. Le garde-fou est `PageShapes.test.tsx`, qui RÉALISE le rendu
 * et compte les éléments (tuiles, colonnes, lignes, étages) — un test qui peut
 * réellement échouer, contrairement au précédent qui ne vérifiait qu'une
 * partition de `ALL_ROOMS` par elle-même.
 */

/**
 * Espace de chasse nulle (U+200B), placé dans chaque cellule du squelette.
 *
 * ⚠ Ce n'est pas une coquetterie : c'est lui qui donne sa HAUTEUR à la ligne.
 * Une vraie cellule contient du TEXTE, donc une boîte de ligne à l'interligne
 * hérité. Une cellule qui ne contient qu'une barre de squelette de 12 px
 * produit une boîte de 12 px — d'où 27,2 px de ligne contre 35,5 px en vrai, et
 * 215 px manquants sur la page PDJ.
 *
 * Un caractère invisible rétablit la boîte de ligne du texte ; la barre, rendue
 * `inline-block`, s'y aligne sans la dépasser. La hauteur suit donc toute
 * évolution de la police ou de l'interligne, ce qu'un `h-[35px]` codé en dur
 * n'aurait pas fait.
 *
 * ⚠ ÉCRIT ÉCHAPPÉ, jamais en littéral. Un U+200B brut dans la source est
 * invisible en revue, s'affiche comme une chaîne vide dans `git diff`, et
 * disparaît sans bruit au premier « trim on save », coup de `prettier` mal
 * configuré ou `sed` de nettoyage — emportant avec lui 215 px de fidélité.
 */
const CALE_LIGNE = '\u200B'

/** Cellule de tableau en squelette : barre + cale de ligne (cf. `CALE_LIGNE`). */
function CelluleSquelette({
  className,
  largeur,
}: {
  className: string
  largeur: string
}) {
  return (
    <td className={className}>
      <Skeleton className={`inline-block h-3 align-middle ${largeur}`} />
      {CALE_LIGNE}
    </td>
  )
}

/**
 * Une tuile de statistique en squelette, aux VRAIES classes (`stat-tile`,
 * `stat-tile__body`, `stat-tile__label`).
 *
 * ⚠ `stat-tile__label` n'a AUCUNE règle écran (sa seule définition est dans un
 * `@media print`) : les utilitaires de typographie repris ici de `StatTile`
 * sont ce qui donne réellement sa hauteur au label. Reprendre la classe seule
 * ne garantirait rien.
 *
 * Exportée parce qu'elle sert partout : silhouettes PDJ et RepJour, bande de
 * synthèse transverse, cartes analytiques. Les avoir écrites séparément est
 * exactement ce qui a laissé diverger les squelettes (mesuré : 60 px contre
 * 77,8 px pour la vraie tuile).
 */
export function TuileSquelette({ sub = true }: { sub?: boolean }) {
  return (
    <div className="stat-tile flex items-stretch overflow-hidden rounded-xl border border-border bg-card">
      <span className="w-2 shrink-0 bg-muted" />
      <div className="stat-tile__body flex min-w-0 flex-1 flex-col gap-1 px-3 py-[0.55rem]">
        <span className="stat-tile__label text-[0.6rem] font-semibold uppercase leading-[1.15] tracking-[0.03em] text-muted-foreground">
          <Skeleton className="inline-block h-2.5 w-16 align-middle" />
          {CALE_LIGNE}
        </span>
        <div className="flex flex-1 flex-col justify-center gap-1">
          <Skeleton className="h-6 w-12" />
          {sub && <Skeleton className="h-3 w-20" />}
        </div>
      </div>
    </div>
  )
}

/**
 * Un bloc de la bande de synthèse transverse : un titre puis une rangée de
 * tuiles. Relevé en production le 2026-09-23 : 105 px par bloc.
 *
 * ⚠ Sert au squelette de route ET à `DayCrossSummary` lui-même, qui rendait
 * `null` pendant le chargement de ses dix lectures — d'où une section de
 * 346 px qui surgissait APRÈS que la page semblait finie.
 */
export function BlocBandeSquelette({ tuiles = 4 }: { tuiles?: number }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-3 w-32" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {Array.from({ length: tuiles }).map((_, i) => (
          <TuileSquelette key={i} />
        ))}
      </div>
    </div>
  )
}

/** Chambres par étage, dérivées de l'inventaire réel — jamais codées en dur. */
export const CHAMBRES_PAR_ETAGE = [
  ...new Set(ALL_ROOMS.map((r) => Math.floor(r / 100))),
].map((etage) => ALL_ROOMS.filter((r) => Math.floor(r / 100) === etage).length)

/**
 * `/pdj` — rangée de six tuiles puis les tableaux par étage.
 *
 * ⚠ Renvoie un FRAGMENT de deux éléments, pas un `<div>` englobant. Le
 * conteneur réel (`.pdj-doc`) est un `flex flex-col gap-5` dont `.pdj-stats` et
 * `.pdj-floors` sont deux enfants DIRECTS : les enfermer dans un `<div>` nu
 * annulait le `gap-5` et réintroduisait 20 px de saut. Les appelants doivent
 * donc fournir un parent en `gap-5` (le board l'a déjà, le squelette de route
 * le pose explicitement).
 *
 * ⚠ ÉCART CONNU, tablette portrait (768-1023 px). Le vrai contenu n'affiche que
 * CINQ tuiles ET pose `pdj-stats-grid--tablet-portrait`, qui fait passer la
 * grille à 5 colonnes — soit un seul rang. Le squelette, à six tuiles sans la
 * classe, reste sur 3 colonnes, donc DEUX rangs : ~90 px de trop qui
 * disparaissent au chargement. Corriger cela demande de connaître la largeur au
 * rendu, ce que le squelette de route ne peut pas faire avant l'hydratation
 * sans rouvrir l'erreur React #418. `tabletPortrait` permet au BOARD (monté
 * après hydratation, donc libre) de rendre la bonne forme.
 */
export function FormePdj({
  tabletPortrait = false,
}: {
  tabletPortrait?: boolean
}) {
  return (
    <>
      <div className="pdj-stats" aria-hidden="true">
        <div
          className={`pdj-stats-grid${tabletPortrait ? ' pdj-stats-grid--tablet-portrait' : ''}`}
        >
          {Array.from({ length: tabletPortrait ? 5 : 6 }).map((_, i) => (
            <TuileSquelette key={i} />
          ))}
        </div>
      </div>
      <div className="pdj-floors" aria-hidden="true">
        {CHAMBRES_PAR_ETAGE.map((nb, i) => (
          <div key={i} className="pdj-floor">
            <table>
              <tbody>
                {Array.from({ length: nb }).map((_, r) => (
                  /* CINQ cellules, comme la vraie ligne. L'ancienne silhouette
                     n'en dessinait que quatre : elle omettait la colonne des
                     cases à cocher, qui est justement l'élément le plus HAUT de
                     la ligne. Mesuré le 2026-09-23 : vraie ligne 35,5 px,
                     silhouette 26,4 px — soit 215 px manquants sur la page. */
                  <tr key={r}>
                    <CelluleSquelette className="pdj-room" largeur="w-8" />
                    <CelluleSquelette className="pdj-name" largeur="w-24" />
                    <CelluleSquelette
                      className="pdj-c pdj-status"
                      largeur="w-4"
                    />
                    <CelluleSquelette
                      className="pdj-c pdj-stay-count"
                      largeur="w-6"
                    />
                    <CelluleSquelette className="pdj-c" largeur="w-6" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </>
  )
}

/**
 * `/repjour` — la page d'accueil, et la plus composite.
 *
 * Structure RELEVÉE en production le 2026-09-23, section par section, au lieu
 * d'être devinée (ma première silhouette faisait 419 px pour 1 206 px de
 * contenu — elle omettait purement et simplement la bande transverse) :
 *
 *   cartes de synthèse                78 px   (grille de QUATRE, pas trois)
 *   barre de progression du mois      66 px
 *   tableau KPI                      293 px   (+ mention « Montants TTC »)
 *   bande de synthèse transverse     346 px   (3 blocs de 105 px)
 *   pavé d'import                    194 px   volontairement NON dessiné
 *
 * ⚠ Aucune « barre de date » : elle n'existe pas dans le DOM réel. La date est
 * le `title` du `PageHeader`, déjà dessiné au-dessus. J'en avais mis une de
 * 32 px, relevée à l'œil sur une capture — une section fantôme de 48 px avec
 * son gap.
 *
 * ⚠ Le pavé d'import n'est PAS modélisé : il n'apparaît que le jour d'import et
 * seulement pour un compte qui en a le droit. Une section de 194 px qui
 * disparaîtrait à l'arrivée des données serait pire que son absence.
 *
 * ⚠ `bande` applique la MÊME règle à la bande transverse, qui est elle aussi
 * conditionnelle (`DayCrossSummary` : un bloc par droit accordé, `null` si
 * aucun). Le board, qui connaît les droits, passe la liste réelle ; le
 * squelette de route, qui tourne avant leur résolution, garde `[4, 3, 4]` —
 * le cas de tous les comptes de l'hôtel sauf exception.
 */
export function FormeRepjour({
  bande = [4, 3, 4],
}: {
  bande?: number[] | null
}) {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="space-y-3">
        {/* Cartes de synthèse : QUATRE colonnes, 78 px — mesuré. Les quatre
            `StatTile` de `SummaryCards` sont INCONDITIONNELLES (celle « Pris
            depuis la veille » affiche un tiret quand il n'y a rien à comparer,
            elle ne disparaît pas) : le squelette du board en dessinait trois
            sur `sm:grid-cols-3` en invoquant une option qui n'existe plus. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <TuileSquelette key={i} />
          ))}
        </div>
        {/* Barre de progression du mois (66 px). */}
        <div className="space-y-2 rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm sm:px-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-2 flex-1 rounded-full" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-16" />
            ))}
          </div>
        </div>
      </div>

      {/* Tableau KPI : cinq lignes de valeurs dans son cadre, puis la mention
          « Montants TTC » (25 px) que la silhouette omettait. */}
      <div className="rounded-xl border border-border bg-card p-2 sm:p-3">
        <div className="flex items-center gap-4 px-1 py-2">
          <Skeleton className="h-3.5 w-24" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="ml-auto h-3.5 w-12" />
          ))}
        </div>
        <div className="divide-y divide-border/50">
          {Array.from({ length: 5 }).map((_, r) => (
            <div key={r} className="flex items-center gap-4 px-1 py-2.5">
              <Skeleton className="h-3.5 w-28" />
              {Array.from({ length: 5 }).map((_col, c) => (
                <Skeleton key={c} className="ml-auto h-3.5 w-12" />
              ))}
            </div>
          ))}
        </div>
        <Skeleton className="mt-2 h-3 w-28" />
      </div>

      {/* Bande de synthèse transverse : un bloc par droit accordé, avec
          respectivement 4, 3 et 4 tuiles — relevé en production. */}
      {bande && bande.length > 0 && (
        <section className="space-y-4">
          {bande.map((nb, b) => (
            <BlocBandeSquelette key={b} tuiles={nb} />
          ))}
        </section>
      )}
    </div>
  )
}

/**
 * `/caisse` — feuille de caisse.
 *
 * ⚠ RELEVÉE sur le DOM réel le 2026-09-24. La version précédente était dessinée
 * à vue et ne ressemblait à rien de la page : un bandeau d'état pleine largeur
 * qui n'existe pas (le `LockBadge` est un badge DANS l'en-tête), deux colonnes
 * de saisie à la place d'une table unique, et des cases de comptage de 36 px
 * pour des cellules qui en font 88 — sans la carte Commentaires, pourtant
 * extensible en `flex-1`.
 *
 * Structure réelle, trois enfants flex du conteneur `gap-4` :
 *   1. table des montants : `thead` + 3 lignes de saisie + 1 ligne d'écarts
 *   2. carte de comptage : `caisse-denoms`, 15 cellules de `h-[5.5rem]`
 *   3. carte Commentaires : `flex-1`, plancher `min-h-16`
 *
 * `cols` = nombre de colonnes de paiement. La colonne « Carte web / Adyen »
 * n'existe que le matin et le soir (`paymentColumns`), d'où 4 par défaut (le
 * cas des deux tiers des shifts) et 3 pour la nuit. Le board, qui connaît le
 * shift affiché, passe la vraie valeur.
 *
 * La carte Cautions n'est PAS dessinée : elle n'apparaît que s'il existe une
 * caution active — même règle que le pavé d'import de RepJour.
 */
export function FormeCaisse({ cols = 4 }: { cols?: number }) {
  return (
    <>
      <div
        className="caisse-table overflow-x-auto rounded-xl border border-border bg-card"
        aria-hidden="true"
      >
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-muted-foreground">
              <th className="w-32 px-3 py-1.5 text-left font-medium">
                <Skeleton className="inline-block h-3 w-14 align-middle" />
                {CALE_LIGNE}
              </th>
              {Array.from({ length: cols }).map((_, c) => (
                <th key={c} className="px-3 py-1.5 text-center font-medium">
                  <Skeleton className="inline-block h-3 w-16 align-middle" />
                  {CALE_LIGNE}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 3 }).map((_, r) => (
              <tr key={r} className="border-b border-border/60">
                <td className="px-3 py-2">
                  <Skeleton className="h-4 w-24" />
                </td>
                {Array.from({ length: cols }).map((_col, c) => (
                  <td key={c} className="px-2 py-1">
                    <Skeleton className="h-9 w-full rounded-md" />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-border bg-muted/30">
              <td className="px-3 py-1.5">
                <Skeleton className="h-4 w-16" />
              </td>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} className="px-3 py-1.5">
                  <Skeleton className="ml-auto h-4 w-12" />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div
        className="rounded-xl border border-border bg-card p-3"
        aria-hidden="true"
      >
        {/* 15 coupures (`DENOMINATIONS`), cellules de 5,5rem — pas 15 barres de
            36 px. Le 500 € occupe deux colonnes sur mobile, comme en vrai. */}
        <div className="caisse-denoms grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-flow-col lg:grid-cols-5 lg:grid-rows-3">
          {Array.from({ length: 15 }).map((_, i) => (
            <Skeleton
              key={i}
              className={`h-[5.5rem] rounded-lg${i === 0 ? ' col-span-2 sm:col-span-1' : ''}`}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>

      {/* Zone commentaire FLEXIBLE : même bornage que le contenu réel
          (`flex-1` + plancher) pour ne rien décaler au passage au contenu. */}
      <div
        className="flex flex-1 flex-col rounded-xl border border-border bg-card p-3"
        aria-hidden="true"
      >
        <Skeleton className="mb-2 h-4 w-28" />
        <Skeleton className="min-h-16 w-full flex-1 rounded-md" />
      </div>
    </>
  )
}

/**
 * `/literie` — literie anti-allergène.
 *
 * ⚠ ENTIÈREMENT RÉÉCRITE le 2026-09-24. La version précédente dessinait quatre
 * cartes de stock et un tableau de huit lignes : **aucun des deux n'existe sur
 * cette page**. Le suivi de stock a été retiré du board, et le contenu réel est
 * une grille `literie-floors` de six cartes d'étage portant les 80 pastilles de
 * chambre, une légende, puis le planning des lits bébé ENTIER — plusieurs
 * centaines de pixels qui n'étaient pas modélisés du tout.
 *
 * Le planning des lits bébé est dimensionné comme le sien propre :
 * `HEADER_H + max(4, lits) × ROW_H`, soit 44 + 4 × 44 = 220 px au plancher.
 */
const BABYCOT_HEADER_H = 44
const BABYCOT_ROW_H = 44
const BABYCOT_LITS_PLANCHER = 4

export function FormeLiterie() {
  return (
    <>
      <div className="literie-floors" aria-hidden="true">
        {CHAMBRES_PAR_ETAGE.map((nb, i) => (
          <div key={i} className="literie-floor">
            <div className="literie-floor-head">
              <span className="literie-floor-title">
                <Skeleton className="inline-block h-3 w-12 align-middle" />
                {CALE_LIGNE}
              </span>
            </div>
            <div className="literie-rooms">
              {Array.from({ length: nb }).map((_, r) => (
                <span key={r} className="literie-room">
                  <Skeleton className="h-3 w-8" />
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Légende (souris + plume/synthétique). */}
      <div
        className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs"
        aria-hidden="true"
      >
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-40" />
      </div>

      {/* Planning des lits bébé : en-tête, grille, légende. */}
      <div className="flex min-w-0 flex-1 flex-col gap-4" aria-hidden="true">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-7 w-52" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Skeleton className="size-8 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </div>
        <Skeleton
          className="w-full rounded-2xl"
          style={{
            height:
              BABYCOT_HEADER_H + BABYCOT_LITS_PLANCHER * BABYCOT_ROW_H,
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs">
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
    </>
  )
}

/**
 * `/profil` — colonne étroite : carte d'identité puis TROIS cartes de
 * formulaire, et le bouton d'enregistrement.
 *
 * ⚠ La page ne rend AUCUN `PageHeader` : le squelette de route lui en dessinait
 * un, soit une ligne fantôme de 36 px plus 24 px d'espacement. Et les deux
 * silhouettes existantes (route et board) omettaient des cartes — la route deux
 * sur trois, le board celle « Ordre de mes pages ». Une seule ici, complète.
 */
export function FormeProfil() {
  return (
    <div className="mx-auto w-full max-w-lg space-y-6" aria-hidden="true">
      {/* Identité : avatar, nom, e-mail, pastille de rôle. */}
      <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-6">
        <Skeleton className="size-14 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-52" />
          <Skeleton className="h-4 w-20 rounded-full" />
        </div>
      </div>

      {/* Informations personnelles : titre + Prénom / Nom. */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-4 w-44" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ))}
        </div>
      </div>

      {/* Ordre de mes pages : titre + paragraphe + liste ordonnable. */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-6">
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      </div>

      {/* Mot de passe : titre + deux champs + rappel + 5 critères. */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-4 w-48" />
        <div className="space-y-2">
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-3 w-52" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-32" />
            ))}
          </div>
        </div>
      </div>

      <Skeleton className="h-11 w-full rounded-md" />
    </div>
  )
}
