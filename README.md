# ShelfSense

Estimate **Full, Low or Empty** shelf coverage from photos and track restocking alerts. Built with Next.js and PostgreSQL.

## Start locally

Requires **Node 24 LTS** and **Docker** or a running **PostgreSQL 16** database.

```sh
npm ci
npm run dev
```

Open the URL printed by the launcher. It prepares the database and starts the app with no sample shelves. Ctrl+C stops the app and keeps your data.

Without `DATABASE_URL`, the launcher creates a local PostgreSQL Docker container. To use your own database, copy `.env.example` to `.env` and set `DATABASE_URL` before starting. Photos are saved in `media/` by default; set `MEDIA_DIR` to change it. Keep credentials and photos out of Git.

## Use it

1. **Add shelf** with a name and location.
2. **Set up shelf** using an empty photo and select the shelf area.
3. **Check shelf** using a current photo from the same position.
4. Check the coverage estimate and **Alerts**.
5. After restocking, select **I've restocked this shelf**, then upload a new photo to verify recovery.

Estimates describe visible coverage, not product counts. Failed checks keep the previous valid result. See **Help** in the app for the full guide.

## Development

```sh
npm run typecheck
npm run format:check
npm test
npm run build
```

Stop the development server before building. API tests need a separate database configured with `TEST_DATABASE_URL`; otherwise they skip. See [verification](docs/verification.md) for browser checks and test requirements.

More detail: [architecture](docs/architecture.md), [image analysis](docs/detector.md), and [deployment, backups and storage](docs/deployment.md). Run `npm run` to list all commands.
