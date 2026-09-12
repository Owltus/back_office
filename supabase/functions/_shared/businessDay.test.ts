// Frontières de jour hôtelier et décalage de date.
//
// Lancer : `deno test supabase/functions/_shared/businessDay.test.ts`

import { assertEquals } from 'jsr:@std/assert@1'

import { businessDateStr, isWithinPipelineWindow, shiftDateStr } from './businessDay.ts'

Deno.test('shiftDateStr recule d un JOUR, pas de 24 heures', () => {
  // Le défaut corrigé : la nuit du passage à l'heure d'été, la veille ne dure
  // que 23 h. Retirer 86 400 000 ms faisait reculer de DEUX jours, et un rapport
  // vieux de deux jours entrait dans la tolérance de cycle.
  assertEquals(shiftDateStr('2026-03-30', -1), '2026-03-29')
  assertEquals(shiftDateStr('2026-10-26', -1), '2026-10-25')
})

Deno.test('shiftDateStr franchit mois, année et 29 février', () => {
  assertEquals(shiftDateStr('2026-09-01', -1), '2026-08-31')
  assertEquals(shiftDateStr('2026-03-01', -1), '2026-02-28')
  assertEquals(shiftDateStr('2028-03-01', -1), '2028-02-29')
  assertEquals(shiftDateStr('2027-01-01', -1), '2026-12-31')
  assertEquals(shiftDateStr('2026-12-31', 1), '2027-01-01')
})

Deno.test('la veille calculée sur la chaîne ne saute jamais un jour', () => {
  // Cinq ans, jour par jour : le décalage de −1 doit toujours rendre exactement
  // le quantième précédent, quelles que soient les transitions d'heure.
  let d = '2026-01-01'
  let jours = 0
  while (d < '2031-01-01') {
    const suivant = shiftDateStr(d, 1)
    assertEquals(shiftDateStr(suivant, -1), d)
    d = suivant
    jours += 1
  }
  assertEquals(jours, 1826) // 5 ans dont un bissextile
})

Deno.test('la fenêtre d envoi va de 02h à 06h, heure de Paris', () => {
  // 2026-09-12 : Paris est à UTC+2.
  const paris = (h: number, m = 0) =>
    new Date(Date.UTC(2026, 8, 12, h - 2, m))
  assertEquals(isWithinPipelineWindow(paris(1, 59)), false)
  assertEquals(isWithinPipelineWindow(paris(2, 0)), true)
  assertEquals(isWithinPipelineWindow(paris(5, 59)), true)
  assertEquals(isWithinPipelineWindow(paris(6, 0)), false)
})

Deno.test('le cycle bascule à 02h, et reste STABLE sur toute la fenêtre', () => {
  // Invariant : DAY_CUTOFF_HOUR vaut PIPELINE_WINDOW_START_HOUR. Le nom du cycle
  // ne peut donc pas changer entre deux contrôles d'une même nuit — sans quoi le
  // candidat pourrait glisser d'un jour à l'autre en cours de veille.
  const paris = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 12, h - 2, m))
  assertEquals(businessDateStr(paris(1, 59)), '2026-09-11')
  const dansLaFenetre = [2, 3, 4, 5].map((h) => businessDateStr(paris(h, 30)))
  assertEquals(new Set(dansLaFenetre).size, 1)
  assertEquals(dansLaFenetre[0], '2026-09-12')
})
