import React from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'

import { MermaidBlock } from '#/components/classeur/MermaidBlock.tsx'
import {
  ImageAInserer,
  ImageDocument,
} from '#/components/classeur/print/ImageDocument.tsx'
import { A4Page } from '#/components/classeur/print/A4Page.tsx'
import {
  estCheminImage,
  estImageAInserer,
  tailleDepuisTitre,
} from '#/lib/classeur/images.ts'
import {
  CONTENT_HEIGHT_MM,
  DOCUMENT_CONTENT_HEIGHT_WITH_SUBTITLE_MM,
  PAGE_FONT_FAMILY,
  PAGE_FONT_SIZE,
  PAGE_LINE_HEIGHT,
} from '#/lib/classeur/print/constants.ts'
import {
  REHYPE_CLASSEUR,
  REMARK_CLASSEUR,
} from '#/lib/classeur/print/pipeline.ts'
import {
  PAGEBREAK_MARKER,
  preprocessPageBreaks,
} from '#/lib/classeur/print/preprocessPageBreaks.ts'
import {
  getContentWidthPx,
  usePagination,
} from '#/lib/classeur/print/usePagination.ts'
import type { PageData } from '#/lib/classeur/print/usePagination.ts'

interface DocumentPagesProps {
  title: string
  subtitle?: string
  /** Markdown brut (`DbDocument.content`). */
  content: string
  chapterName?: string
  classeurName?: string
  establishment?: string
  /** Masquer la numérotation des pages (pour impression de masse) */
  hidePagination?: boolean
  /** Date discrète sous le pied de page (jj/mm/aaaa, `mentionVersion`). */
  mention?: string
  /** Nombre de pages, remonté à chaque pagination terminée (éditeur). */
  onPageCount?: (pages: number) => void
  /** Les pages paginées (remplissage, sauts) : relecture de l'éditeur. */
  onPagination?: (pages: readonly PageData[]) => void
}

/** Vérifie si tous les enfants textuels d'un nœud React sont vides */
function isEmptyHeader(children: React.ReactNode): boolean {
  const arr = React.Children.toArray(children)
  return arr.every((child) => {
    if (typeof child === 'string' || typeof child === 'number')
      return String(child).trim() === ''
    if (React.isValidElement<{ children?: React.ReactNode }>(child))
      return isEmptyHeader(child.props.children)
    return true
  })
}

/** Composants custom pour ReactMarkdown (sauts de page + Mermaid + thead vide) */
const markdownComponents: Components = {
  // `rest` porte `data-ligne` (lien aperçu ⇄ texte, `rehypeLignesSource`).
  p: ({ children, node: _node, ...rest }) => {
    const text = React.Children.toArray(children)
    if (
      text.length === 1 &&
      typeof text[0] === 'string' &&
      text[0].trim() === PAGEBREAK_MARKER
    ) {
      return <div data-page-break="true" />
    }
    return <p {...rest}>{children}</p>
  },
  code: ({ className, children }) => {
    if (className === 'language-mermaid') {
      return <MermaidBlock code={String(children).trim()} />
    }
    return <code className={className}>{children}</code>
  },
  thead: ({ children }) => {
    if (isEmptyHeader(children)) return null
    return <thead>{children}</thead>
  },
  // Image du bucket privé : lue par l'API authentifiée, jamais par URL.
  // Une adresse EXTERNE n'est pas chargée (audit du 2026-09-28) : elle
  // révélerait au site tiers qui lit le document et quand. La CSP de
  // production la bloque déjà ; on l'annonce plutôt qu'une image cassée.
  img: ({ src, alt, title }) =>
    estImageAInserer(src) ? (
      <ImageAInserer alt={alt} title={title} />
    ) : estCheminImage(src) ? (
      <ImageDocument chemin={src} alt={alt} title={title} />
    ) : typeof src !== 'string' || !/^(data:image\/|blob:)/i.test(src) ? (
      <span
        role="img"
        aria-label={alt ?? 'Image externe non affichée'}
        style={{
          display: 'inline-block',
          border: '0.5pt dashed #666',
          padding: '2mm 4mm',
          color: '#666',
          fontSize: '8pt',
        }}
      >
        Image externe non affichée{alt ? ` : ${alt}` : ''}
      </span>
    ) : (
      <img src={src} alt={alt ?? ''} data-taille={tailleDepuisTitre(title)} />
    ),
}

/*
 * Rend un document Markdown en N pages A4 — porté de Registre.
 * Phase 1 : mesure dans un conteneur caché → découpage en pages.
 * Phase 2 : rendu du HTML extrait de chaque page dans un <A4Page>.
 */
export function DocumentPages({
  title,
  subtitle,
  content,
  chapterName,
  classeurName,
  establishment,
  hidePagination,
  mention,
  onPageCount,
  onPagination,
}: DocumentPagesProps) {
  const processedContent = React.useMemo(
    () => preprocessPageBreaks(content),
    [content],
  )
  // La page réserve la ligne de sous-titre dès que `subtitle` est défini
  // (`A4Page`) : le budget de pagination doit la retirer, sinon débordement.
  const { pages, measuring, measureRef } = usePagination(
    processedContent,
    subtitle !== undefined
      ? DOCUMENT_CONTENT_HEIGHT_WITH_SUBTITLE_MM
      : CONTENT_HEIGHT_MM,
  )

  const contentWidthPx = getContentWidthPx()

  React.useEffect(() => {
    if (!measuring && pages.length > 0) onPageCount?.(pages.length)
  }, [measuring, pages.length, onPageCount])

  React.useEffect(() => {
    if (!measuring && pages.length > 0) onPagination?.(pages)
  }, [measuring, pages, onPagination])

  return (
    <>
      {/* Conteneur de mesure caché — rendu via portal hors de tout conteneur
          transformé pour que getBoundingClientRect() retourne les vraies
          dimensions */}
      {createPortal(
        <div
          ref={measureRef}
          className="pdf-prose"
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: '-9999px',
            top: 0,
            width: `${contentWidthPx}px`,
            visibility: 'hidden',
            fontFamily: PAGE_FONT_FAMILY,
            fontSize: PAGE_FONT_SIZE,
            lineHeight: PAGE_LINE_HEIGHT,
          }}
        >
          <ReactMarkdown
            remarkPlugins={REMARK_CLASSEUR}
            rehypePlugins={REHYPE_CLASSEUR}
            components={markdownComponents}
          >
            {processedContent}
          </ReactMarkdown>
        </div>,
        document.body,
      )}

      {/* Pages A4 — on garde les anciennes pages visibles pendant la re-mesure
          pour ne pas détruire le DOM ni perdre la position de scroll */}
      {pages.map((page, i) => (
        <A4Page
          key={i}
          title={title}
          subtitle={subtitle}
          pageNumber={hidePagination ? undefined : i + 1}
          totalPages={hidePagination ? undefined : pages.length}
          chapterName={chapterName}
          classeurName={classeurName}
          establishment={establishment}
          mention={mention}
        >
          <div dangerouslySetInnerHTML={{ __html: page.html }} />
        </A4Page>
      ))}

      {/* Spinner uniquement lors du tout premier chargement */}
      {measuring && pages.length === 0 && (
        <div
          className="flex items-center justify-center py-12"
          role="status"
          aria-label="Chargement"
        >
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      )}
    </>
  )
}
