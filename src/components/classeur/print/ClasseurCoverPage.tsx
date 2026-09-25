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

interface ClasseurCoverPageProps {
  /** `DbClasseur.name` */
  classeurName?: string
  /** Nom d'icône Lucide (`DbClasseur.icon`). */
  classeurIcon?: string
  /** `DbClasseur.etablissement` */
  etablissement?: string
  /** `DbClasseur.etablissement_complement` */
  etablissementComplement?: string
}

/** Page de garde générale du classeur — icône, nom, établissement, centré */
export function ClasseurCoverPage({
  classeurName = DEFAULT_REGISTRY_NAME,
  classeurIcon,
  etablissement,
  etablissementComplement,
}: ClasseurCoverPageProps) {
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
          gap: '10mm',
        }}
      >
        {/* Icône du classeur */}
        {classeurIcon &&
          createElement(getIcon(classeurIcon), {
            width: 72,
            height: 72,
            style: { color: '#666' },
          })}

        {/* Nom du classeur */}
        <span
          style={{
            fontSize: '36pt',
            fontWeight: 700,
            lineHeight: 1.2,
            maxWidth: '160mm',
          }}
        >
          {classeurName}
        </span>

        {/* Filet décoratif */}
        <div
          style={{
            width: '80mm',
            height: '0.3mm',
            backgroundColor: '#999',
          }}
        />

        {/* Établissement */}
        {etablissement && (
          <span
            style={{
              fontSize: '14pt',
              fontWeight: 400,
              color: '#555',
              maxWidth: '140mm',
              lineHeight: 1.5,
            }}
          >
            {etablissement}
          </span>
        )}

        {/* Complément */}
        {etablissementComplement && (
          <span
            style={{
              fontSize: '11pt',
              fontWeight: 400,
              color: '#777',
              maxWidth: '140mm',
              lineHeight: 1.5,
            }}
          >
            {etablissementComplement}
          </span>
        )}
      </div>
    </div>
  )
}
