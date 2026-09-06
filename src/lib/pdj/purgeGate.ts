/**
 * Verrou « une purge par jour et par poste » (audit du 2026-09-06).
 *
 * La purge RGPD des noms (`purgeOldGuestNames`) partait à CHAQUE montage du
 * board PDJ : le garde `useRef` était remis à zéro à chaque visite de la page
 * (1 906 exécutions en cinq mois, 152 ms de moyenne, 0 ligne à purger dans
 * 99 % des cas). L'état vit ici, au niveau du module : il survit aux
 * démontages, et ne se réinitialise qu'au rechargement complet de l'onglet.
 *
 * `claim(day)` renvoie `true` la première fois qu'un jour hôtelier est vu ;
 * `release(day)` rend la main si la purge de ce jour a échoué (nouvel essai
 * possible à la visite suivante).
 */
export interface PurgeGate {
  claim: (day: string) => boolean
  release: (day: string) => void
}

export function createPurgeGate(): PurgeGate {
  let claimedDay: string | null = null
  return {
    claim(day) {
      if (claimedDay === day) return false
      claimedDay = day
      return true
    },
    release(day) {
      if (claimedDay === day) claimedDay = null
    },
  }
}

/** Instance partagée par l'application (un poste = un onglet = une instance). */
export const purgeGate = createPurgeGate()
