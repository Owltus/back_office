# Nuit du 12 au 13 septembre 2026 — première nuit sous surveillance

Première nuit après le déploiement de la veille et de la minuterie. Observée en
direct : interrogation de la base chaque minute, et capture du Worker Cloudflare.

**Le rapport est parti.** Envoyé à 02:32:13, 3 destinataires et 4 en copie.

---

## La séquence, à la seconde

| Heure (Paris) | Événement |
|---|---|
| 02:30:53 | 1er e-mail PMS reçu par le Worker — DKIM et DMARC en `pass` |
| 02:30:58 | 2e e-mail |
| 02:31:18 | 3e e-mail |
| 02:31:22 | **Comparison** importé (`daily_reports`, date 2026-09-12) |
| 02:32:12 | **Forecast** importé (`forecast_days`) — **51 secondes après** |
| 02:32:13 | **Rapport envoyé** |

In-House (37 chambres) et Addon (2 codes) également importés, contrairement à la
nuit précédente où ces deux-là n'étaient jamais arrivés.

## Ce qu'a fait la veille

```
02:31:23  comparison  contrôle 1  +1 s   Forecast pas frais (24 h)
02:31:39  comparison  contrôle 2  +17 s  Forecast pas frais
02:31:57  comparison  contrôle 3  +34 s  Forecast pas frais
02:32:14  comparison  contrôle 4  +51 s  déjà réservé par un autre chemin
02:32:14  forecast    contrôle 1  +1 s   ENVOYÉ — 3 destinataires (+4 cc)
02:32:29  comparison  contrôle 5  +67 s  déjà envoyé, la veille se retire
```

### Trois choses que cette trace établit

**L'écart était de 51 secondes**, le même qu'à la nuit ratée du 12. L'ancien code
renonçait après 4 secondes. La veille a regardé cinq fois sur 67 secondes.

**La course a été arbitrée proprement.** Le contrôle 4 du Comparison et le
contrôle 1 du Forecast sont tombés à la MÊME seconde (02:32:14). La réservation
atomique n'a laissé qu'un gagnant : un seul e-mail est parti.

**La couverture croisée était armée à une seconde près.** Le Comparison n'a pas
envoyé parce que le Forecast l'a devancé — mais son contrôle 5, quinze secondes
plus tard, aurait trouvé le Forecast frais et l'aurait envoyé lui-même. C'est
exactement ce qui manquait le 11 septembre.

### Un correctif de l'audit vérifié en conditions réelles

« déjà réservé par un autre chemin » est classé **réessayable** depuis l'audit du
2026-09-12. S'il était resté « définitif », la veille du Comparison serait morte
au contrôle 4 — sans conséquence cette nuit, mais si le gagnant avait échoué
après avoir réservé puis libéré, plus personne n'aurait repris.

---

## Le défaut trouvé cette nuit : la minuterie dormait

**Aucun déclenchement de la veille planifiée entre 02:00 et 02:31**, alors qu'elle
devait tirer toutes les deux minutes. Zéro ligne `trigger_report = 'veille
planifiée'` pour le cycle.

Le déclencheur était pourtant bien déclaré : `wrangler deploy` affichait
`schedule: */2 0-4 * * *` à chaque fois. Mais il ne tournait pas. Il a fallu un
**`wrangler triggers deploy` explicite** pour le réveiller — premier déclenchement
observé à 02:36:01, puis déduplication correcte (aucune ligne écrite, l'état
n'ayant pas changé).

Cause probable : une succession rapide de déploiements (accélération de la
minuterie pour un test, puis restauration, deux fois) a laissé le planificateur
Cloudflare dans un état incohérent. La sortie de `wrangler deploy` annonce le
calendrier qu'elle a ENVOYÉ, pas celui qui est ACTIF.

### Règle à retenir

**Après toute modification de `crons`, ne jamais se fier à la sortie du
déploiement.** Vérifier un déclenchement RÉEL dans `wrangler tail`, et lancer
`wrangler triggers deploy` si rien ne vient. La fenêtre d'envoi va jusqu'à 06h :
il reste largement le temps de le constater et de le corriger avant que le filet
ne soit nécessaire.

### Portée du défaut

Nulle cette nuit : les deux premiers chemins ont fonctionné, le troisième n'a pas
servi. Mais c'est précisément le filet destiné à couvrir un rapport très en
retard, ou une invocation d'import qui disparaît. Il doit être vérifié actif.

---

## Bilan

| | |
|---|---|
| Rapport envoyé | oui, 02:32:13 |
| Déclenché par | l'arrivée du Forecast (le second des deux) |
| Doublon | aucun — course arbitrée |
| Journal | 6 lignes, lisibles, sans bruit |
| Veille du Comparison | 5 contrôles sur 67 s, retrait propre |
| Veille planifiée | **n'a pas tourné**, réveillée à 02:36 |
| 4 rapports PMS | tous reçus et importés |

Le chantier tient sur sa première nuit réelle. Le seul point ouvert est la
fiabilité d'enregistrement du déclencheur Cloudflare, à revérifier demain matin
et après chaque déploiement du Worker.
