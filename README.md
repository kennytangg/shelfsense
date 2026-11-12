# ShelfSense

A small prototype that estimates whether a shelf is **Full, Low or Empty** from a photo, and tracks restocking alerts. Built with Next.js 16, React 19 and PostgreSQL.

## What it does

1. Add a shelf and set it up with one photo of the empty shelf, then mark the shelf area.
2. Upload a current photo of the same shelf to check stock.
3. Read Full / Low / Empty. Shelves that need restocking raise an alert.
4. After restocking, press "Report restocked" and upload a new photo to confirm.

## How detection works

- The current photo is aligned and compared with the empty reference photo.
- Only the marked shelf area is looked at.
- The share of that area that differs from the empty shelf gives the coverage, which maps to Full / Low / Empty.
- There is no OCR and no AI model, just image comparison (Sharp + OpenCV/WASM).

## Run locally

Needs Node 24 and either Docker or your own PostgreSQL.

```sh
npm install
npm run dev
```

`npm run dev` migrates the database and starts the app on the printed URL. Without `DATABASE_URL` it starts a local Postgres in Docker. To use your own database, copy `.env.example` to `.env` and set `DATABASE_URL`. Photos are stored in `media/`.

## Test

```sh
npm run typecheck
npm run format:check
npm test
npm run build
```

API tests need a separate, empty Postgres in `TEST_DATABASE_URL` (they skip without it). `npm run test:browser` and `npm run test:e2e` run browser checks against a production build.

## Deployment

Hosted on Vercel with a Neon PostgreSQL database and a private Vercel Blob store. Environment variables (names only):

- `DATABASE_URL`
- `BLOB_READ_WRITE_TOKEN`
- `UPLOAD_SIGNING_SECRET`
- `OPERATOR_USERNAME`
- `OPERATOR_PASSWORD`

Run `npm run migrate` against the target database at release time; migrations do not run per request.
