/*
 * Auto-réparation d'un fichier `/assets/` resté en cache en 404 (2026-09-30).
 *
 * Constaté après une mise en ligne : la console affichait un 404 sur le point
 * d'entrée `assets/index-….js`, alors que ce fichier EXISTAIT dans la version
 * en ligne (requête faite pendant la bascule). Or `vercel.json` sert tout
 * `/assets/*` en `max-age=31536000, immutable` — erreurs comprises, Vercel ne
 * sait pas conditionner un en-tête au code de réponse. Le navigateur peut donc
 * garder ce 404 un an : page blanche jusqu'à un rechargement forcé.
 *
 * Ce script, injecté en tête de <head> AVANT l'application (comme le script
 * du thème), écoute les échecs de chargement des `<script>` / `<link>` du
 * site sous `/assets/`. Il re-télécharge le fichier en CONTOURNANT le cache
 * (`cache: 'reload'`, ce qui remplace l'entrée en cache) et, si le fichier
 * existe bien, recharge la page UNE fois. S'il n'existe vraiment pas (vieil
 * onglet après un déploiement), il ne fait rien : `vite:preloadError`
 * (router.tsx) et `RouteError` s'en chargent. Au plus un rechargement par
 * minute (garde en `sessionStorage` ; stockage inaccessible = rien).
 *
 * Autonome et sans dépendance : il s'exécute hors du bundle.
 */

export const CLE_AUTO_REPARATION = 'bo.assets.reparation.v1'

export const AUTO_REPARATION_SCRIPT = `(function(){var K='${CLE_AUTO_REPARATION}';addEventListener('error',function(e){var t=e.target;if(!t||!t.tagName)return;var u=t.tagName==='SCRIPT'?t.src:(t.tagName==='LINK'?t.href:'');if(!u)return;try{var p=new URL(u,location.href);if(p.origin!==location.origin||p.pathname.indexOf('/assets/')!==0)return;if(Date.now()-(Number(sessionStorage.getItem(K))||0)<60000)return}catch(x){return}fetch(u,{cache:'reload'}).then(function(r){if(!r.ok)return;try{sessionStorage.setItem(K,String(Date.now()))}catch(x){return}location.reload()},function(){})},true)})()`
