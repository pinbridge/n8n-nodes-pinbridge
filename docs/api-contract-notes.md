# PinBridge API Contract Notes

Source of truth examined:
- `../api/docs/openapi.json`
- `../api/app/api/routes/pins.py`
- `../api/app/api/routes/pinterest.py`
- `../api/app/api/routes/jobs.py`
- `../api/app/api/routes/assets.py`
- `../api/app/core/dependencies.py`
- `../api/app/core/openapi.py`
- `../api/app/core/config.py`
- `../api/app/main.py`
- `../api/app/schemas/asset.py`
- `../api/app/schemas/pin.py`
- `../api/app/schemas/pinterest.py`

## Base URL / environment
- OpenAPI spec does **not** define `servers`.
- Runtime config default from `settings.pinbridge_base_url` is `http://localhost:8000`.
- Repo docs also reference deployed `https://api.pinbridge.io` in production docs/examples.
- Node strategy: expose credential `Base URL` (required in credential form with default `http://localhost:8000`).

## Authentication
- Supported auth schemes (from OpenAPI security schemes):
  - `X-API-Key: <api_key>`
  - `Authorization: Bearer <jwt-or-api-key>`
- Extraction logic (`get_api_key_header`) checks `X-API-Key` first, then bearer token.
- Node strategy: use `X-API-Key` header.

## Endpoints used by n8n node

### 1) List connections/accounts
- Method/path: `GET /v1/pinterest/accounts`
- Auth: required (`X-API-Key` or bearer)
- Response: `PinterestAccountResponse[]`
  - fields: `id`, `workspace_id`, `pinterest_user_id`, `display_name?`, `username?`, `scopes`, `created_at`, `updated_at`, `revoked_at?`

### 2) List boards
- Method/path: `GET /v1/pinterest/boards`
- Query: `account_id` (uuid, required)
- Auth: required
- Response: `BoardResponse[]`
  - fields: `id`, `name`, `description?`, `privacy?`

### 3) Upload image asset
- Method/path: `POST /v1/assets/images`
- Auth: required
- Request body: `multipart/form-data`
  - `file` (binary image, required)
- Response: `AssetResponse`
  - fields: `id`, `workspace_id`, `asset_type`, `original_filename`, `stored_filename`, `content_type`, `file_size_bytes`, `public_url`, timestamps

### 4) Upload video asset
- Method/path: `POST /v1/assets/videos`
- Auth: required
- Request body: `multipart/form-data`
  - `file` (binary video, required)
- Response: `AssetResponse`
  - fields: `id`, `workspace_id`, `asset_type`, `original_filename`, `stored_filename`, `content_type`, `file_size_bytes`, `public_url`, timestamps

### 5) Publish pin
- Method/path: `POST /v1/pins`
- Auth: required
- Request body: `PinCreate`
  - `account_id` (uuid, required)
  - `board_id` (string, required)
  - `title` (string, required, max 500)
  - `description` (string, optional)
  - `link_url` (uri, optional)
  - `image_url` (uri, optional when `asset_id` supplied)
  - `asset_id` (uuid, optional when `image_url` supplied; may reference an image or video asset)
  - `idempotency_key` (string, required, max 255)
- Response: `PinResponse`
  - includes `id`, `status` (`queued|publishing|published|failed`), `media_type`, `media_url`, `pinterest_pin_id?`, `error_code?`, `error_message?`, timestamps, etc.
- Idempotency behavior from route code:
  - uniqueness key is `(workspace_id, idempotency_key)`.
  - duplicate keys return existing pin (201) without re-enqueueing.

### 6) Get pin status
- Method/path: `GET /v1/jobs/{job_id}` (alias to pin status)
- Auth: required
- Response: `JobStatusResponse`
  - `job_id`, `pin_id`, `status`, `submitted_at`, `completed_at?`, `pinterest_pin_id?`, `error_code?`, `error_message?`

### 7) Import pins from JSON
- Method/path: `POST /v1/pins/imports/json`
- Auth: required
- Request body: JSON array of pin-like objects
  - each row follows the same shape as `PinCreate`
  - required per row: `account_id`, `board_id`, `title`, `idempotency_key`
  - row must include either `image_url` or `asset_id`
  - row may include `run_at` (absolute ISO 8601 timestamp with timezone offset)
    - missing `run_at`: queue immediately
    - provided `run_at`: create a schedule for that row
- Response: `ImportJobResponse`
  - `id`, `source_type`, `status`, row counters, timestamps, and per-row `results[]`
  - row results can include `schedule_id` when the row is scheduled
- Node strategy:
  - aggregate all incoming n8n items into one request body
  - pre-validate `run_at` values (when present) to ensure timezone offset is included
  - return a single n8n item representing the created import job

### 8) Import pins from CSV
- Method/path: `POST /v1/pins/imports/csv`
- Auth: required
- Request body: `multipart/form-data`
  - `file` (CSV, required)
- Response: `ImportJobResponse`
- Node strategy:
  - process each incoming item independently
  - upload the configured binary property as the CSV file
  - return one n8n item per uploaded CSV/import job

### 9) Get import job
- Method/path: `GET /v1/pins/imports/{job_id}`
- Auth: required
- Response: `ImportJobResponse`

### 10) List import jobs
- Method/path: `GET /v1/pins/imports`
- Auth: required
- Query:
  - `limit` (integer, optional)
  - `offset` (integer, optional)
  - `status` (enum, optional)
  - `source_type` (enum, optional)
- Response: `ImportJobResponse[]`

## Error response format
Observed patterns:
- Standard FastAPI/HTTPException string detail:
  - `{ "detail": "Pin not found" }`
  - `{ "detail": "Invalid API key" }`
- Structured business errors (billing/plan limits):
  - `{ "detail": { "error": { "code": "plan_limit", "message": "...", ... } } }`
- Validation errors:
  - `{ "detail": [ { "loc": [...], "msg": "...", "type": "..." } ] }`
- Global unhandled exception handler:
  - status 500 with `{ "detail": "Internal server error", "request_id": "..." }`

Node error mapping strategy:
- Prefer `detail.error.message` and `detail.error.code` when present.
- Fallback to string `detail`.
- Fallback to generic message + status code.
- Never include credentials/api key in error output.
- For scheduling payloads (`run_at`), validate timezone offset client-side before sending.
