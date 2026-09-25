import { HEADER_HEIGHT_MM } from '#/lib/classeur/print/constants.ts'

interface PageHeaderProps {
  title: string
}

/** Titre du document centré en haut de la page A4 */
export function PageHeader({ title }: PageHeaderProps) {
  return (
    <div
      className="pdf-header"
      style={{
        height: `${HEADER_HEIGHT_MM}mm`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '14pt',
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {title}
    </div>
  )
}
