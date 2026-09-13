# Journaux bruts de la nuit du 12 au 13 septembre 2026

Extraits NETTOYES et DEDOUBLONNES des deux captures de la surveillance.

Le journal de la base comptait 219 instantanes (un par minute), quasi tous
identiques : seules les TRANSITIONS sont conservees ici. Cote Worker, le detail
DKIM/DMARC de chaque e-mail est retire (identique et tres verbeux) ; l'essentiel
est que les quatre e-mails ont passe le controle d'authenticite.

Note d'encodage : la sortie du CLI Supabase etait decodee en cp1252 par le
script de surveillance, ce qui abimait les accents. Repare ici.

## Etat de la base — transitions uniquement

```
2026-09-12 23:45:02 | === debut de la surveillance ===
2026-09-12 23:45:02 | surveillance armee — import attendu vers 02h31 Paris
2026-09-12 23:45:04 | rapport=2026-09-11 comparison=02:31:05 forecast=02:31:59 ENVOYE=None | journal=3 ligne(s) — hors fenêtre horaire — envoi auto ignoré | in-house=39 addon=3
2026-09-12 23:45:04 | etat de depart — rapport=2026-09-11 comparison=02:31:05 forecast=02:31:59 ENVOYE=None | journal=3 ligne(s) — hors fenêtre horaire — envoi auto ignoré | in-house=39 addon=3
2026-09-12 23:46:05 | rapport=2026-09-11 comparison=02:31:05 forecast=02:31:59 ENVOYE=None | journal=3 ligne(s) — hors fenêtre horaire — envoi auto ignoré | in-house=39 addon=3
2026-09-13 02:00:43 | rapport=2026-09-11 comparison=02:31:05 forecast=02:31:59 ENVOYE=None | journal=0 ligne(s) — None | in-house=0 addon=0
2026-09-13 02:00:43 | CHANGEMENT — rapport=2026-09-11 comparison=02:31:05 forecast=02:31:59 ENVOYE=None | journal=0 ligne(s) — None | in-house=0 addon=0
2026-09-13 02:01:44 | rapport=2026-09-11 comparison=02:31:05 forecast=02:31:59 ENVOYE=None | journal=0 ligne(s) — None | in-house=0 addon=0
2026-09-13 02:31:22 | rapport=2026-09-11 comparison=02:31:05 forecast=02:31:59 ENVOYE=None | journal=0 ligne(s) — None | in-house=37 addon=2
2026-09-13 02:31:22 | CHANGEMENT — rapport=2026-09-11 comparison=02:31:05 forecast=02:31:59 ENVOYE=None | journal=0 ligne(s) — None | in-house=37 addon=2
2026-09-13 02:32:23 | rapport=2026-09-12 comparison=02:31:22 forecast=02:32:12 ENVOYE=02:32:13 | journal=5 ligne(s) — envoyé le rapport du 2026-09-12 à 3 destinataire(s) (+4 cc) | in-house=37 addon=2
2026-09-13 02:32:23 | CHANGEMENT — rapport=2026-09-12 comparison=02:31:22 forecast=02:32:12 ENVOYE=02:32:13 | journal=5 ligne(s) — envoyé le rapport du 2026-09-12 à 3 destinataire(s) (+4 cc) | in-house=37 addon=2
2026-09-13 02:32:23 | RAPPORT ENVOYE a 02:32:13 pour le 2026-09-12 — journal : envoyé le rapport du 2026-09-12 à 3 destinataire(s) (+4 cc)
2026-09-13 02:33:24 | rapport=2026-09-12 comparison=02:31:22 forecast=02:32:12 ENVOYE=02:32:13 | journal=6 ligne(s) — déjà envoyé (2026-09-12) | in-house=37 addon=2
2026-09-13 02:33:24 | CHANGEMENT — rapport=2026-09-12 comparison=02:31:22 forecast=02:32:12 ENVOYE=02:32:13 | journal=6 ligne(s) — déjà envoyé (2026-09-12) | in-house=37 addon=2
2026-09-13 02:34:25 | rapport=2026-09-12 comparison=02:31:22 forecast=02:32:12 ENVOYE=02:32:13 | journal=6 ligne(s) — déjà envoyé (2026-09-12) | in-house=37 addon=2
2026-09-13 02:50:42 | rapport=2026-09-12 comparison=02:31:22 forecast=02:32:12 ENVOYE=02:32:13 | journal=7 ligne(s) — déjà envoyé (2026-09-12) | in-house=37 addon=2
2026-09-13 02:50:42 | CHANGEMENT — rapport=2026-09-12 comparison=02:31:22 forecast=02:32:12 ENVOYE=02:32:13 | journal=7 ligne(s) — déjà envoyé (2026-09-12) | in-house=37 addon=2
2026-09-13 02:51:43 | rapport=2026-09-12 comparison=02:31:22 forecast=02:32:12 ENVOYE=02:32:13 | journal=7 ligne(s) — déjà envoyé (2026-09-12) | in-house=37 addon=2
2026-09-13 03:00:53 | BILAN 03h00 Paris — ENVOYE. rapport=2026-09-12 comparison=02:31:22 forecast=02:32:12 ENVOYE=02:32:13 | journal=7 ligne(s) — déjà envoyé (2026-09-12) | in-house=37 addon=2
2026-09-13 03:01:54 | rapport=2026-09-12 comparison=02:31:22 forecast=02:32:12 ENVOYE=02:32:13 | journal=7 ligne(s) — déjà envoyé (2026-09-12) | in-house=37 addon=2
2026-09-13 03:15:09 | fin de la surveillance. rapport=2026-09-12 comparison=02:31:22 forecast=02:32:12 ENVOYE=02:32:13 | journal=7 ligne(s) — déjà envoyé (2026-09-12) | in-house=37 addon=2
2026-09-13 03:15:09 | === fin ===
```

## Worker Cloudflare — e-mails recus et minuterie

```
"* * * * *" @ 12/09/2026 23:44:59 | minuterie OK
"* * * * *" @ 12/09/2026 23:45:59 | minuterie OK
"* * * * *" @ 12/09/2026 23:46:59 | minuterie OK
"* * * * *" @ 12/09/2026 23:47:59 | minuterie OK
"* * * * *" @ 12/09/2026 23:48:59 | minuterie OK
"* * * * *" @ 12/09/2026 23:49:59 | minuterie OK
"* * * * *" @ 12/09/2026 23:50:59 | minuterie OK
"* * * * *" @ 12/09/2026 23:51:59 | minuterie OK
"* * * * *" @ 12/09/2026 23:52:59 | minuterie OK
"* * * * *" @ 12/09/2026 23:53:59 | minuterie OK
"* * * * *" @ 12/09/2026 23:54:59 | minuterie OK
"* * * * *" @ 12/09/2026 23:55:59 | minuterie OK
"* * * * *" @ 12/09/2026 23:56:59 | minuterie OK
"* * * * *" @ 12/09/2026 23:57:59 | minuterie OK
"* * * * *" @ 12/09/2026 23:58:59 | minuterie OK
"* * * * *" @ 12/09/2026 23:59:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:00:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:01:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:02:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:03:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:04:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:05:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:06:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:07:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:08:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:09:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:10:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:11:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:12:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:13:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:14:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:15:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:16:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:17:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:18:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:19:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:20:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:21:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:22:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:23:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:24:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:25:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:26:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:27:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:28:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:29:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:30:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:31:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:32:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:33:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:34:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:35:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:36:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:37:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:38:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:39:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:40:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:41:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:42:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:43:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:44:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:45:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:46:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:47:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:48:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:49:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:50:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:51:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:52:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:53:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:54:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:55:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:56:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:57:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:58:59 | minuterie OK
"* * * * *" @ 13/09/2026 00:59:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:00:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:01:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:02:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:03:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:04:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:05:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:06:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:07:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:08:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:09:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:10:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:11:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:12:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:13:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:14:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:15:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:16:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:17:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:18:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:19:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:20:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:21:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:22:59 | minuterie OK
"* * * * *" @ 13/09/2026 01:23:59 | minuterie OK
13/09/2026 02:30:53 | e-mail PMS recu, 5552 octets
13/09/2026 02:30:58 | e-mail PMS recu, 16762 octets
13/09/2026 02:31:18 | e-mail PMS recu, 9473 octets
13/09/2026 02:32:11 | e-mail PMS recu, 15668 octets
"*/2 0-4 * * *" @ 13/09/2026 02:36:01 | minuterie OK
"*/2 0-4 * * *" @ 13/09/2026 02:38:01 | minuterie OK
"*/2 0-4 * * *" @ 13/09/2026 02:40:01 | minuterie OK
"*/2 0-4 * * *" @ 13/09/2026 02:42:01 | minuterie OK
"*/2 0-4 * * *" @ 13/09/2026 02:44:01 | minuterie OK
"*/2 0-4 * * *" @ 13/09/2026 02:46:01 | minuterie OK
"*/2 0-4 * * *" @ 13/09/2026 02:48:01 | minuterie OK
"*/2 0-4 * * *" @ 13/09/2026 02:50:01 | minuterie OK
"*/2 0-4 * * *" @ 13/09/2026 02:52:01 | minuterie OK
"*/2 0-4 * * *" @ 13/09/2026 02:54:01 | minuterie OK
"*/2 0-4 * * *" @ 13/09/2026 02:56:01 | minuterie OK
"*/2 0-4 * * *" @ 13/09/2026 02:58:01 | minuterie OK
"*/2 0-4 * * *" @ 13/09/2026 03:00:01 | minuterie OK
"*/2 0-4 * * *" @ 13/09/2026 03:02:01 | minuterie OK
"*/2 0-4 * * *" @ 13/09/2026 03:04:01 | minuterie OK
"*/2 0-4 * * *" @ 13/09/2026 03:06:01 | minuterie OK
"*/2 0-4 * * *" @ 13/09/2026 03:08:01 | minuterie OK
"*/2 0-4 * * *" @ 13/09/2026 03:10:01 | minuterie OK
"*/2 0-4 * * *" @ 13/09/2026 03:12:01 | minuterie OK
"*/2 0-4 * * *" @ 13/09/2026 03:14:01 | minuterie OK
"*/2 0-4 * * *" @ 13/09/2026 03:16:01 | minuterie OK
```
