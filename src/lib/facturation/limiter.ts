/*
 * File d'attente à concurrence bornée : au plus `max` tâches en cours, les
 * suivantes attendent leur tour dans l'ordre d'arrivée. Sert au traitement
 * des PDF déposés (extraction pdf.js + OCR Tesseract, très gourmands) : un
 * dépôt de 30 factures les lançait toutes à la fois et figeait l'onglet.
 *
 * Une seule file pour toute la page : deux dépôts successifs partagent la
 * même limite au lieu de la doubler.
 */
export function createLimiter(max: number) {
  let active = 0
  const waiting: Array<() => void> = []

  const next = () => {
    if (active >= max) return
    const start = waiting.shift()
    if (start) start()
  }

  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      waiting.push(() => {
        active++
        task()
          .then(resolve, reject)
          .finally(() => {
            active--
            next()
          })
      })
      next()
    })
  }
}
