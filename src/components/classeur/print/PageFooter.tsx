import {
  FOOTER_HEIGHT_MM,
  FOOTER_RULE_GAP_MM,
  FOOTER_RULE_MM,
  GAP_MM,
  PAGINATION_HEIGHT_MM,
} from '#/lib/classeur/print/constants.ts'
import { DEFAULT_REGISTRY_NAME } from '#/lib/classeur/naming.ts'

interface PageFooterProps {
  /** Bloc établissement, une ligne par `\n` (cf. `buildEstablishment`). */
  establishment?: string
  chapterName?: string
  classeurName?: string
  pageNumber?: number
  totalPages?: number
}

/** Footer : pagination + filet + 3 colonnes (classeur | établissement | chapitre) */
export function PageFooter({
  establishment = '',
  chapterName = '',
  classeurName = DEFAULT_REGISTRY_NAME,
  pageNumber,
  totalPages,
}: PageFooterProps) {
  const estLines = establishment.split('\n')
  const showPagination = totalPages != null && totalPages > 1

  return (
    <div className="pdf-footer" style={{ flexShrink: 0 }}>
      {/* Pagination */}
      <div
        className="dbg-pagination"
        style={{
          height: `${PAGINATION_HEIGHT_MM}mm`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '7.5pt',
          color: '#666',
        }}
      >
        {showPagination && `${pageNumber} / ${totalPages}`}
      </div>

      {/* Gap pagination → footer */}
      <div
        className="dbg-gap"
        style={{ height: `${GAP_MM}mm`, flexShrink: 0 }}
      />

      {/* Filet de séparation */}
      <div
        className="dbg-rule"
        style={{
          height: `${FOOTER_RULE_MM}mm`,
          backgroundColor: '#000',
        }}
      />

      {/* Espacement filet → contenu footer */}
      <div style={{ height: `${FOOTER_RULE_GAP_MM}mm`, flexShrink: 0 }} />

      {/* 3 colonnes */}
      <table
        style={{
          width: '100%',
          height: `${FOOTER_HEIGHT_MM}mm`,
          tableLayout: 'fixed',
          borderCollapse: 'collapse',
          fontSize: '7.5pt',
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                width: '30%',
                fontWeight: 600,
                textAlign: 'center',
                verticalAlign: 'middle',
              }}
            >
              {classeurName}
            </td>
            <td
              style={{
                width: '40%',
                textAlign: 'center',
                verticalAlign: 'middle',
              }}
            >
              {estLines.map((line, i) => (
                <span key={i} style={{ display: 'block', lineHeight: 1.3 }}>
                  {line}
                </span>
              ))}
            </td>
            <td
              style={{
                width: '30%',
                textAlign: 'center',
                verticalAlign: 'middle',
              }}
            >
              {chapterName}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
