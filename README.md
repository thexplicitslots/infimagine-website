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

## PrusaSlicer CLI estimates

The admin panel can request real STL slice estimates through `/api/slice-estimate`. This requires PrusaSlicer to be installed on the server/runtime that executes the API.

Environment variables:

```bash
PRUSASLICER_CLI_PATH=/path/to/prusa-slicer
PRUSASLICER_CONFIG_PATH=/path/to/exported-profile.ini
PRUSASLICER_MATERIAL_COST_PER_KG=1200
PRUSASLICER_TIMEOUT_MS=120000
```

Export your printer/filament/print profile from PrusaSlicer as an `.ini` and point `PRUSASLICER_CONFIG_PATH` to it. Without a CLI binary and profile, the admin will keep showing `Requires slicer output` instead of guessed values.
