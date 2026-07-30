import { useEffect, useState } from 'react'

/*
 * État de l'année sélectionnée des vues analytique ANNUELLES + recalage : si l'année
 * retenue n'est plus dans la liste `years` (chargée de façon asynchrone), on retombe
 * sur la plus récente. Remplace le `useEffect` de clamp dupliqué verbatim dans les 4
 * boards parents (repjour, pdj, parking, caisse).
 *
 * `currentYear` (année du jour) est passée par l'appelant plutôt que recalculée ici :
 * elle sert AUSSI à dériver `years` (ancre « année courante toujours présente »), donc
 * elle doit exister avant l'appel du hook. À appeler APRÈS la dérivation de `years`.
 */
export function useAnnualYear(years: number[], currentYear: number) {
  const [year, setYear] = useState(currentYear)
  useEffect(() => {
    if (years.length > 0 && !years.includes(year)) {
      setYear(years[years.length - 1])
    }
  }, [years, year])
  return { year, setYear }
}
