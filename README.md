# n8n-nodes-pinbridge

PinBridge community node for n8n. It publishes Pinterest pins through the PinBridge API and checks publish status.

## Features

- Credentials: PinBridge API Key + Base URL
- Boards:
  - List Boards
  - Board dropdown via loadOptions
- Pins:
  - Publish Pin (item-by-item bulk from incoming n8n items)
  - Get Pin Status (job status)
- Connections:
  - List connected Pinterest accounts

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
- **Base URL**: your PinBridge API URL (default from API config is `http://localhost:8000`)
- **API Key**: your PinBridge API key

If you do not already have a key, create one from your PinBridge setup flow (dashboard/API, depending on your deployment).

## Operations

### Connections -> List
Calls `GET /v1/pinterest/accounts`.

### Boards -> List
Calls `GET /v1/pinterest/boards?account_id=...`.

### Pins -> Publish
Calls `POST /v1/pins` with:
- `account_id`
- `board_id`
- `title`
- `description` (optional)
- `link_url` (optional)
- `image_url`
- `idempotency_key`

Idempotency key defaults to `{{$execution.id}}-{{$itemIndex}}`.

### Pins -> Get Status
Calls `GET /v1/jobs/{job_id}`.

## Notes

- Current PinBridge publish endpoint accepts `image_url` only. Binary image upload is not supported by the API contract used here.
- Plan/billing errors may return structured details under `detail.error` (`code`, `message`, `upgrade_url`).

## Example workflows

### 1) Publish one pin from image URL + link
1. Set `resource=Pins`, `operation=Publish`.
2. Choose Connection and Board.
3. Fill `Title`, `Image URL`, optional `Link URL` and `Description`.
4. Execute node.

### 2) Publish multiple pins via SplitInBatches
1. Feed a list of pin payload items into `SplitInBatches`.
2. Map fields into PinBridge Publish parameters with expressions.
3. Keep default idempotency key or map your own unique key per item.
4. Each incoming item publishes one pin.

### 3) Poll status after publish
1. Use Publish output `id`.
2. Add another PinBridge node with `resource=Pins`, `operation=Get Status` and `Pin ID={{$json.id}}`.
3. Optional: place `Wait` + loop until status is `published` or `failed`.

## Development

```bash
npm install
npm run lint
npm run build
npm run dev
```
