# n8n-nodes-pinbridge

PinBridge community node for n8n. It publishes, schedules, and manages Pinterest workflows through the PinBridge API.

This repo targets PinBridge v1.0.0.

## Features

- Credentials: PinBridge API Key + Base URL
- Boards:
  - Create Board
  - Delete Board
  - List Boards
  - Board dropdown via loadOptions
- Pins:
  - Delete Pin
  - Get Pin
  - List Pins
  - Publish Pin (item-by-item bulk from incoming n8n items)
  - Get Pin Status (job status)
- Assets:
  - Upload Image
  - Upload Video
  - Get Asset
- Schedules:
  - Create Schedule
  - Get Schedule
  - List Schedules
  - Cancel Schedule
- Connections:
  - Start OAuth
  - Complete OAuth Callback
  - List connected Pinterest accounts
  - Revoke connected Pinterest account
- Rate Meter:
  - Get rate limit status for a connected account
- Webhooks:
  - Create Webhook
  - Delete Webhook
  - Get Webhook
  - List Webhooks
  - Update Webhook

## API contract source

This node is implemented from the PinBridge API source in `../api` and `../api/docs/openapi.json`.
Contract notes used for implementation: `docs/api-contract-notes.md`.

## Authentication

PinBridge accepts:

- `X-API-Key: <key>`
- `Authorization: Bearer <jwt-or-api-key>`

This node uses `X-API-Key`.

## Installation (self-hosted n8n)

1. In your n8n custom nodes environment, install the package:

```bash
npm install n8n-nodes-pinbridge
```

2. Restart n8n.

3. In n8n, create credentials:
- **Credential type**: `PinBridge API Key`
- **Base URL**: `https://api.pinbridge.io` (or your self-hosted API URL)
- **API Key**: your PinBridge API key

If you do not already have a key, create one from your PinBridge setup flow (dashboard/API, depending on your deployment).

## Operations

### Connections -> List
Calls `GET /v1/pinterest/accounts`.

### Connections -> Start OAuth
Calls `GET /v1/pinterest/oauth/start`.

### Connections -> Complete OAuth Callback
Calls `GET /v1/pinterest/oauth/callback?code=...&state=...`.

### Connections -> Revoke
Calls `DELETE /v1/pinterest/accounts/{account_id}`.

### Boards -> List
Calls `GET /v1/pinterest/boards?account_id=...`.

### Boards -> Create
Calls `POST /v1/pinterest/boards`.

### Boards -> Delete
Calls `DELETE /v1/pinterest/boards/{board_id}?account_id=...`.

### Assets -> Upload Image
Calls `POST /v1/assets/images` with `multipart/form-data` from an incoming n8n binary property.

### Assets -> Upload Video
Calls `POST /v1/assets/videos` with `multipart/form-data` from an incoming n8n binary property.

### Assets -> Get
Calls `GET /v1/assets/{asset_id}`.

### Pins -> Publish
Calls `POST /v1/pins` with:
- `account_id`
- `board_id`
- `title`
- `description` (optional)
- `link_url` (optional)
- `image_url` or `asset_id`
- `idempotency_key`

Idempotency key defaults to `{{$execution.id}}-{{$itemIndex}}`.

### Pins -> Get
Calls `GET /v1/pins/{pin_id}`.

### Pins -> List
Calls `GET /v1/pins`.

### Pins -> Get Status
Calls `GET /v1/jobs/{job_id}`.

### Pins -> Delete
Calls `DELETE /v1/pins/{pin_id}`.

### Schedules -> Create
Calls `POST /v1/schedules` with `image_url` or `asset_id`.

### Schedules -> Get
Calls `GET /v1/schedules/{schedule_id}`.

### Schedules -> List
Calls `GET /v1/schedules`.

### Schedules -> Cancel
Calls `POST /v1/schedules/{schedule_id}/cancel`.

### Rate Meter -> Get
Calls `GET /v1/rate-meter?account_id=...`.

### Webhooks -> Create
Calls `POST /v1/webhooks`.

### Webhooks -> List
Calls `GET /v1/webhooks`.

### Webhooks -> Get
Calls `GET /v1/webhooks/{webhook_id}`.

### Webhooks -> Update
Calls `PATCH /v1/webhooks/{webhook_id}`.

### Webhooks -> Delete
Calls `DELETE /v1/webhooks/{webhook_id}`.

## Notes

- Upload Image is the recommended path when your source image is already present in the n8n workflow as binary data.
- Upload Video is the recommended path for video pins because PinBridge publishes videos from uploaded assets.
- Plan/billing errors may return structured details under `detail.error` (`code`, `message`, `upgrade_url`).
- This node intentionally focuses on publishing workflows and does not include admin, password-reset, or billing-management endpoints.

## Example workflows

### 1) Upload a binary image and publish by asset ID
1. Set `resource=Assets`, `operation=Upload Image`.
2. Point `Binary Property` to the incoming image data.
3. Feed the returned `id` into a second PinBridge node with `resource=Pins`, `operation=Publish`, and `Media Source=Uploaded Asset`.

### 2) Upload a binary video and publish by asset ID
1. Set `resource=Assets`, `operation=Upload Video`.
2. Point `Binary Property` to the incoming video data.
3. Feed the returned `id` into a second PinBridge node with `resource=Pins`, `operation=Publish`, and `Media Source=Uploaded Asset`.

### 3) Publish one pin from image URL + link
1. Set `resource=Pins`, `operation=Publish`.
2. Choose Connection and Board.
3. Set `Media Source=Public Image URL`.
4. Fill `Title`, `Image URL`, optional `Link URL` and `Description`.
4. Execute node.

### 4) Publish multiple pins via SplitInBatches
1. Feed a list of pin payload items into `SplitInBatches`.
2. Map fields into PinBridge Publish parameters with expressions.
3. Keep default idempotency key or map your own unique key per item.
4. Each incoming item publishes one pin.

### 5) Poll status after publish
1. Use Publish output `id`.
2. Add another PinBridge node with `resource=Pins`, `operation=Get Status` and `Pin ID={{$json.id}}`.
3. Optional: place `Wait` + loop until status is `published` or `failed`.

### 6) Schedule a future publish
1. Set `resource=Schedules`, `operation=Create`.
2. Choose Connection and Board.
3. Choose `Media Source=Uploaded Asset` or `Public Image URL`.
4. Fill `Run At`, `Title`, and the relevant media field plus optional metadata.
4. Use the returned schedule ID for later status or cancellation steps.

### 7) Check rate limit headroom before publishing
1. Set `resource=Rate Meter`, `operation=Get`.
2. Choose the Connection.
3. Branch in n8n based on `accountTokensAvailable` or `globalTokensAvailable`.

## Development

```bash
npm install
npm run lint
npm run build
npm run dev
```
