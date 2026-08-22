import { useEffect, useState } from 'react'

/** `false` au premier rendu (SSR-safe), recalculé côté client via `matchMedia`
 * puis tenu à jour par son événement `change`. */
export function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const update = () => setMatches(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [query])
  return matches
}
