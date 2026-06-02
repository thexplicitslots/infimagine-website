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

The quote flow posts structured requests to `/api/quote-requests` before opening WhatsApp. To persist those requests and show them in admin, add these Vercel environment variables:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_TABLE=quote_requests
SUPABASE_STORAGE_BUCKET=quote-attachments
```

Create a Supabase table named `quote_requests` with columns matching the API payload fields in `lib/quote-store.js`:

`created_at`, `updated_at`, `customer_name`, `contact`, `project_type`, `quantity`, `size`, `dimensions`, `readiness`, `reference_link`, `attachments`, `description`, `ai_possibilities`, `material`, `color`, `finish`, `strength`, `timeline`, `budget`, `delivery`, `location`, `estimate`, `status`, `priority`, `follow_up_date`, `notes`, `source`.

Use a `jsonb` column for `attachments`. Create a Supabase Storage bucket named `quote-attachments` for uploaded sketches, reference images, screenshots, and small STL/OBJ/STEP files. If the bucket is private, keep the stored `path` and open files from Supabase; if it is public, the admin panel can open the generated file URLs directly.

You can also run the full setup script in Supabase SQL Editor:

```sql
-- see supabase-schema.sql
```

## External slicer worker estimates

The admin panel can request real STL slice estimates through `/api/slice-estimate`. Vercel does not run PrusaSlicer directly. Instead, the API creates a short-lived signed Supabase Storage URL for the selected STL and sends it to an external slicer worker.

Environment variables:

```bash
SLICER_WORKER_URL=
SLICER_WORKER_SECRET=
```

The worker receives `quoteRequestId`, `attachmentPath`, `signedUrl`, `filename`, `material`, and profile context. It should return parsed slicing fields such as `estimated_print_time_minutes`, `estimated_filament_grams`, `estimated_filament_cost`, and `slicer_profile`. Without a configured worker, the admin shows `Slicer worker not configured` instead of guessed values.
