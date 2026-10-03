import {
  HEADER_HEIGHT_MM,
  SUBTITLE_HEIGHT_MM,
} from '#/lib/classeur/print/constants.ts'

/*
 * EN-TÊTE d'un DOCUMENT (2026-10-03, demande utilisateur : « toucher au
 * header sans toucher à la hauteur des pages, que pour les documents »).
 * Il occupe EXACTEMENT la place de l'ancien en-tête : titre
 * (`HEADER_HEIGHT_MM`) + sous-titre (`SUBTITLE_HEIGHT_MM`), soit 19 mm — la
 * pagination (`DOCUMENT_CONTENT_HEIGHT_WITH_SUBTITLE_MM`) ne change pas. Les
 * autres pages (suivi, signature, intercalaire, sommaire) gardent
 * `PageHeader`.
 *
 * Version SOBRE (retour utilisateur du même jour sur la première, encadrée
 * avec une case grise : « très moche, la version a trop d'importance, le
 * côté cartouche est trop fort ») : titre et description centrés comme
 * avant, filet fin dessous, et le numéro de version en petite mention grise
 * dans le coin haut droit. Classeur, chapitre, établissement et date restent
 * au pied de page.
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
        position: 'relative',
        height: `${String(hauteur)}mm`,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1mm',
        padding: '0 22mm',
        borderBottom: '0.5pt solid #bbb',
        boxSizing: 'border-box',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          maxWidth: '100%',
          fontSize: '14pt',
          fontWeight: 700,
          lineHeight: 1.2,
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
            fontSize: '9.5pt',
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
      <span
        style={{
          position: 'absolute',
          top: '1.5mm',
          right: 0,
          fontSize: '7pt',
          lineHeight: 1,
          color: '#888',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        V {version}
      </span>
    </div>
  )
}
