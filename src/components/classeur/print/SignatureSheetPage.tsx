import { A4Page } from '#/components/classeur/print/A4Page.tsx'

interface SignatureSheetPageProps {
  title: string
  /** `DbSignatureSheet.description`, sous-titre de la feuille. */
  subtitle?: string
  /** Nombre de lignes de signature (`DbSignatureSheet.nombre`). */
  nombre: number
  chapterName?: string
  classeurName?: string
  establishment?: string
}

/*
 * Feuille de signature — toujours 1 seule page A4 — portée de Registre.
 * Contient un tableau Date | Nom/Prénom | Signature.
 */
export function SignatureSheetPage({
  title,
  subtitle,
  nombre,
  chapterName,
  classeurName,
  establishment,
}: SignatureSheetPageProps) {
  const rows = Array.from({ length: nombre }, (_, i) => i)

  return (
    <A4Page
      title={title}
      subtitle={subtitle}
      chapterName={chapterName}
      classeurName={classeurName}
      establishment={establishment}
    >
      <table className="tracking-table">
        <colgroup>
          <col style={{ width: '20%' }} />
          <col style={{ width: '45%' }} />
          <col style={{ width: '35%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Date</th>
            <th>Nom / Prénom</th>
            <th>Signature</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i}>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>
    </A4Page>
  )
}
