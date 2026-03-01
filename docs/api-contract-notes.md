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

### 4) Publish pin
- Method/path: `POST /v1/pins`
- Auth: required
- Request body: `PinCreate`
  - `account_id` (uuid, required)
  - `board_id` (string, required)
  - `title` (string, required, max 500)
  - `description` (string, optional)
  - `link_url` (uri, optional)
  - `image_url` (uri, optional when `asset_id` supplied)
  - `asset_id` (uuid, optional when `image_url` supplied)
  - `idempotency_key` (string, required, max 255)
- Response: `PinResponse`
  - includes `id`, `status` (`queued|publishing|published|failed`), `pinterest_pin_id?`, `error_code?`, `error_message?`, timestamps, etc.
- Idempotency behavior from route code:
  - uniqueness key is `(workspace_id, idempotency_key)`.
  - duplicate keys return existing pin (201) without re-enqueueing.

### 5) Get pin status
- Method/path: `GET /v1/jobs/{job_id}` (alias to pin status)
- Auth: required
- Response: `JobStatusResponse`
  - `job_id`, `pin_id`, `status`, `submitted_at`, `completed_at?`, `pinterest_pin_id?`, `error_code?`, `error_message?`

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
