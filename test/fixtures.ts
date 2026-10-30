import type { IDataObject } from 'n8n-workflow';

export const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
export const PIN_ID = '22222222-2222-4222-8222-222222222222';
export const SCHEDULE_ID = '33333333-3333-4333-8333-333333333333';
export const ASSET_ID = '44444444-4444-4444-8444-444444444444';
export const WEBHOOK_ID = '55555555-5555-4555-8555-555555555555';
export const IMPORT_ID = '66666666-6666-4666-8666-666666666666';
export const WORKSPACE_ID = '77777777-7777-4777-8777-777777777777';
export const BOARD_ID = '900000000000000001';

export function pinRecord(overrides: IDataObject = {}): IDataObject {
	return {
		id: PIN_ID,
		workspace_id: WORKSPACE_ID,
		pinterest_account_id: ACCOUNT_ID,
		status: 'queued',
		media_type: 'image',
		title: 'Autumn recipes',
		description: 'Five soups',
		related_terms: ['soup'],
		alt_text: null,
		dominant_color: null,
		cover_image_url: null,
		link_url: 'https://example.com/soups',
		media_url: 'https://cdn.example.com/soup.png',
		image_url: 'https://cdn.example.com/soup.png',
		asset_id: null,
		board_id: BOARD_ID,
		pinterest_pin_id: null,
		error_code: null,
		error_message: null,
		idempotency_key: 'run-1-0',
		created_at: '2026-09-30T10:00:00Z',
		updated_at: '2026-09-30T10:00:00Z',
		published_at: null,
		failed_at: null,
		removed_from_pinterest_at: null,
		...overrides,
	};
}

export function scheduleRecord(overrides: IDataObject = {}): IDataObject {
	return {
		id: SCHEDULE_ID,
		workspace_id: WORKSPACE_ID,
		pinterest_account_id: ACCOUNT_ID,
		run_at: '2026-10-01T09:00:00Z',
		status: 'scheduled',
		payload: {
			board_id: BOARD_ID,
			title: 'Autumn recipes',
			description: null,
			link_url: null,
			media_type: 'image',
			media_url: 'https://cdn.example.com/soup.png',
			image_url: 'https://cdn.example.com/soup.png',
			asset_id: null,
			cover_image_url: null,
		},
		last_error: null,
		pin_id: null,
		created_at: '2026-09-30T10:00:00Z',
		updated_at: '2026-09-30T10:00:00Z',
		...overrides,
	};
}

export function assetRecord(overrides: IDataObject = {}): IDataObject {
	return {
		id: ASSET_ID,
		workspace_id: WORKSPACE_ID,
		asset_type: 'image',
		original_filename: 'soup.png',
		stored_filename: 'abc.png',
		content_type: 'image/png',
		file_size_bytes: 1024,
		file_size_display: '1.0 KB',
		referenced_by_pin_count: 0,
		public_url: 'https://cdn.example.com/abc.png',
		created_at: '2026-09-30T10:00:00Z',
		updated_at: '2026-09-30T10:00:00Z',
		...overrides,
	};
}

export function accountRecord(overrides: IDataObject = {}): IDataObject {
	return {
		id: ACCOUNT_ID,
		workspace_id: WORKSPACE_ID,
		pinterest_user_id: 'pinuser',
		display_name: 'Soup Studio',
		username: 'soupstudio',
		scopes: 'boards:read,pins:write',
		token_expires_at: '2026-12-01T00:00:00Z',
		health_status: 'healthy',
		health_message: null,
		health_checked_at: '2026-09-30T10:00:00Z',
		reconnect_required: false,
		missing_scopes: [],
		created_at: '2026-09-01T10:00:00Z',
		updated_at: '2026-09-30T10:00:00Z',
		revoked_at: null,
		...overrides,
	};
}

export function webhookRecord(overrides: IDataObject = {}): IDataObject {
	return {
		id: WEBHOOK_ID,
		workspace_id: WORKSPACE_ID,
		url: 'https://hooks.example.com/pinbridge',
		events: ['pin.published', 'pin.failed'],
		is_enabled: true,
		created_at: '2026-09-30T10:00:00Z',
		updated_at: '2026-09-30T10:00:00Z',
		...overrides,
	};
}

export function importJobRecord(overrides: IDataObject = {}): IDataObject {
	return {
		id: IMPORT_ID,
		workspace_id: WORKSPACE_ID,
		source_type: 'json',
		status: 'queued',
		source_filename: null,
		total_rows: 1,
		processed_rows: 0,
		created_rows: 0,
		existing_rows: 0,
		failed_rows: 0,
		results: [],
		error_message: null,
		started_at: null,
		completed_at: null,
		created_at: '2026-09-30T10:00:00Z',
		updated_at: '2026-09-30T10:00:00Z',
		...overrides,
	};
}
