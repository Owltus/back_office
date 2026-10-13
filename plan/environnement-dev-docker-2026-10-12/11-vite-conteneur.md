# Étape 11 — (Optionnelle) Vite dans un conteneur
> **RETIRÉE le 2026-10-13 (D2-B, choix utilisateur).** Conservée pour mémoire.

## Objectif

Seulement si D2 = A : l'app elle-même tourne dans un conteneur, et
`docker compose up` lance tout. Sinon, l'étape est sautée et marquée
« RETIRÉE (D2-B) ».

## Fichier(s) impacté(s)

- `Dockerfile.dev`, `compose.yaml`, `.dockerignore` (nouveaux)
- `vite.config.ts` (`server.host`, `watch.usePolling` sous variable)

## Travail à réaliser

1. Image Node 24 + pnpm figés (versions de `package.json`).
2. `node_modules` en volume nommé : les binaires natifs (esbuild,
   lightningcss) diffèrent entre Windows et Linux.
3. Sources en montage ; `CHOKIDAR_USEPOLLING` ou dépôt cloné dans WSL2
   (performances à mesurer, les deux sont chiffrés dans le bilan).
4. Réseau : l'app joint la stack par `host.docker.internal:54321`, et le
   navigateur par `127.0.0.1:54321` (deux URL : à documenter).

## Critère de validation

- Rechargement à chaud < 2 s après une modification (mesuré).
- `pnpm dev` sur le poste fonctionne toujours (les deux voies coexistent).
- Commit sans push.
