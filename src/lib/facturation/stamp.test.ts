import { describe, expect, it } from 'vitest'
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRef,
  PDFString,
} from 'pdf-lib'

import {
  ENCRYPTED_PDF_MESSAGE,
  buildStampedPdf,
} from '#/lib/facturation/stamp.ts'
import type { StampData } from '#/lib/facturation/types.ts'

const STAMP: StampData = {
  codes: ['FMELECoooo'],
  comptes: {},
  comment: '',
  invoiceDate: '2026-09-20',
  processedDate: '2026-09-28',
  scale: 1,
}

/** PDF d'une page qui déclare DÉJÀ un calque « Existant » référencé /MC0. */
async function pdfWithLayer(): Promise<{ bytes: Uint8Array; ocg: PDFRef }> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842])
  const ocg = doc.context.register(
    doc.context.obj({ Type: 'OCG', Name: PDFString.of('Existant') }),
  )
  doc.catalog.set(
    PDFName.of('OCProperties'),
    doc.context.obj({
      OCGs: [ocg],
      D: doc.context.obj({ Order: [ocg], ON: [ocg] }),
    }),
  )
  page.node.set(
    PDFName.of('Resources'),
    doc.context.obj({ Properties: doc.context.obj({ MC0: ocg }) }),
  )
  return { bytes: await doc.save(), ocg }
}

function names(doc: PDFDocument, arr: PDFArray | undefined): string[] {
  return (arr?.asArray() ?? []).map((ref) =>
    (
      doc.context.lookup(ref, PDFDict).lookup(PDFName.of('Name')) as PDFString
    ).decodeText(),
  )
}

describe('buildStampedPdf — calques existants préservés', () => {
  it('ajoute le calque du tampon sans effacer ceux du document', async () => {
    const { bytes, ocg } = await pdfWithLayer()
    const out = await PDFDocument.load(await buildStampedPdf(bytes, STAMP))
    const oc = out.catalog.lookup(PDFName.of('OCProperties'), PDFDict)
    expect(names(out, oc.lookup(PDFName.of('OCGs'), PDFArray))).toEqual([
      'Existant',
      'Tampon',
    ])
    const d = oc.lookup(PDFName.of('D'), PDFDict)
    expect(names(out, d.lookup(PDFName.of('ON'), PDFArray))).toEqual([
      'Existant',
      'Tampon',
    ])
    expect(names(out, d.lookup(PDFName.of('Order'), PDFArray))).toEqual([
      'Existant',
      'Tampon',
    ])

    // /MC0 garde sa cible d'origine ; le tampon prend un nom libre.
    const props = out
      .getPages()[0]
      .node.Resources()!
      .lookup(PDFName.of('Properties'), PDFDict)
    expect(props.get(PDFName.of('MC0'))).toEqual(ocg)
    const stampRef = props.get(PDFName.of('MC1'))
    expect(stampRef).toBeInstanceOf(PDFRef)
    expect(
      (
        out.context
          .lookup(stampRef, PDFDict)
          .lookup(PDFName.of('Name')) as PDFString
      ).decodeText(),
    ).toBe('Tampon')
  })

  it('PDF protégé par mot de passe : message clair en français', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([595, 842])
    doc.context.trailerInfo.Encrypt = doc.context.obj({ Filter: 'Standard' })
    const bytes = await doc.save()
    await expect(buildStampedPdf(bytes, STAMP)).rejects.toThrow(
      ENCRYPTED_PDF_MESSAGE,
    )
  })
})
