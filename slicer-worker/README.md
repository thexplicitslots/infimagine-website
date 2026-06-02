# InfiMagine Slicer Worker

External worker for `/api/slice-estimate`. Vercel sends a signed STL URL here, and this service runs PrusaSlicer CLI.

## Environment Variables

```bash
SLICER_WORKER_SECRET=
MATERIAL_COST_PER_KG=1200
SLICER_PROFILE_NAME=PLA default
PRUSASLICER_CLI=prusa-slicer
PRUSASLICER_CONFIG_PATH=
```

`PRUSASLICER_CONFIG_PATH` is optional, but recommended. Export a PrusaSlicer `.ini` profile and copy it into `profiles/default.ini`, then set:

```bash
PRUSASLICER_CONFIG_PATH=/app/profiles/default.ini
```

## Deploy

Deploy this folder as a Docker web service on Render. Use `/slice` as the worker endpoint.

Then add to Vercel:

```bash
SLICER_WORKER_URL=https://your-render-service.onrender.com/slice
SLICER_WORKER_SECRET=same-secret-as-worker
```
