// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MiseEnPageEnCours } from '#/lib/classeur/print/buildPrintHtml.ts'
import {
  QUALITE_JPEG,
  echelleCapture,
  isolerPageClonee,
  nomFichierPdf,
  redessinerContoursMasques,
  telechargerPdf,
} from '#/lib/classeur/print/pdfDirect.ts'
import type {
  OptionsCapture,
  OutilsPdf,
} from '#/lib/classeur/print/pdfDirect.ts'

/*
 * « Télécharger le PDF » avec une capture et un jsPDF FACTICES : on vérifie
 * l'orchestration (une page PDF par `.a4-page`, dans l'ordre, attente de
 * la pagination, nom, progression, erreurs), pas le rendu de html2canvas
 * (contrôlé au navigateur).
 */

interface Journal {
  capturees: string[]
  options: OptionsCapture[]
  appels: string[]
  sauve: string[]
}

function faux(
  journal: Journal,
  echec?: { page: number; erreur: Error },
): OutilsPdf {
  return {
    capturer: async (page, options) => {
      const n = journal.capturees.length + 1
      if (echec && n === echec.page) throw echec.erreur
      journal.capturees.push(page.textContent)
      journal.options.push(options)
      const canvas = {
        width: 1588,
        height: 2246,
        toDataURL: (type: string, q: number) =>
          `data:${type};q=${q};${page.textContent}`,
      }
      return canvas as unknown as HTMLCanvasElement
    },
    creerPdf: () => ({
      addPage: (format, orientation) => {
        journal.appels.push(`page ${format} ${orientation}`)
      },
      addImage: (data, format, x, y, w, h) => {
        journal.appels.push(`image ${data} ${format} ${x},${y},${w},${h}`)
      },
      save: (nom) => {
        journal.sauve.push(nom)
      },
    }),
  }
}

function journalVide(): Journal {
  return { capturees: [], options: [], appels: [], sauve: [] }
}

function apercu(pages: string[]): HTMLDivElement {
  const conteneur = document.createElement('div')
  for (const texte of pages) {
    const p = document.createElement('div')
    p.className = 'a4-page'
    p.textContent = texte
    conteneur.appendChild(p)
  }
  document.body.appendChild(conteneur)
  return conteneur
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('telechargerPdf', () => {
  it('une page PDF par .a4-page, dans l’ordre, pleine page A4', async () => {
    const j = journalVide()
    const res = await telechargerPdf(apercu(['P1', 'P2', 'P3']), {
      nomFichier: 'Registre - Doc',
      outils: faux(j),
    })
    expect(res).toEqual({ pages: 3, nom: 'Registre - Doc.pdf' })
    expect(j.capturees).toEqual(['P1', 'P2', 'P3'])
    expect(j.appels).toEqual([
      `image data:image/jpeg;q=${QUALITE_JPEG};P1 JPEG 0,0,210,297`,
      'page a4 portrait',
      `image data:image/jpeg;q=${QUALITE_JPEG};P2 JPEG 0,0,210,297`,
      'page a4 portrait',
      `image data:image/jpeg;q=${QUALITE_JPEG};P3 JPEG 0,0,210,297`,
    ])
    expect(j.sauve).toEqual(['Registre - Doc.pdf'])
  })

  it('capture sur fond blanc, sans CORS ni taint, autres pages exclues', async () => {
    const j = journalVide()
    const conteneur = apercu(['A', 'B'])
    const [a, b] = Array.from(conteneur.querySelectorAll('.a4-page'))
    await telechargerPdf(conteneur, { outils: faux(j) })
    const o = j.options[0]
    expect(o.backgroundColor).toBe('#ffffff')
    expect(o.useCORS).toBe(false)
    expect(o.allowTaint).toBe(false)
    expect(o.scale).toBeGreaterThanOrEqual(2)
    expect(o.ignoreElements(a)).toBe(false)
    expect(o.ignoreElements(b)).toBe(true)
    expect(o.ignoreElements(document.createElement('p'))).toBe(false)
  })

  it('nom par défaut « Classeur.pdf », nom nettoyé', async () => {
    const j = journalVide()
    await telechargerPdf(apercu(['X']), { outils: faux(j) })
    expect(j.sauve).toEqual(['Classeur.pdf'])
    expect(nomFichierPdf('Registre - 04/10/2026')).toBe(
      'Registre - 04-10-2026.pdf',
    )
  })

  it('progression 0/n puis chaque page', async () => {
    const j = journalVide()
    const etapes: string[] = []
    await telechargerPdf(apercu(['1', '2']), {
      outils: faux(j),
      onProgression: (f, t) => etapes.push(`${f}/${t}`),
    })
    expect(etapes).toEqual(['0/2', '1/2', '2/2'])
  })

  it('attend la fin de la pagination avant de capturer', async () => {
    const j = journalVide()
    const conteneur = apercu(['A'])
    const mesure = document.createElement('div')
    mesure.setAttribute('data-pagination', 'en-cours')
    conteneur.appendChild(mesure)
    const promesse = telechargerPdf(conteneur, { outils: faux(j) })
    await new Promise((r) => setTimeout(r, 20))
    expect(j.capturees).toEqual([])
    // La mesure finit : ses pages arrivent, le marqueur part.
    const p = document.createElement('div')
    p.className = 'a4-page'
    p.textContent = 'B'
    mesure.replaceWith(p)
    await promesse
    expect(j.capturees).toEqual(['A', 'B'])
  })

  it('pagination jamais finie : MiseEnPageEnCours, aucun fichier', async () => {
    vi.useFakeTimers()
    const j = journalVide()
    const conteneur = apercu(['A'])
    const mesure = document.createElement('div')
    mesure.setAttribute('data-pagination', 'en-cours')
    conteneur.appendChild(mesure)
    const promesse = telechargerPdf(conteneur, { outils: faux(j) })
    const attendu = expect(promesse).rejects.toBeInstanceOf(MiseEnPageEnCours)
    await vi.advanceTimersByTimeAsync(16000)
    await attendu
    expect(j.capturees).toEqual([])
    expect(j.sauve).toEqual([])
  })

  it('erreur de capture remontée, aucun fichier partiel', async () => {
    const j = journalVide()
    const erreur = new Error('capture')
    await expect(
      telechargerPdf(apercu(['1', '2', '3']), {
        outils: faux(j, { page: 2, erreur }),
      }),
    ).rejects.toBe(erreur)
    expect(j.sauve).toEqual([])
  })

  it('aucune page : erreur', async () => {
    const j = journalVide()
    await expect(
      telechargerPdf(apercu([]), { outils: faux(j) }),
    ).rejects.toThrow('Aucune page A4')
  })
})

describe('isolerPageClonee', () => {
  it('sort la page de l’aperçu, à l’échelle 1, en haut à gauche', () => {
    const dialogue = document.createElement('div')
    dialogue.style.transform = 'translate(-50%, -50%) scale(0.5)'
    const page = document.createElement('div')
    page.className = 'a4-page'
    page.style.transform = 'scale(0.7)'
    dialogue.appendChild(page)
    document.body.appendChild(dialogue)
    isolerPageClonee(document, page)
    expect(page.parentElement).toBe(document.body)
    expect(page.style.transform).toBe('none')
    expect(page.style.position).toBe('fixed')
    expect(page.style.left).toBe('0px')
    expect(page.style.top).toBe('0px')
  })
})

// Propriétés détaillées : jsdom ne déplie pas les raccourcis.
const CONTOUR = {
  outlineStyle: 'solid',
  outlineWidth: '1px',
  outlineColor: 'rgb(0, 0, 0)',
}
const MASQUE = { overflowX: 'hidden', overflowY: 'hidden' }

describe('redessinerContoursMasques', () => {
  it('contour d’un élément masqué : retiré et redessiné par un calque', () => {
    const page = document.createElement('div')
    page.className = 'a4-page'
    const cadre = document.createElement('div')
    Object.assign(cadre.style, CONTOUR)
    Object.assign(cadre.style, MASQUE)
    const libre = document.createElement('div')
    Object.assign(libre.style, CONTOUR)
    const sansContour = document.createElement('div')
    Object.assign(sansContour.style, MASQUE)
    page.append(cadre, libre, sansContour)
    document.body.appendChild(page)
    expect(redessinerContoursMasques(document, page)).toBe(1)
    const calques = page.querySelectorAll('[data-contour-capture]')
    expect(calques).toHaveLength(1)
    const c = calques[0] as HTMLElement
    expect(c.parentElement).toBe(page)
    expect(c.style.position).toBe('absolute')
    expect(c.style.border).toBe('1px solid rgb(0, 0, 0)')
    // Calque à cheval sur le contour : décalé de la largeur du trait.
    expect(c.style.left).toBe('-1px')
    expect(c.style.width).toBe('2px')
    expect(cadre.style.outlineStyle).toBe('none')
    // Un contour non masqué est rendu par la librairie : intouché.
    expect(libre.style.outlineStyle).toBe('solid')
  })
})

describe('echelleCapture', () => {
  it('2 au minimum, densité de l’écran, bornée à 3', () => {
    expect(echelleCapture(1)).toBe(2)
    expect(echelleCapture(undefined)).toBe(2)
    expect(echelleCapture(Number.NaN)).toBe(2)
    expect(echelleCapture(2.5)).toBe(2.5)
    expect(echelleCapture(4)).toBe(3)
  })
})
