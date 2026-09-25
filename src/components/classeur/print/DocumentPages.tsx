import React from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

import { MermaidBlock } from '#/components/classeur/MermaidBlock.tsx'
import { A4Page } from '#/components/classeur/print/A4Page.tsx'
import { PAGE_FONT_FAMILY } from '#/lib/classeur/print/constants.ts'
import {
  PAGEBREAK_MARKER,
  preprocessPageBreaks,
} from '#/lib/classeur/print/preprocessPageBreaks.ts'
import {
  getContentWidthPx,
  usePagination,
} from '#/lib/classeur/print/usePagination.ts'

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
  p: ({ children }) => {
    const text = React.Children.toArray(children)
    if (
      text.length === 1 &&
      typeof text[0] === 'string' &&
      text[0].trim() === PAGEBREAK_MARKER
    ) {
      return <div data-page-break="true" />
    }
    return <p>{children}</p>
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
}: DocumentPagesProps) {
  const processedContent = React.useMemo(
    () => preprocessPageBreaks(content),
    [content],
  )
  const { pages, measuring, measureRef } = usePagination(processedContent)

  const contentWidthPx = getContentWidthPx()

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
            fontSize: '9pt',
            lineHeight: 1.6,
          }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
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
