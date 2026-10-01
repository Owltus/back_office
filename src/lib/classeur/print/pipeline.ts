/*
 * LE pipeline Markdown du Classeur (2026-10-01) : la page, l'impression et
 * l'aide « Mettre en forme » l'utilisent tous — l'aide n'avait que
 * `remark-gfm` et ne montrait donc pas le vrai rendu.
 *
 * Ordre significatif : `remarkBlocs` après `remark-directive` (liste
 * blanche), `rehypeFigures` avant `rehypeBlocs` (les blocs rangent des
 * figures), `rehypeLignesSource` en dernier (il numérote ce qui existe).
 */

import rehypeKatex from 'rehype-katex'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import type { Options } from 'react-markdown'

import { rehypeBlocs } from '#/lib/classeur/print/rehypeBlocs.ts'
import { rehypeEncadres } from '#/lib/classeur/print/rehypeEncadres.ts'
import { rehypeFigures } from '#/lib/classeur/print/rehypeFigures.ts'
import { rehypeLignesSource } from '#/lib/classeur/print/lignesSource.ts'
import { remarkBlocs } from '#/lib/classeur/print/remarkBlocs.ts'

type Plugins = NonNullable<Options['remarkPlugins']>

export const REMARK_CLASSEUR: Plugins = [
  remarkGfm,
  remarkMath,
  remarkDirective,
  remarkBlocs,
]

export const REHYPE_CLASSEUR: Plugins = [
  rehypeKatex,
  rehypeFigures,
  rehypeBlocs,
  rehypeEncadres,
  rehypeLignesSource,
]
