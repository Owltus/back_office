import { describe, expect, it } from 'vitest'

import { canCreateAssignment, canEditAssignment, graceFloor } from '#/lib/baby-cots/editability.ts'
import { LITERIE_GRACE_DAYS } from '#/lib/permissions/actions.ts'
import type { PageLevel } from '#/lib/permissions/levels.ts'

/*
 * Éditabilité des assignations de lit bébé — MIROIR de la policy RLS Supabase
 * (supabase/literie_rls.sql, cf. en-tête de editability.ts). Une divergence
 * entre ce miroir et la policy serveur est un défaut de SÉCURITÉ, pas un simple
 * bug d'UX : on couvre donc le PRODUIT COMPLET des dimensions en jeu (niveau de
 * droit × ancienneté de la date testée), en calquant la structure des
 * editability.test.ts des autres domaines (caisse, rapro, pdj, parking) plutôt
 * qu'une poignée de cas choisis à la main.
 *
 * Note sur la dimension « rôle » : ces deux fonctions ne prennent qu'un
 * `level: PageLevel | null | undefined` (pas de grade/rôle séparé — la policy
 * RLS elle-même ne distingue que « gestion », « ecriture » et en dessous) : le
 * produit niveau × ancienneté couvre donc l'espace RÉEL des dimensions en jeu.
 */

const TODAY = '2026-08-10'
const FLOOR = graceFloor(TODAY) // TODAY − LITERIE_GRACE_DAYS

/** Décalage de jours indépendant de la source : pure arithmétique calendaire
 * (ne réutilise pas `shiftDay`, interne et non exportée par editability.ts). */
function addDaysLocal(date: string, delta: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// Ancienneté de la date testée, balayant tout l'espace pertinent autour de la
// borne : loin dans le passé (bien avant le plancher), juste avant le plancher
// (hors fenêtre), pile le plancher (borne INCLUSE), juste après (dans la
// fenêtre), aujourd'hui, et dans le futur (toujours dans la fenêtre).
const DATES: Array<{ label: string; date: string }> = [
  { label: 'loin dans le passé (plancher − 400 j)', date: addDaysLocal(FLOOR, -400) },
  { label: 'juste avant le plancher (hors fenêtre)', date: addDaysLocal(FLOOR, -1) },
  { label: 'pile le plancher (borne incluse)', date: FLOOR },
  { label: 'juste après le plancher', date: addDaysLocal(FLOOR, 1) },
  { label: 'aujourd’hui', date: TODAY },
  { label: 'dans le futur (+30 j)', date: addDaysLocal(TODAY, 30) },
]

// Niveau de droit — toutes les valeurs possibles côté RLS/PageLevel, y compris
// l'absence de droit (aucune ligne user_page_permissions → null/undefined).
const LEVELS: Array<PageLevel | null | undefined> = [
  undefined,
  null,
  'lecture',
  'ecriture',
  'gestion',
]

/** Oracle attendu, recalculé INDÉPENDAMMENT du code source : `gestion` toujours ;
 * `ecriture` seulement dans la fenêtre [plancher, +∞[ ; en dessous (lecture,
 * null, undefined), jamais — miroir textuel de la policy RLS citée en tête de
 * editability.ts, pas une copie de l'implémentation testée. */
function expectedAllowed(date: string, level: PageLevel | null | undefined): boolean {
  if (level === 'gestion') return true
  if (level === 'ecriture') return date >= FLOOR
  return false
}

describe('graceFloor', () => {
  it('plancher = aujourd’hui − LITERIE_GRACE_DAYS jours', () => {
    expect(FLOOR).toBe(addDaysLocal(TODAY, -LITERIE_GRACE_DAYS))
  })
})

describe('canCreateAssignment — matrice exhaustive niveau × ancienneté (arrivée)', () => {
  for (const level of LEVELS) {
    for (const { label, date } of DATES) {
      const expected = expectedAllowed(date, level)
      it(`niveau=${String(level)} / arrivée ${label} → ${expected}`, () => {
        expect(canCreateAssignment(date, TODAY, level)).toBe(expected)
      })
    }
  }
})

describe('canEditAssignment — matrice exhaustive niveau × ancienneté (fin)', () => {
  for (const level of LEVELS) {
    for (const { label, date } of DATES) {
      const expected = expectedAllowed(date, level)
      it(`niveau=${String(level)} / fin ${label} → ${expected}`, () => {
        expect(canEditAssignment({ endDate: date }, TODAY, level)).toBe(expected)
      })
    }
  }
})
