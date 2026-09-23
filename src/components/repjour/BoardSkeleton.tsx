import { useAuth } from '#/components/auth/AuthContext.tsx'
import { FormeRepjour } from '#/components/shared/skeleton/PageShapes.tsx'

/**
 * Squelette de chargement du dashboard repjour (rapport journalier).
 *
 * ⚠ DÉLÈGUE à `FormeRepjour` depuis le 2026-09-24, et ce n'est pas cosmétique.
 * Il existait DEUX silhouettes de la même page — celle du squelette de route et
 * celle-ci — et elles se contredisaient sur à peu près tout :
 *
 *                      route            ici              vrai contenu
 *   cartes             4                3                4
 *   grille             sm:grid-cols-4   sm:grid-cols-3   sm:grid-cols-4
 *   balisage carte     stat-tile        div maison       StatTile
 *   bande transverse   346 px           absente          conditionnelle
 *
 * L'utilisateur voyait donc la rangée passer de 4 à 3 puis de nouveau à 4
 * colonnes, et la page s'effondrer d'environ 500 px avant de regrandir. Le
 * commentaire qui justifiait ici les trois cartes — « la 4ᵉ est optionnelle,
 * masquée dès qu'il n'y a rien à comparer » — était PÉRIMÉ : `SummaryCards`
 * rend ses quatre `StatTile` inconditionnellement, celle « Pris depuis la
 * veille » affichant un tiret quand la comparaison manque.
 *
 * La bande de synthèse transverse est dessinée selon les droits RÉELS du compte
 * (ce que le squelette de route, qui tourne avant leur résolution, ne peut pas
 * faire) : un bloc par page accessible, rien du tout si aucune — exactement le
 * gating de `DayCrossSummary`.
 */
export function BoardSkeleton() {
  const { can } = useAuth()
  /* Mêmes droits, mêmes comptes de tuiles que DayCrossSummary : PDJ 4,
     Parking 3, Rapro 4. */
  const bande = [
    can('pdj', 'lecture') ? 4 : 0,
    can('parking', 'lecture') ? 3 : 0,
    can('rapro', 'lecture') ? 4 : 0,
  ].filter((n) => n > 0)

  return <FormeRepjour bande={bande} />
}
