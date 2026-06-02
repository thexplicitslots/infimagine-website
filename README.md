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
```

Create a Supabase table named `quote_requests` with columns matching the API payload fields in `lib/quote-store.js`:

`created_at`, `updated_at`, `customer_name`, `contact`, `project_type`, `quantity`, `size`, `dimensions`, `readiness`, `reference_link`, `description`, `ai_possibilities`, `material`, `color`, `finish`, `strength`, `timeline`, `budget`, `delivery`, `location`, `estimate`, `status`, `priority`, `notes`, `source`.
