import { useEffect, useState } from 'react'

/**
 * Horloge de rendu : renvoie `Date` courante, rafraîchie toutes les `intervalMs`
 * (1 min par défaut). Sert aux règles qui basculent AVEC L'HEURE sans autre
 * signal (mode manuel à 03h, fin de fenêtre pipeline à 04h) : une page laissée
 * ouverte doit se mettre à jour sans rechargement ni interaction.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
