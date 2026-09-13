# ARC-APP-C

Frontend-only archaeological field-recording PWA. Accounts, records, GPS paths, settings, and compressed photos are stored on the current device with IndexedDB. No backend or cloud database is required.

## Run locally

```powershell
npm install
npm run dev
```

Open `http://localhost:5173/`.

Validate the app:

```powershell
npm run lint
npm run build
```

## Features

- Mobile number and password account stored locally.
- Custom security question password recovery.
- 25-day local login session.
- IndexedDB storage through Dexie.
- Offline burial/site records and GPS paths.
- Precise GPS capture with accuracy display.
- GPS pathway tracking with timestamps, elevation, two-meter drift filtering, and distance calculation.
- Leaflet/OpenStreetMap map with markers, popups, coordinate picking, and pathway display.
- Client-side WebP photo compression.
- CSV and KML export.
- Installable PWA with service-worker caching.

## Deployment

This is a static Vite application. Deploy the repository to Vercel, Netlify, GitHub Pages, or another static host.

Build settings:

```text
Build command: npm run build
Output directory: dist
Install command: npm install
```

For GitHub Pages, configure the Pages source to use GitHub Actions or publish the `dist` directory from a build workflow. The application uses client-side state and does not need server environment variables.

After renaming the GitHub repository to `ARC-APP-C`, the Pages URL is:

`https://anhad75.github.io/ARC-APP-C/`

## Important limitation

Data is local to each browser/device. Accounts do not work across devices, data is not backed up to the cloud, and clearing browser storage removes the local data. Use the CSV/KML exports for backups. A backend, authentication service, and cloud photo storage would be required for multi-device or team deployment.
