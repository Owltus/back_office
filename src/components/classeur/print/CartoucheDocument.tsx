import {
  HEADER_HEIGHT_MM,
  SUBTITLE_HEIGHT_MM,
} from '#/lib/classeur/print/constants.ts'

/*
 * CARTOUCHE d'un DOCUMENT (2026-10-03, demande utilisateur : « toucher au
 * header, un genre de cartouche, sans toucher à la hauteur des pages, que
 * pour les documents »). Il occupe EXACTEMENT la place de l'ancien en-tête :
 * titre (`HEADER_HEIGHT_MM`) + sous-titre (`SUBTITLE_HEIGHT_MM`), soit 19 mm
 * — la pagination (`DOCUMENT_CONTENT_HEIGHT_WITH_SUBTITLE_MM`) ne change
 * pas. Les autres pages (suivi, signature, intercalaire, sommaire) gardent
 * `PageHeader`.
 *
 * Titre et description à gauche, case VERSION à droite ; cadre noir fin,
 * même trait que celui des images. Classeur, chapitre et établissement
 * restent dans le pied de page (décision utilisateur : pas de doublon) ;
 * la date aussi.
 */
export function CartoucheDocument({
  title,
  subtitle,
  version,
}: {
  title: string
  subtitle?: string
  version: string
}) {
  const hauteur = HEADER_HEIGHT_MM + SUBTITLE_HEIGHT_MM
  return (
    <div
      className="pdf-cartouche"
      style={{
        height: `${String(hauteur)}mm`,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'stretch',
        border: '0.75pt solid #000',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '0.8mm',
          padding: '0 4mm',
        }}
      >
        <div
          style={{
            fontSize: '14pt',
            fontWeight: 700,
            lineHeight: 1.15,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: '9pt',
              lineHeight: 1.3,
              color: '#555',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      <div
        style={{
          width: '24mm',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.6mm',
          borderLeft: '0.75pt solid #000',
          background: '#e2e2e2',
        }}
      >
        <span
          style={{
            fontSize: '6.5pt',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#444',
            lineHeight: 1,
          }}
        >
          Version
        </span>
        <span
          style={{
            fontSize: '15pt',
            fontWeight: 700,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {version}
        </span>
      </div>
    </div>
  )
}
