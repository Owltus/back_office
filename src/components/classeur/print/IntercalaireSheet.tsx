import { PageFooter } from '#/components/classeur/print/PageFooter.tsx'
import { DEFAULT_REGISTRY_NAME } from '#/lib/classeur/naming.ts'
import {
  GAP_MM,
  MARGIN_BOTTOM_MM,
  MARGIN_TOP_MM,
  MARGIN_X_MM,
  PAGE_FONT_FAMILY,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
} from '#/lib/classeur/print/constants.ts'

interface IntercalaireSheetProps {
  title: string
  /** `DbIntercalaire.description` (retours à la ligne conservés). */
  description?: string
  chapterName?: string
  classeurName?: string
  establishment?: string
}

/*
 * Intercalaire — page A4 avec titre et description centrés, et footer —
 * portée de Registre. Destinée à être placée devant des documents externes
 * dans le classeur physique.
 */
export function IntercalaireSheet({
  title,
  description,
  chapterName,
  classeurName = DEFAULT_REGISTRY_NAME,
  establishment,
}: IntercalaireSheetProps) {
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
        boxSizing: 'border-box',
      }}
    >
      {/* Contenu centré */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: '6mm',
        }}
      >
        <span
          style={{
            fontSize: '22pt',
            fontWeight: 700,
            lineHeight: 1.3,
            maxWidth: '150mm',
            color: '#000',
          }}
        >
          {title}
        </span>

        {description && (
          <span
            style={{
              fontSize: '11pt',
              fontWeight: 400,
              color: '#666',
              maxWidth: '130mm',
              lineHeight: 1.6,
              whiteSpace: 'pre-line',
            }}
          >
            {description}
          </span>
        )}
      </div>

      {/* Gap contenu → footer */}
      <div style={{ height: `${GAP_MM}mm`, flexShrink: 0 }} />

      <PageFooter
        establishment={establishment}
        chapterName={chapterName}
        classeurName={classeurName}
      />
    </div>
  )
}
