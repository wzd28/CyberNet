# Photo credits

All photographs on the CyberNet AI site come from Unsplash and are used under the
[Unsplash License](https://unsplash.com/license): free for commercial use, no payment, no account,
attribution optional (given here anyway). None of them is an Unsplash+ (paid) photo: the search listing and the
per-photo record both say `premium: false, plus: false` (re-checked on 14 Oct 2026).
No photo shows a human face (a hooded figure seen from behind, hardware and a fingerprint scanner).

The files in this folder are colour-graded derivatives made by `scripts/grade-images.py` (v4.1 "Midnight"):
crop, every hue collapsed onto one cool axis (no purple), a navy-to-slate-to-cyan gradient map (midnight navy shadows,
neutral slate mids, cyan highlights), a restrained bloom, one cyan rim light, a navy vignette, a light unsharp mask and
a whisper of grain. The hacker photo also has one stray scribble on a monitor bezel painted out.
The originals are not stored in the repository. To rebuild: `python scripts/grade-images.py`
(downloads the originals into a temp folder, needs Pillow and numpy).

| Files | Photo | Photographer | Unsplash page |
|---|---|---|---|
| `threat-hacker-*` | Hacker in hoodie working on multiple computer screens (seen from behind, hand on the keyboard, two monitors of code) | Julio Lopez (@juliolopez) | https://unsplash.com/photos/hacker-in-hoodie-working-on-multiple-computer-screens-hLAmfdxGlls |
| `threat-ai-*` | An AI chip on a circuit board | Omar López-Rincón (@procopiopi) | https://unsplash.com/photos/an-ai-chip-on-a-circuit-board-sNt81Whsncg |
| `ai-*` | A computer motherboard with glowing rings and spheres | Brecht Corbeel | https://unsplash.com/photos/a-computer-motherboard-with-glowing-purple-rings-and-spheres-xByHY-koWD4 |
| `servers-*` | Close-up of server cooling fans in a data center | Winston Chen (@winstonchen) | https://unsplash.com/photos/close-up-of-server-cooling-fans-in-a-vibrant-data-center-iZe21DzHnUg |
| `fingerprint-*` | A glowing fingerprint on a circular scanner | George Prentzas | https://unsplash.com/photos/glowing-fingerprint-on-circular-scanner-SRFG7iwktDk |

Source image ids (images.unsplash.com): `photo-1760199789455-49098afd02f0`, `photo-1749006590639-e749e6b7d84c`,
`photo-1782338938231-e0c8c901e6af`, `photo-1782094673136-5198a372980c`, `photo-1585079374502-415f8516dcc3`.

Changes on 14 Oct 2026 (owner feedback on the v4 preview): the hacker tile now shows a real "someone is hacking" scene
(it replaced Kevin Horvat's silhouette, `photo-1549605659-32d82da3a059`, which was only a black head in front of monitors),
the whole set moved from violet to midnight navy and cyan, and the phone photo (Akshar Dave,
`photo-1600856209923-34372e319a5d`, `threat-phone-*`) was dropped because no tile uses it any more.

## Files

Each image has four exports. 3:2 for tiles and wide cards, 4:5 for phones and tall tiles.
Always give `<img>` explicit `width` and `height` (below) so nothing shifts. Every 1600 and 1200 file is at most 140,000 bytes.

| File | Size (px) | Bytes |
|---|---|---|
| `threat-hacker-800.webp` / `-1600.webp` | 800x533 / 1600x1067 | 49,436 / 138,648 |
| `threat-hacker-4x5-800.webp` / `-4x5-1200.webp` | 800x1000 / 1200x1500 | 42,960 / 81,128 |
| `threat-ai-800.webp` / `-1600.webp` | 800x533 / 1600x1067 | 26,192 / 66,084 |
| `threat-ai-4x5-800.webp` / `-4x5-1200.webp` | 800x1000 / 1200x1500 | 35,926 / 65,896 |
| `ai-800.webp` / `-1600.webp` | 800x533 / 1600x1067 | 46,972 / 133,170 |
| `ai-4x5-800.webp` / `-4x5-1200.webp` | 800x1000 / 1200x1500 | 80,684 / 138,022 |
| `servers-800.webp` / `-1600.webp` | 800x533 / 1600x1067 | 54,234 / 137,946 |
| `servers-4x5-800.webp` / `-4x5-1200.webp` | 800x1000 / 1200x1500 | 80,218 / 138,476 |
| `fingerprint-800.webp` / `-1600.webp` | 800x533 / 1600x1067 | 19,098 / 49,658 |
| `fingerprint-4x5-800.webp` / `-4x5-1200.webp` | 800x1000 / 1200x1500 | 37,414 / 62,952 |

`qr-cybernetai.svg` / `.png` in this folder are not photographs (they belong to the lookalike-links tile) and are not covered by this file.
