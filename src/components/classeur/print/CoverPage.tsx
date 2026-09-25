import { createElement } from 'react'

import { DEFAULT_REGISTRY_NAME, getIcon } from '#/lib/classeur/naming.ts'
import {
  MARGIN_BOTTOM_MM,
  MARGIN_TOP_MM,
  MARGIN_X_MM,
  PAGE_FONT_FAMILY,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
} from '#/lib/classeur/print/constants.ts'

interface CoverPageProps {
  /** `DbChapter.label` */
  chapterLabel: string
  /** `DbChapter.description` */
  chapterDescription?: string
  /** Nom d'icône Lucide (`DbChapter.icon`). */
  chapterIcon?: string
  classeurName?: string
}

/** Page de garde du chapitre — pas de header ni footer, contenu centré */
export function CoverPage({
  chapterLabel,
  chapterDescription,
  chapterIcon,
  classeurName = DEFAULT_REGISTRY_NAME,
}: CoverPageProps) {
  return (
    <div
      className="a4-page"
      style={{
        width: `${PAGE_WIDTH_MM}mm`,
        height: `${PAGE_HEIGHT_MM}mm`,
        padding: `${MARGIN_TOP_MM}mm ${MARGIN_X_MM}mm ${MARGIN_BOTTOM_MM}mm`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        backgroundColor: 'white',
        color: '#000',
        fontFamily: PAGE_FONT_FAMILY,
        boxSizing: 'border-box',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12mm',
        }}
      >
        {/* Logo */}
        {chapterIcon &&
          createElement(getIcon(chapterIcon), {
            width: 64,
            height: 64,
            style: { color: '#666' },
          })}

        {/* Nom du classeur */}
        <span
          style={{
            fontSize: '14pt',
            fontWeight: 400,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: '#666',
          }}
        >
          {classeurName}
        </span>

        {/* Filet décoratif */}
        <div
          style={{
            width: '60mm',
            height: '0.3mm',
            backgroundColor: '#999',
          }}
        />

        {/* Nom du chapitre */}
        <span
          style={{
            fontSize: '28pt',
            fontWeight: 700,
            lineHeight: 1.2,
            maxWidth: '160mm',
          }}
        >
          {chapterLabel}
        </span>

        {/* Description */}
        {chapterDescription && (
          <span
            style={{
              fontSize: '12pt',
              fontWeight: 400,
              color: '#555',
              maxWidth: '140mm',
              lineHeight: 1.5,
            }}
          >
            {chapterDescription}
          </span>
        )}
      </div>
    </div>
  )
}
