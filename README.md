# Homegestion

A self-hosted web app to manage household bills, a monthly budget and recurring expenses,
usable on Mac and iPhone (installable PWA). Your data stays on your own server.
The interface is in French. Full documentation in French: [LISEZMOI.md](LISEZMOI.md).

## Features

- **Bills**: label, supplier, amount, category, due date, paid / unpaid status, notes, search and filters.
- **Receipts**: PDF or photos (JPEG, PNG, HEIC, WebP, up to 20 MB) attached to each bill; on iPhone,
  the camera, photo library or Files app.
- **Monthly budget**: a cap per category, actual vs. planned, overruns in red, 12-month history.
- **Recurring expenses**: monthly, bimonthly, quarterly, half-yearly or yearly. Due bills are created
  automatically up to the end of the next month; a deleted one is not recreated, and an amount change
  only affects future unpaid bills.
- **Home**: what is left to pay this month, overdue bills, bills due in the next 14 days.
- **JSON export** of all data.

## Architecture

| Part | Technology |
| --- | --- |
| Server | Node.js 22 and Fastify, SQLite (`node:sqlite`, a single file) |
| Interface | React and Vite, PWA (manifest and service worker) |
| Access | Single password, 90-day `httpOnly` session cookie, lockout after 5 attempts |
| Deployment | Docker Compose and Caddy (automatic HTTPS with Let's Encrypt), or a systemd install script |

## Quick start

Deploy on a Debian or Ubuntu VPS with a domain pointing to it (HTTPS is required to install the app on iPhone):

```sh
./scripts/package.sh                 # on your Mac: builds the archive
# copy it to the VPS, unpack it, then:
sudo ./deploy/install.sh             # asks for the domain and the app password
```

Or with Docker:

```sh
cp .env.example .env                 # set DOMAIN and APP_PASSWORD
docker compose up -d --build
```

## Development

```sh
npm install
APP_PASSWORD=dev npm run dev:server  # API on http://localhost:3000
npm run dev:web                      # interface on http://localhost:5173
npm test
npm run typecheck
```

## License

[MIT](LICENSE)
