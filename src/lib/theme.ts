/*
 * Thème clair / sombre.
 *
 * La source de vérité est la classe `dark` sur <html> — celle que Tailwind lit
 * (`@custom-variant dark` dans styles.css). Ce module l'expose sous forme de
 * petit store abonnable, consommé par `useSyncExternalStore` : tous les menus
 * affichent donc le même état sans qu'un provider ait à être monté.
 *
 * Le choix est persisté en localStorage et réappliqué AVANT le premier paint par
 * THEME_INIT_SCRIPT (voir routes/__root.tsx). Sans ce script, la page s'afficherait
 * en sombre le temps que React s'hydrate, puis basculerait en clair.
 */

export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'back-office:theme'

/** Le sombre reste le défaut de l'app (thème navy) et ce que rend le SSR. */
export const DEFAULT_THEME: Theme = 'dark'

/**
 * Injecté en tête de <head>, il s'exécute hors du bundle : à garder autonome et
 * sans dépendance. `localStorage` lève une exception en navigation privée
 * verrouillée, d'où le try — on retombe alors sur la classe rendue par le SSR.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t!=='light'&&t!=='dark')t='${DEFAULT_THEME}';document.documentElement.classList.toggle('dark',t==='dark')}catch(e){}`

/** Le thème réellement appliqué au document — pas celui stocké : c'est lui que
 * l'interface doit refléter. Sur le serveur, le défaut, comme <html>. */
function readDocument(): Theme {
  if (typeof document === 'undefined') return DEFAULT_THEME
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

// Ce module est importé après l'exécution de THEME_INIT_SCRIPT : le document
// porte déjà le bon thème au moment de lire cette valeur initiale.
let current: Theme = readDocument()
const listeners = new Set<() => void>()

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getTheme(): Theme {
  return current
}

/** Snapshot SSR : `useSyncExternalStore` l'exige, et il doit valoir ce que le
 * serveur a rendu. */
export function getServerTheme(): Theme {
  return DEFAULT_THEME
}

export function setTheme(theme: Theme): void {
  current = theme
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Navigation privée verrouillée : le thème s'applique, il ne survit pas au
    // rechargement. Préférable à un plantage du menu.
  }
  for (const listener of listeners) listener()
}
