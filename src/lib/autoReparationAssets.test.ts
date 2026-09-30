import { describe, expect, it, vi } from 'vitest'

import {
  AUTO_REPARATION_SCRIPT,
  CLE_AUTO_REPARATION,
} from '#/lib/autoReparationAssets.ts'

/*
 * Le script tourne hors du bundle, sur des globales (`addEventListener`,
 * `location`, `sessionStorage`, `fetch`) : on l'exécute tel quel en les lui
 * fournissant, pour observer ce qu'il fait d'un échec de chargement.
 */
function executer(options: { ok: boolean; dernier?: number }) {
  let ecouteur: ((e: { target: unknown }) => void) | null = null
  const stockage = new Map<string, string>()
  if (options.dernier !== undefined)
    stockage.set(CLE_AUTO_REPARATION, String(options.dernier))
  const sessionStorage = {
    getItem: (k: string) => stockage.get(k) ?? null,
    setItem: (k: string, v: string) => void stockage.set(k, v),
  }
  const location = {
    href: 'https://backoffice.naostack.com/classeur',
    origin: 'https://backoffice.naostack.com',
    reload: vi.fn(),
  }
  const fetch = vi.fn(() => Promise.resolve({ ok: options.ok }))
  const addEventListener = (
    type: string,
    fn: (e: { target: unknown }) => void,
  ) => {
    if (type === 'error') ecouteur = fn
  }
  new Function(
    'addEventListener',
    'location',
    'sessionStorage',
    'fetch',
    AUTO_REPARATION_SCRIPT,
  )(addEventListener, location, sessionStorage, fetch)
  const echec = async (target: unknown) => {
    ecouteur?.({ target })
    await Promise.resolve()
    await Promise.resolve()
  }
  return { echec, fetch, location, stockage }
}

const script = (src: string) => ({ tagName: 'SCRIPT', src })

describe('auto-réparation des fichiers /assets/', () => {
  it('re-télécharge sans cache puis recharge une fois si le fichier existe', async () => {
    const t = executer({ ok: true })
    await t.echec(
      script('https://backoffice.naostack.com/assets/index-Ab12.js'),
    )
    expect(t.fetch).toHaveBeenCalledWith(
      'https://backoffice.naostack.com/assets/index-Ab12.js',
      { cache: 'reload' },
    )
    expect(t.location.reload).toHaveBeenCalledTimes(1)
    expect(t.stockage.has(CLE_AUTO_REPARATION)).toBe(true)
  })

  it('ne recharge pas si le fichier est vraiment absent (vieil onglet)', async () => {
    const t = executer({ ok: false })
    await t.echec(script('https://backoffice.naostack.com/assets/ancien.js'))
    expect(t.location.reload).not.toHaveBeenCalled()
  })

  it('pas plus d’un rechargement par minute', async () => {
    const t = executer({ ok: true, dernier: Date.now() - 5_000 })
    await t.echec(
      script('https://backoffice.naostack.com/assets/index-Ab12.js'),
    )
    expect(t.fetch).not.toHaveBeenCalled()
    expect(t.location.reload).not.toHaveBeenCalled()
  })

  it('ignore ce qui n’est pas un fichier /assets/ du site', async () => {
    const t = executer({ ok: true })
    await t.echec(script('https://autre-site.fr/assets/x.js'))
    await t.echec(script('https://backoffice.naostack.com/api/x.js'))
    await t.echec({
      tagName: 'IMG',
      src: 'https://backoffice.naostack.com/assets/a.png',
    })
    await t.echec(null)
    expect(t.fetch).not.toHaveBeenCalled()
  })

  it('suit aussi un <link> (feuille de style, modulepreload)', async () => {
    const t = executer({ ok: true })
    await t.echec({
      tagName: 'LINK',
      href: 'https://backoffice.naostack.com/assets/index-Cd34.css',
    })
    expect(t.location.reload).toHaveBeenCalledTimes(1)
  })
})
