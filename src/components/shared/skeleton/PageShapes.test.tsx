// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'

import {
  CHAMBRES_PAR_ETAGE,
  FormeCaisse,
  FormeLiterie,
  FormePdj,
  FormeProfil,
  FormeRepjour,
  TuileSquelette,
} from '#/components/shared/skeleton/PageShapes.tsx'
import { ALL_ROOMS } from '#/lib/hotel/rooms.ts'

/*
 * Garde-fou des silhouettes de chargement.
 *
 * ⚠ POURQUOI CE FICHIER EXISTE, ET POURQUOI IL EST EN `.tsx`. Le précédent
 * garde-fou (`RouteSkeleton.test.ts`) prétendait vérifier « les invariants
 * comptables dont dépend la hauteur ». Ses trois assertions étaient en réalité
 * des tautologies : `CHAMBRES_PAR_ETAGE` est une PARTITION d'`ALL_ROOMS` par
 * étage, donc la somme de ses classes égale le cardinal quoi qu'il arrive, et
 * aucune classe ne peut être vide puisque chaque étage provient d'au moins une
 * chambre. Le fichier étant un `.ts`, il ne pouvait structurellement pas rendre
 * de JSX : aucun test du dépôt ne rendait la moindre silhouette. Elles ont donc
 * dérivé en silence — jusqu'à décrire, pour /literie, des cartes et un tableau
 * qui n'existent pas sur la page.
 *
 * Ce qui est testé ici est ce qui PILOTE LA HAUTEUR et qui peut réellement
 * casser : le nombre de tuiles, de colonnes, de lignes, la grille employée, et
 * la présence de chaque section. Un test qui ne peut pas échouer n'est pas un
 * garde-fou, c'est une décoration.
 */

afterEach(cleanup)

describe('TuileSquelette', () => {
  it('emploie les VRAIES classes de la tuile de statistique', () => {
    // `stat-tile__body` et son `py-[0.55rem]` sont ce qui donne 77,8 px à la
    // vraie tuile. Un gabarit maison en `p-4` en faisait 104.
    const { container } = render(<TuileSquelette />)
    expect(container.querySelector('.stat-tile')).not.toBeNull()
    const body = container.querySelector('.stat-tile__body')
    expect(body).not.toBeNull()
    expect(body?.className).toContain('py-[0.55rem]')
  })

  it('sait omettre la ligne de sous-texte', () => {
    // Les `sub` sont conditionnels dans `StatTile` (benchmark absent, total nul).
    const avec = render(<TuileSquelette />).container.querySelectorAll('span,div')
      .length
    cleanup()
    const sans = render(<TuileSquelette sub={false} />).container.querySelectorAll(
      'span,div',
    ).length
    expect(sans).toBeLessThan(avec)
  })
})

describe('FormePdj', () => {
  it('rend DEUX enfants de premier niveau, pas un conteneur englobant', () => {
    // `.pdj-doc` est un `flex flex-col gap-5` : `.pdj-stats` et `.pdj-floors`
    // doivent en être deux enfants DIRECTS. Les envelopper dans un `<div>`
    // annulait le `gap-5` et faisait remonter la grille des étages de 20 px.
    const { container } = render(<FormePdj />)
    expect(container.children).toHaveLength(2)
    expect(container.children[0].className).toContain('pdj-stats')
    expect(container.children[1].className).toContain('pdj-floors')
  })

  it('dessine six tuiles sur la grille normale', () => {
    const { container } = render(<FormePdj />)
    const grille = container.querySelector('.pdj-stats-grid')
    expect(grille).not.toBeNull()
    expect(grille?.className).not.toContain('--tablet-portrait')
    expect(grille?.querySelectorAll('.stat-tile')).toHaveLength(6)
  })

  it('dessine CINQ tuiles et la classe tablette en portrait', () => {
    // Le vrai contenu retire « Taux de captage » ET bascule la grille à cinq
    // colonnes. Sans la classe, six tuiles sur trois colonnes font deux rangs
    // contre un seul au contenu : ~90 px qui disparaissent au chargement.
    const { container } = render(<FormePdj tabletPortrait />)
    const grille = container.querySelector('.pdj-stats-grid')
    expect(grille?.className).toContain('pdj-stats-grid--tablet-portrait')
    expect(grille?.querySelectorAll('.stat-tile')).toHaveLength(5)
  })

  it('dessine un étage par étage réel et une ligne par chambre', () => {
    const { container } = render(<FormePdj />)
    const etages = container.querySelectorAll('.pdj-floor')
    expect(etages).toHaveLength(CHAMBRES_PAR_ETAGE.length)
    expect(container.querySelectorAll('.pdj-floors tr')).toHaveLength(
      ALL_ROOMS.length,
    )
    etages.forEach((etage, i) => {
      expect(etage.querySelectorAll('tr')).toHaveLength(CHAMBRES_PAR_ETAGE[i])
    })
  })

  it('dessine CINQ cellules par ligne, cale de ligne comprise', () => {
    // La silhouette n'en dessinait que quatre : elle omettait la colonne des
    // cases à cocher, l'élément le plus HAUT de la ligne. Mesuré : 35,5 px pour
    // une vraie ligne contre 26,4 px — 215 px manquants sur la page.
    const { container } = render(<FormePdj />)
    const premiere = container.querySelector('.pdj-floors tr')
    expect(premiere?.querySelectorAll('td')).toHaveLength(5)
    // La cale (U+200B) est ce qui rétablit la boîte de ligne du texte.
    expect(premiere?.textContent).toContain(String.fromCharCode(0x200b))
  })
})

describe('FormeRepjour', () => {
  it('dessine QUATRE cartes sur une grille de quatre colonnes', () => {
    // `SummaryCards` rend ses quatre `StatTile` inconditionnellement. Le
    // squelette du board en dessinait trois sur `sm:grid-cols-3`, si bien que
    // la rangée passait de 4 à 3 puis à 4 colonnes sous les yeux du lecteur.
    const { container } = render(<FormeRepjour />)
    const grille = container.querySelector('.grid')
    expect(grille?.className).toContain('sm:grid-cols-4')
    expect(grille?.querySelectorAll('.stat-tile')).toHaveLength(4)
  })

  it('ne dessine AUCUNE barre de date', () => {
    // La date est le `title` du PageHeader, déjà dessiné au-dessus : la barre
    // de 32 px que j'y avais mise était une section fantôme.
    const { container } = render(<FormeRepjour bande={null} />)
    expect(container.querySelector('.h-8')).toBeNull()
  })

  it('dessine la bande transverse selon les droits transmis', () => {
    const { container } = render(<FormeRepjour bande={[4, 3, 4]} />)
    const bande = container.querySelector('section')
    expect(bande?.children).toHaveLength(3)
    // 4 + 3 + 4 tuiles, comme DayCrossSummary (PDJ, Parking, Rapro).
    expect(bande?.querySelectorAll('.stat-tile')).toHaveLength(11)
  })

  it('omet la bande entière quand aucun droit ne la justifie', () => {
    // Même règle que le pavé d'import : une section qui disparaîtrait à
    // l'arrivée des données est pire que son absence.
    const { container } = render(<FormeRepjour bande={[]} />)
    expect(container.querySelector('section')).toBeNull()
  })
})

describe('FormeCaisse', () => {
  it('dessine la table des montants avec le libellé plus les colonnes du shift', () => {
    const { container } = render(<FormeCaisse cols={4} />)
    expect(container.querySelectorAll('thead th')).toHaveLength(5)
    // 3 lignes de saisie + 1 ligne d'écarts.
    expect(container.querySelectorAll('tbody tr')).toHaveLength(4)
  })

  it('suit le shift de nuit, qui n’a pas de colonne web', () => {
    const { container } = render(<FormeCaisse cols={3} />)
    expect(container.querySelectorAll('thead th')).toHaveLength(4)
  })

  it('dessine les quinze coupures à leur VRAIE hauteur', () => {
    // 15 cellules de 5,5rem (88 px), pas 15 barres de 36 px : c'était 150 px
    // manquants sur la page.
    const { container } = render(<FormeCaisse />)
    const cellules = container.querySelectorAll('.caisse-denoms > *')
    expect(cellules).toHaveLength(15)
    cellules.forEach((c) => expect(c.className).toContain('h-[5.5rem]'))
  })

  it('dessine la carte Commentaires, extensible comme la vraie', () => {
    const { container } = render(<FormeCaisse />)
    const derniere = container.children[container.children.length - 1]
    expect(derniere.className).toContain('flex-1')
  })
})

describe('FormeLiterie', () => {
  it('dessine la grille des étages, pas des cartes et un tableau', () => {
    // La silhouette précédente dessinait quatre cartes de stock et un tableau
    // de huit lignes : aucun des deux n'existe sur cette page.
    const { container } = render(<FormeLiterie />)
    expect(container.querySelector('.literie-floors')).not.toBeNull()
    expect(container.querySelector('table')).toBeNull()
    expect(container.querySelectorAll('.literie-floor')).toHaveLength(
      CHAMBRES_PAR_ETAGE.length,
    )
    expect(container.querySelectorAll('.literie-room')).toHaveLength(
      ALL_ROOMS.length,
    )
  })

  it('réserve la place du planning des lits bébé', () => {
    // Il n'était pas modélisé du tout : plusieurs centaines de pixels qui
    // surgissaient après coup. Plancher = en-tête + 4 lits, comme son propre
    // squelette.
    const { container } = render(<FormeLiterie />)
    const planning = container.querySelector('[style*="height"]')
    expect(planning).not.toBeNull()
    expect((planning as HTMLElement).style.height).toBe('220px')
  })
})

describe('FormeProfil', () => {
  it('dessine la carte d’identité et les TROIS cartes de formulaire', () => {
    // Les deux silhouettes précédentes en omettaient, chacune les siennes.
    const { container } = render(<FormeProfil />)
    expect(container.querySelectorAll('.rounded-xl.border')).toHaveLength(4)
  })

  it('ne dessine aucune barre d’en-tête', () => {
    // La page ne rend aucun PageHeader : lui en dessiner un était une ligne
    // fantôme de 36 px suivie de 24 px d'espacement.
    const { container } = render(<FormeProfil />)
    expect(container.querySelector('.h-7')).toBeNull()
  })
})
