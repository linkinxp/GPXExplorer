# GPX Explorer

A web app for analysing cycling rides. Drop in a GPX or Garmin FIT file (or import one from Garmin Connect or Wahoo) and get the route on a map, an elevation and gradient profile, climbs, effort and power analysis, speed insights, and the weather during the ride. Rides can be saved in the browser and shared by link.

Live at **https://gpx.linkinxp.com**

## Features

- **Import** GPX and Garmin `.fit` files (drag and drop or file picker). Indoor FIT files without GPS are rejected with a clear message.
- **Garmin Connect import** with login, MFA, and per-activity GPX download. The server fetches the original FIT file so power data is kept (Garmin's GPX export has no power).
- **Wahoo import** via OAuth, listing workouts and downloading their GPX.
- **Route map** (Leaflet) and a street map view.
- **Elevation and gradient profile**, with a gradient ribbon and climb detection (`ClimbsPanel`, `ClimbCurtain`).
- **Stats grid**: distance, moving time, elevation gain and max elevation, speed, heart rate, cadence (zero samples excluded from averages), temperature.
- **Power**: average and max power, a smoothed power chart, and effort zones (`EffortChart`, `EffortZones`).
- **Cadence chart** and speed distribution (`SpeedInsights`).
- **Weather** for the ride's time and place from Open-Meteo, plus a wind rose and ride conditions panel.
- **Daylight bar** showing sunrise, sunset and the ride window.
- **Zwift and Strava GPX files** are supported; all relevant fields in the file (time, elevation, HR, cadence, power, temperature) are displayed when present.
- **Saved routes and share links**: rides are stored locally in the browser. Share links are created on the server (`/api/share`), kept for 14 days, and can be reopened by anyone with the link.
- **Installable PWA** with a service worker (`public/sw.js`) and manifest.
- **Export** of the processed data (`src/lib/export.ts`) and a shareable ride card (`src/lib/ridecard.ts`).

## Architecture

```
Browser (React + Vite SPA)
   │  static files            /api/*
   ▼                           ▼
nginx (gpx.conf) ──────► gunicorn → Flask (server/app.py, 127.0.0.1:5006)
                                      ├─ Garmin Connect (garminconnect)
                                      ├─ Wahoo API (api.wahooligan.com)
                                      ├─ share store (gzipped GPX files on disk)
                                      └─ per-browser sessions (cookie `gpxsid`)
```

- **Frontend** (`src/`): React 19 with TypeScript, Vite, Tailwind CSS, and Leaflet. Parsing and analysis run entirely in the browser (`src/lib/gpx.ts`, `fit.ts`, `analysis.ts`).
- **Backend** (`server/app.py`): a small Flask app that handles only what must stay on the server: Garmin login and activity fetching, Wahoo OAuth, and share storage. It converts Garmin FIT originals into GPX, keeping heart rate, cadence, temperature, power, and the activity name.
- **Proxy**: nginx serves the built frontend from `/var/www/gpx` and forwards `/api/` to the Flask app. The example config is in `deploy/nginx-gpx.conf`.

### Frontend source map

| Path | Purpose |
| --- | --- |
| `src/App.tsx` | Top-level layout, file handling, Garmin/Wahoo import flows |
| `src/lib/gpx.ts` | GPX parsing, including `hr`, `cad`, `atemp`, and `power` extensions |
| `src/lib/fit.ts` | Minimal Garmin FIT decoder that emits GPX text |
| `src/lib/analysis.ts` | Distance, speed, climbs, gradients, power and cadence stats |
| `src/lib/weather.ts` | Open-Meteo archive and forecast requests |
| `src/lib/share.ts` | Client side of share links |
| `src/components/` | UI panels (map, profiles, stats, climbs, weather, imports) |
| `src/components/magic/` | Decorative UI primitives (border beam, shimmer button, number ticker, etc.) |

### API

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/garmin/login` | Log in to Garmin Connect (may return an MFA challenge) |
| POST | `/api/garmin/mfa` | Submit the MFA code |
| GET | `/api/garmin/status` | Whether a Garmin session is active |
| GET | `/api/garmin/activities` | Recent activities |
| GET | `/api/garmin/activities/<id>/gpx` | Activity as GPX (from the FIT original, with power) |
| POST | `/api/garmin/logout` | End the Garmin session |
| POST | `/api/share` | Store a ride (gzipped GPX) and return an 8-character share ID |
| GET | `/api/share/<id>` | Load a shared ride |
| GET | `/api/wahoo/status` | Whether a Wahoo session is active |
| GET | `/api/wahoo/login` | Start Wahoo OAuth |
| GET | `/api/wahoo/callback` | OAuth redirect target |
| GET | `/api/wahoo/workouts` | Recent Wahoo workouts |
| GET | `/api/wahoo/workouts/<id>/gpx` | Workout as GPX |
| POST | `/api/wahoo/logout` | End the Wahoo session |

## Requirements

- Node.js (current LTS) and npm (frontend)
- Python 3.11+ with `flask`, `garminconnect`, `requests`, and `gunicorn` (backend)
- nginx (production) or any static host plus a reverse proxy for `/api/`

## Local development

Frontend only (the Garmin and Wahoo features need the backend):

```bash
npm install
npm run dev          # Vite dev server on http://localhost:5173
```

Production build:

```bash
npm run build        # runs tsc -b, then vite build into dist/
npm run preview      # serve dist/ locally
```

Backend:

```bash
python3 -m venv venv && . venv/bin/activate
pip install flask garminconnect requests gunicorn
export WAHOO_CLIENT_ID=... WAHOO_CLIENT_SECRET=...
gunicorn -w 1 --threads 4 -b 127.0.0.1:5006 app:app   # run from server/
```

The Vite dev server does not proxy `/api/`. To use Garmin or Wahoo in development, either run the production build behind nginx or add a `server.proxy` entry for `/api` in `vite.config.ts`.

## Configuration

| Variable | Required for | Default |
| --- | --- | --- |
| `WAHOO_CLIENT_ID` | Wahoo import | none |
| `WAHOO_CLIENT_SECRET` | Wahoo import | none |
| `WAHOO_REDIRECT_URI` | Wahoo import | `https://gpx.linkinxp.com/api/wahoo/callback` |

Secrets are read from the environment only. Do not commit them. Garmin and Wahoo sessions are tied to a browser cookie (`gpxsid`) and kept in a server-side session directory; Garmin's MFA step holds pending logins in memory.

## Deployment

1. Build the frontend (`npm run build`) and copy `dist/` to `/var/www/gpx`.
2. Copy `server/app.py` to the server (for example `/opt/gpx-api/app.py`) and run it under gunicorn as a systemd service on `127.0.0.1:5006`, with the Wahoo variables set in the unit's environment.
3. Install `deploy/nginx-gpx.conf` as the site config. It serves static files and proxies `/api/` to port 5006. Long-running requests such as Garmin downloads may need higher proxy timeouts.
4. Point DNS for the host at the server (the production site sits behind Cloudflare).

## Notes and limitations

- Weather uses Open-Meteo; coverage and accuracy depend on their archive for the ride's location and date.
- FIT support is a minimal decoder covering the record messages used for rides (position, altitude, heart rate, cadence, temperature, power). Other FIT message types are ignored.
- Garmin's GPX export omits power, so Garmin imports go through the FIT original on the server.
- Saved rides live in browser storage and are not synced between devices; use share links to move a ride elsewhere.
- Share files and session data live on the server's disk (`/var/lib/gpx-api`) and are not part of this repository.
- Because MFA state is held in memory, the API must run as a single gunicorn worker (`-w 1`).

## Repository layout

```
server/app.py        Flask API (Garmin, Wahoo, shares)
deploy/              nginx site config
public/              PWA manifest, service worker, icons
src/                 React application
index.html           Vite entry page
vite.config.ts       Vite + Tailwind configuration
```

## License

No license has been chosen yet. All rights reserved by the author until one is added.
