# n8n-nodes-pinbridge

PinBridge community node for n8n. It publishes, schedules, and manages Pinterest workflows through the PinBridge API, and reports how that publishing went.

This release targets the PinBridge API v1 as of PinBridge 1.41.

## Features

- **Pins**: publish one pin per item or many in one batch request, dry-run a pin before publishing, edit a pin before it publishes, retry a failed pin (optionally on another board or account), delete it (optionally on Pinterest too), list with filters, bulk import from JSON items or a CSV file, and follow import jobs.
- **Schedules**: create, dry-run, edit in place, cancel, retry, delete, and list with filters.
- **Boards**: list, create, update (name, description, privacy), delete, and check whether a connection can publish to a board.
- **Assets**: upload images and videos from binary data, get, list with filters, and delete.
- **Analytics**: account and pin analytics, a cross-account overview, top pins by metric, a publishing summary (success rate, queue, upcoming schedules), and an on-demand refresh.
- **Activity Log**: the workspace activity feed with filters.
- **Connections**: list connected Pinterest accounts with their health, start and complete the Pinterest authorization flow, and revoke an account.
- **Terms**: Pinterest related-terms lookups.
- **Rate Meter**: token-bucket headroom for a connection.
- **Webhooks**: create, get, list, update, and delete.
- Clear errors: PinBridge's error code, message and remediation hint are shown in n8n, and added to the output item when **On Error → Continue** is set.
- Usable as a tool by the n8n AI Agent.

## Authentication

Create an API key in the PinBridge dashboard (API keys page) and add a **PinBridge API** credential in n8n:

- **Base URL**: `https://api.pinbridge.io` (or your self-hosted API URL)
- **API Key**: your PinBridge API key, sent in the `X-API-Key` header

API keys carry scopes. Keys without explicit scopes have all of them.

| Scope | Operations |
| --- | --- |
| `read` | List/Get operations, Check Access, Validate, analytics, activity log, rate meter, related terms |
| `write` | Publish, Publish Batch, imports, Create/Update/Retry/Cancel, uploads, Start OAuth, Collect Account Analytics |
| `destructive` | Every Delete operation and Revoke |

A key limited to some Pinterest accounts gets `403 account_not_permitted` for the others. The credential test calls `GET /v1/pinterest/accounts`, so it needs the `read` scope.

## Installation

In n8n, open **Settings → Community Nodes**, choose **Install**, and enter `n8n-nodes-pinbridge`.

For a manual install in a self-hosted n8n custom nodes directory:

```bash
npm install n8n-nodes-pinbridge
```

Then restart n8n.

## Operations

List operations run once, with the parameters of the first input item. Every other operation runs once per input item.

### Pin

| Operation | Endpoint | Notes |
| --- | --- | --- |
| Publish | `POST /v1/pins` | One pin per input item |
| Publish Batch | `POST /v1/pins/batch` | All input items, up to 100 per request. Each output item has `batchStatus` (`created`, `existing` or `failed`) and pairs with its input item. Needs the bulk publishing plan feature |
| Validate | `POST /v1/pins/validate` | Dry run of Publish: runs every check and creates nothing. `valid` and `failedChecks` tell what would fail |
| Update | `PATCH /v1/pins/{id}` | Queued, deferred and failed pins only. Published pins cannot be edited: delete and publish again. An added-but-empty text field clears it |
| Retry | `POST /v1/pins/{id}/retry` | Optional Board ID / Connection override |
| Delete | `DELETE /v1/pins/{id}` | **Delete on Pinterest Too** also removes the published pin on Pinterest |
| Get | `GET /v1/pins/{id}` | |
| Get Status | `GET /v1/jobs/{id}` | |
| List | `GET /v1/pins` | Filters: connection, board, status, error code, removed from Pinterest, search, created after/before, sort |
| Import JSON | `POST /v1/pins/imports/json` | All input items become one asynchronous import job. `run_at` needs an explicit offset |
| Import CSV | `POST /v1/pins/imports/csv` | CSV file from a binary property |
| Get Import | `GET /v1/pins/imports/{id}` | |
| List Imports | `GET /v1/pins/imports` | Filters: status, source |

Publish, Publish Batch and Validate send `account_id`, `board_id`, `title` (max 100), `description` (max 800), `link_url`, `alt_text` (max 500), `related_terms` (comma-separated in n8n), `dominant_color`, `image_url` or `asset_id`, the optional video cover (`cover_image_url` or `cover_image_asset_id`) and `idempotency_key`, which defaults to `{{$execution.id}}-{{$itemIndex}}`.

Pins deleted on Pinterest after publishing keep status `published` and get `removedFromPinterestAt`.

### Schedule

| Operation | Endpoint | Notes |
| --- | --- | --- |
| Create | `POST /v1/schedules` | |
| Validate | `POST /v1/schedules/validate` | Dry run of Create |
| Update | `PATCH /v1/schedules/{id}` | Run time, board, text, media or video cover of a schedule that has not run yet |
| Cancel | `POST /v1/schedules/{id}/cancel` | |
| Retry | `POST /v1/schedules/{id}/retry` | Failed schedules |
| Delete | `DELETE /v1/schedules/{id}` | |
| Get | `GET /v1/schedules/{id}` | |
| List | `GET /v1/schedules` | Filters: connection, board, status, search, run after/before, sort |

**Run At** accepts any ISO 8601 time. A time without an offset (what n8n's date picker produces) is read in the workflow's time zone.

### Board

| Operation | Endpoint | Notes |
| --- | --- | --- |
| List | `GET /v1/pinterest/boards` | |
| Create | `POST /v1/pinterest/boards` | |
| Update | `PATCH /v1/pinterest/boards/{id}` | Secret privacy needs the `boards:write_secret` scope; reconnect older connections first |
| Delete | `DELETE /v1/pinterest/boards/{id}` | Deletes the board on Pinterest, with every pin on it |
| Check Access | `GET /v1/pinterest/boards/{id}/access` | `publishable`, plus `code` and `remediation` when it is not |

### Asset

| Operation | Endpoint | Notes |
| --- | --- | --- |
| Upload Image | `POST /v1/assets/images` | PNG, JPEG, GIF or WebP from a binary property |
| Upload Video | `POST /v1/assets/videos` | From a binary property |
| Get | `GET /v1/assets/{id}` | |
| List | `GET /v1/assets` | Filters: type, in use, file name search, uploaded after/before, sort |
| Delete | `DELETE /v1/assets/{id}` | An asset still used by pins or pending schedules is kept (`requiresConfirmation: true`) unless **Delete Even If In Use** is on |

### Analytics

| Operation | Endpoint | Notes |
| --- | --- | --- |
| Get Account Analytics | `GET /v1/pinterest/accounts/{id}/analytics` | Totals and daily rows. Options: metrics, source (auto, live, stored), include daily rows |
| Get Pin Analytics | `GET /v1/pins/{id}/analytics` | Same options |
| Get Overview | `GET /v1/analytics/overview` | Summed across accounts, with the previous period and each account's collection status |
| List Top Pins | `GET /v1/analytics/pins` | Published pins ranked by impressions, saves, clicks, outbound clicks, comments or reactions |
| Get Publishing Summary | `GET /v1/dashboard/summary` | Published/failed counts, success rate, previous period, series, queue and upcoming schedules. Time zone defaults to the workflow's |
| Collect Account Analytics | `POST /v1/analytics/accounts/{id}/collect` | Refresh an account now (once per account every 15 minutes) |

Date ranges default to the last 30 days.

### Activity Log

**List** calls `GET /v1/activity-logs` and follows its cursor. Filters: action (for example `pin.published`), category, status, resource type, since.

### Connection

| Operation | Endpoint |
| --- | --- |
| List | `GET /v1/pinterest/accounts` (with `healthStatus`, `reconnectRequired`, `missingScopes`) |
| Start OAuth | `GET /v1/pinterest/oauth/start` |
| Complete OAuth Callback | `GET /v1/pinterest/oauth/callback?code=...&state=...` |
| Revoke | `DELETE /v1/pinterest/accounts/{id}` |

### Term, Rate Meter and Webhook

- **Term → List Related**: `GET /v1/pinterest/terms/related`. **Terms** takes a comma-separated list; **Exact Match** keeps only groups whose term matches a requested one.
- **Rate Meter → Get**: `GET /v1/rate-meter?account_id=...`.
- **Webhook**: Create, Get, List, Update and Delete on `/v1/webhooks`. PinBridge sends `pin.published` and `pin.failed`.

## Errors

PinBridge answers errors with a stable code, a message and a remediation hint. The node shows the message, with the hint, code, HTTP status and request ID in the details. With **On Error → Continue (using error output)** or **Continue**, the error item looks like this:

```json
{
  "error": "This pin is already published on Pinterest and cannot be edited.",
  "itemIndex": 0,
  "errorCode": "pin_already_published",
  "remediation": "Delete the pin and publish a corrected one, or edit it on Pinterest directly.",
  "statusCode": 409,
  "requestId": "8c2c..."
}
```

Branch on `errorCode` rather than on the message. Quote `requestId` when you contact support.

## Example workflows

### Upload a binary image and publish it
1. **Asset → Upload Image**, with **Binary Property** pointing to the incoming image.
2. **Pin → Publish** with **Media Source = Uploaded Asset**. **Asset ID** defaults to `{{$json["id"]}}`, the uploaded asset.

Videos work the same way with **Upload Video**.

### Check a pin before publishing it
1. **Pin → Validate** with the same fields as Publish.
2. An **If** node on `{{$json.valid}}`: publish when true, otherwise send `failedChecks` to Slack or email.

### Publish a spreadsheet in one request
1. Read the rows (Google Sheets, Airtable, ...).
2. **Pin → Publish Batch**, mapping title, link and image URL with expressions.
3. Filter the output on `batchStatus = failed` to see what did not go through, with `errorCode` and `remediation`.

### Fix and retry failed pins
1. **Pin → List** with **Filters → Status = Failed**.
2. **Pin → Update** to correct the title, link or board, then **Pin → Retry**.

### Schedule a future publish
1. **Schedule → Create**, pick **Run At** in the date picker (read in the workflow's time zone).
2. Change it later with **Schedule → Update** instead of cancelling and recreating it.

### Weekly report
1. A **Schedule Trigger** every Monday.
2. **Analytics → Get Publishing Summary** for the last 7 days and **Analytics → List Top Pins** ranked by saves.
3. Send both to Slack or email.

### Check rate limit headroom before publishing
1. **Rate Meter → Get** for the connection.
2. Branch on `accountTokensAvailable` or `globalTokensAvailable`.

## Limitations

- Targets PinBridge API v1. Admin, billing, team, and API-key management endpoints are not included.
- Upload operations and Import CSV need an incoming binary property.
- Published pins cannot be edited (a Pinterest API restriction): delete and publish again.
- Rate limits follow your PinBridge plan and Pinterest's API quotas.

## Support

- Bug reports and feature requests: [GitHub Issues](https://github.com/pinbridge/n8n-nodes-pinbridge/issues)
- General questions: [contact@pinbridge.io](mailto:contact@pinbridge.io)
- PinBridge product: [https://pinbridge.io](https://pinbridge.io)

## Development

```bash
npm install
npm run lint
npm test        # compiles and runs the node:test suite against a mocked API
npm run build
npm run dev
```

After publishing, check the release with n8n's verification scanner:

```bash
npx @n8n/scan-community-package n8n-nodes-pinbridge
```

## License

MIT — see [LICENSE](./LICENSE).
