import type { ReactNode } from 'react'

import {
  GAP_MM,
  MARGIN_BOTTOM_MM,
  MARGIN_TOP_MM,
  MARGIN_X_MM,
  PAGE_FONT_FAMILY,
  PAGE_FONT_SIZE,
  PAGE_LINE_HEIGHT,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  SUBTITLE_HEIGHT_MM,
} from '#/lib/classeur/print/constants.ts'
import { PageFooter } from '#/components/classeur/print/PageFooter.tsx'
import { PageHeader } from '#/components/classeur/print/PageHeader.tsx'

interface A4PageProps {
  title: string
  /** Sous-titre : toujours réservé (7mm) dès que la prop est définie, même vide. */
  subtitle?: string
  children: ReactNode
  pageNumber?: number
  totalPages?: number
  chapterName?: string
  classeurName?: string
  establishment?: string
  /**
   * Mention très discrète SOUS le pied de page (version d'un document) :
   * positionnée dans la marge basse, hors du flux — la pagination et la
   * mise en page ne la voient pas.
   */
  mention?: string
}

/*
 * Page A4 unique avec header, zone contenu et footer — portée de Registre.
 * Marges : 10mm sur les 4 côtés. Gap uniforme de 3mm entre chaque zone.
 * Le contenu ne peut jamais chevaucher le footer grâce au flex layout.
 *
 * La page est TOUJOURS blanche, texte noir, à l'écran comme à l'impression :
 * l'app est en dark navy forcé, une feuille A4 ne l'est pas. La variante
 * `themed` de Registre (tokens du thème pour l'aperçu éditeur) n'a pas été
 * portée.
 */
export function A4Page({
  title,
  subtitle,
  children,
  pageNumber,
  totalPages,
  chapterName,
  classeurName,
  establishment,
  mention,
}: A4PageProps) {
  return (
    <div
      className="a4-page"
      style={{
        width: `${PAGE_WIDTH_MM}mm`,
        height: `${PAGE_HEIGHT_MM}mm`,
        padding: `${MARGIN_TOP_MM}mm ${MARGIN_X_MM}mm ${MARGIN_BOTTOM_MM}mm`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: 'white',
        color: '#000',
        fontFamily: PAGE_FONT_FAMILY,
        fontSize: PAGE_FONT_SIZE,
        lineHeight: PAGE_LINE_HEIGHT,
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      <PageHeader title={title} />

      {/* Sous-titre — toujours présent si la prop est définie (même vide) */}
      {subtitle !== undefined && (
        <div
          className="dbg-subtitle"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: `${SUBTITLE_HEIGHT_MM}mm`,
            fontSize: '10pt',
            color: '#555',
            flexShrink: 0,
          }}
        >
          {subtitle}
        </div>
      )}

      {/* Gap header → contenu */}
      <div
        className="dbg-gap"
        style={{ height: `${GAP_MM}mm`, flexShrink: 0 }}
      />

      {/* Zone contenu */}
      <div className="pdf-prose dbg-content" style={{ flex: 1 }}>
        {children}
      </div>

      {/* Gap contenu → footer */}
      <div
        className="dbg-gap"
        style={{ height: `${GAP_MM}mm`, flexShrink: 0 }}
      />

      <PageFooter
        establishment={establishment}
        chapterName={chapterName}
        classeurName={classeurName}
        pageNumber={pageNumber}
        totalPages={totalPages}
      />

      {mention && (
        <div
          className="a4-mention"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            // 6,5 mm du bord : hors de la bande que la plupart des
            // imprimantes n'impriment pas (~4-5 mm, la date y était coupée
            // à 3,5 mm), et toujours sous le pied de page (qui s'arrête à
            // MARGIN_BOTTOM_MM = 10 mm ; la date haute de ~2,3 mm laisse
            // ~1 mm d'écart). Seule cette position a changé (2026-09-28).
            bottom: '6.5mm',
            textAlign: 'center',
            fontSize: '6.5pt',
            lineHeight: 1,
            color: '#000',
            opacity: 0.2,
            pointerEvents: 'none',
          }}
        >
          {mention}
        </div>
      )}
    </div>
  )
}
