import { useEffect, useState } from 'react'

import { renderMermaid } from '#/lib/classeur/mermaid.ts'

/**
 * Nettoie un SVG en supprimant les balises <script> et les attributs
 * d'événements (on*) pour prévenir les attaques XSS.
 */
function sanitizeSvg(raw: string): string {
  // Supprimer les balises <script>...</script> et <script ... />
  let cleaned = raw.replace(/<script[\s\S]*?<\/script\s*>/gi, '')
  cleaned = cleaned.replace(/<script[\s\S]*?\/?>/gi, '')
  // Supprimer les attributs on* (onclick, onerror, onload, etc.)
  cleaned = cleaned.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  // Supprimer les href/xlink:href javascript:
  cleaned = cleaned.replace(
    /\s+(href|xlink:href)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi,
    '',
  )
  return cleaned
}

/*
 * Rend un diagramme Mermaid en SVG — porté de Registre.
 *
 * Expose un attribut `data-mermaid-status` pour que la pagination
 * (`usePagination`) puisse attendre que tous les diagrammes soient prêts.
 * Un diagramme en erreur (syntaxe) passe en `rendered` avec un message
 * discret : la pagination ne doit jamais attendre indéfiniment.
 */
export function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    renderMermaid(code)
      .then((result) => {
        if (!cancelled) setSvg(sanitizeSvg(result))
      })
      .catch(() => {
        if (!cancelled) {
          setSvg(null)
          setFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [code])

  if (failed) {
    return (
      <div
        data-mermaid-status="rendered"
        className="classeur-mermaid-error"
        role="note"
      >
        Diagramme illisible
      </div>
    )
  }

  if (!svg) {
    return (
      <div
        data-mermaid-status="pending"
        className="flex items-center justify-center py-4"
        role="status"
        aria-label="Chargement"
      >
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  return (
    <div
      data-mermaid-status="rendered"
      dangerouslySetInnerHTML={{ __html: svg }}
      style={{ textAlign: 'center' }}
    />
  )
}
