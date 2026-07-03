# InfiMagine

A Vercel-ready static website for a custom 3D printing service built around the promise: imagination made possible.

## Deploy on Vercel

Import this folder as a Vercel project. No build command is required.

Local preview:

```bash
python3 -m http.server 3000
```

Then open `http://localhost:3000`.

## Server-side quote capture

The quote flow posts structured requests to `/api/quote-requests` before opening WhatsApp. The primary backend is Neon Postgres, with Supabase kept only as a legacy fallback.

```bash
DATABASE_URL=...
POSTGRES_URL=...
NEON_TABLE=quote_requests
```

The API automatically creates the `quote_requests` Neon table and indexes on first use.

## Email confirmations

The quote form requires a customer email address. After `/api/quote-requests` saves the lead, it attempts to send an automatic customer confirmation and an internal quote notification through Resend. If Resend is not configured, the lead still saves normally.

Verify `infimagine.com` in Resend, then add these Vercel environment variables:

```bash
RESEND_API_KEY=...
EMAIL_FROM="InfiMagine <admin@infimagine.com>"
EMAIL_REPLY_TO=admin@infimagine.com
QUOTE_NOTIFICATION_TO=admin@infimagine.com,Chinmayarya05@gmail.com,Ananyamittal6616@gmail.com
```

Keep Zoho Mail for receiving inbox mail. Resend is only used for transactional website confirmations and owner quote notifications. Redeploy after adding or changing the variables.

## File uploads

Quote attachments upload to Vercel Blob through browser-side client uploads, so large STL files do not pass through a Vercel Function body.

Environment variables:

```bash
BLOB_READ_WRITE_TOKEN=...
BLOB_ACCESS=public
```

Use `public` Blob access for the current admin viewer and slicer worker flow. Private Blob storage needs signed download routes before inline preview/slicing.

## External slicer worker estimates

The admin panel can request real STL slice estimates through `/api/slice-estimate`. Vercel does not run PrusaSlicer directly. Instead, the API sends the selected uploaded file URL to an external slicer worker.

Environment variables:

```bash
SLICER_WORKER_URL=
SLICER_WORKER_SECRET=
```

The worker receives `quoteRequestId`, `attachmentPath`, `signedUrl`, `filename`, `material`, and profile context. It should return parsed slicing fields such as `estimated_print_time_minutes`, `estimated_filament_grams`, `estimated_filament_cost`, and `slicer_profile`. Without a configured worker, the admin shows `Slicer worker not configured` instead of guessed values.
