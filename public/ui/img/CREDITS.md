# Photo credits

All photographs on the CyberNet AI site come from Unsplash and are used under the
[Unsplash License](https://unsplash.com/license): free for commercial use, no payment, no account,
attribution optional (given here anyway). None of them is an Unsplash+ (paid) photo; each page was
re-checked on 14 Oct 2026 and shows "Free to use under the Unsplash License".
No photo shows a human face (a silhouette from behind, a hand in the dark, hardware and a fingerprint scanner).

The files in this folder are colour-graded derivatives made by `scripts/grade-images.py`
(crop, hue squeeze into the CyberNet palette, indigo-to-cyan gradient map, soft bloom, light leaks, vignette, grain).
The originals are not stored in the repository. To rebuild: `python scripts/grade-images.py`
(downloads the originals into a temp folder, needs Pillow and numpy).

| Files | Photo | Photographer | Unsplash page |
|---|---|---|---|
| `threat-hacker-*` | Person in silhouette against multiple monitors showing code | Kevin Horvat (@hidd3n) | https://unsplash.com/photos/person-in-silhouette-before-computer-code-Pyjp2zmxuLk |
| `threat-phone-*` | Person holding blue light in a dark room (a hand and a phone) | Akshar Dave | https://unsplash.com/photos/person-holding-blue-light-in-dark-room-sgNc8aY6Z7E |
| `threat-ai-*` | An AI chip on a circuit board | Omar López-Rincón (@procopiopi) | https://unsplash.com/photos/an-ai-chip-on-a-circuit-board-sNt81Whsncg |
| `ai-*` | A computer motherboard with glowing purple rings and spheres | Brecht Corbeel | https://unsplash.com/photos/a-computer-motherboard-with-glowing-purple-rings-and-spheres-xByHY-koWD4 |
| `servers-*` | Close-up of server cooling fans in a vibrant data center | Winston Chen (@winstonchen) | https://unsplash.com/photos/close-up-of-server-cooling-fans-in-a-vibrant-data-center-iZe21DzHnUg |
| `fingerprint-*` | A glowing fingerprint on a circular scanner | George Prentzas | https://unsplash.com/photos/glowing-fingerprint-on-circular-scanner-SRFG7iwktDk |

Source image ids (images.unsplash.com): `photo-1549605659-32d82da3a059`, `photo-1600856209923-34372e319a5d`,
`photo-1749006590639-e749e6b7d84c`, `photo-1782338938231-e0c8c901e6af`, `photo-1782094673136-5198a372980c`,
`photo-1585079374502-415f8516dcc3`.

## Files

Each image has four exports. 3:2 for tiles and wide cards, 4:5 for phones and tall tiles.
Always give `<img>` explicit `width` and `height` (below) so nothing shifts.

| File | Size (px) | Bytes |
|---|---|---|
| `threat-hacker-800.webp` / `-1600.webp` | 800x533 / 1600x1067 | 53,886 / 133,330 |
| `threat-hacker-4x5-800.webp` / `-4x5-1200.webp` | 800x1000 / 1200x1500 | 73,686 / 129,014 |
| `threat-phone-800.webp` / `-1600.webp` | 800x533 / 1600x1067 | 39,430 / 134,694 |
| `threat-phone-4x5-800.webp` / `-4x5-1200.webp` | 800x1000 / 1200x1500 | 72,552 / 139,602 |
| `threat-ai-800.webp` / `-1600.webp` | 800x533 / 1600x1067 | 37,354 / 102,030 |
| `threat-ai-4x5-800.webp` / `-4x5-1200.webp` | 800x1000 / 1200x1500 | 59,024 / 102,564 |
| `ai-800.webp` / `-1600.webp` | 800x533 / 1600x1067 | 52,594 / 136,710 |
| `ai-4x5-800.webp` / `-4x5-1200.webp` | 800x1000 / 1200x1500 | 80,348 / 139,558 |
| `servers-800.webp` / `-1600.webp` | 800x533 / 1600x1067 | 55,240 / 137,854 |
| `servers-4x5-800.webp` / `-4x5-1200.webp` | 800x1000 / 1200x1500 | 82,484 / 137,170 |
| `fingerprint-800.webp` / `-1600.webp` | 800x533 / 1600x1067 | 27,662 / 88,678 |
| `fingerprint-4x5-800.webp` / `-4x5-1200.webp` | 800x1000 / 1200x1500 | 51,278 / 99,242 |
