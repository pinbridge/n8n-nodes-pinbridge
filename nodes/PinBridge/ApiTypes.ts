/** Response shapes of the PinBridge API endpoints this node calls. */

import type { IDataObject } from 'n8n-workflow';

export interface PinBridgeAccount {
	id: string;
	pinterest_user_id: string;
	display_name?: string | null;
	username?: string | null;
	scopes: string;
	token_expires_at?: string | null;
	health_status?: string;
	health_message?: string | null;
	health_checked_at?: string;
	reconnect_required?: boolean;
	missing_scopes?: string[];
	[key: string]: unknown;
}

export interface PinBridgeBoard {
	id: string;
	name: string;
	description?: string | null;
	privacy?: string | null;
	[key: string]: unknown;
}

export interface PinBridgeBoardAccess {
	account_id: string;
	board_id: string;
	publishable: boolean;
	status: string;
	code?: string | null;
	message: string;
	remediation?: string | null;
	checked_at: string;
	source: string;
	board?: IDataObject | null;
	account_health?: IDataObject | null;
	retry_after_seconds?: number | null;
	[key: string]: unknown;
}

export interface PinBridgeRelatedTermsItem {
	term: string;
	related_terms: string[];
	[key: string]: unknown;
}

export interface PinBridgeRelatedTermsResponse {
	id: string;
	related_term_count: number;
	related_terms_list: PinBridgeRelatedTermsItem[];
	exact_match: boolean;
	[key: string]: unknown;
}

export interface PinBridgePinRecord {
	id: string;
	workspace_id: string;
	pinterest_account_id: string;
	status: string;
	media_type: string;
	title: string;
	description?: string | null;
	related_terms?: string[] | null;
	alt_text?: string | null;
	dominant_color?: string | null;
	cover_image_url?: string | null;
	link_url?: string | null;
	media_url: string;
	image_url: string;
	asset_id?: string | null;
	board_id: string;
	pinterest_pin_id?: string | null;
	error_code?: string | null;
	error_message?: string | null;
	idempotency_key: string;
	created_at: string;
	updated_at: string;
	published_at?: string | null;
	failed_at?: string | null;
	removed_from_pinterest_at?: string | null;
	[key: string]: unknown;
}

/** Body of `DELETE /v1/pins/{id}?delete_from_pinterest=true` (the plain delete returns 204). */
export interface PinBridgePinDeleteResponse {
	id: string;
	deleted?: boolean;
	removed_from_pinterest: boolean;
	pinterest_pin_id?: string | null;
	reason?: string | null;
	[key: string]: unknown;
}

export interface PinBridgeValidationCheck {
	name?: string;
	status?: string;
	code?: string | null;
	message?: string | null;
	remediation?: string | null;
	[key: string]: unknown;
}

export interface PinBridgeValidationResponse {
	valid: boolean;
	dry_run?: boolean;
	checks: PinBridgeValidationCheck[];
	resolved?: IDataObject | null;
	existing_pin_id?: string | null;
	headroom?: IDataObject | null;
	[key: string]: unknown;
}

export interface PinBridgeBatchItemResult {
	index: number;
	idempotency_key: string;
	status: 'created' | 'existing' | 'failed';
	pin?: PinBridgePinRecord | null;
	error?: IDataObject | null;
	[key: string]: unknown;
}

export interface PinBridgeBatchResponse {
	created_count: number;
	existing_count: number;
	failed_count: number;
	results: PinBridgeBatchItemResult[];
	headroom?: IDataObject | null;
	[key: string]: unknown;
}

export interface PinBridgeJobStatus {
	job_id: string;
	pin_id: string;
	status: string;
	submitted_at: string;
	completed_at?: string | null;
	pinterest_pin_id?: string | null;
	error_code?: string | null;
	error_message?: string | null;
	[key: string]: unknown;
}

export interface PinBridgeImportJobResult {
	row_number: number;
	status: string;
	pin_id?: string | null;
	schedule_id?: string | null;
	idempotency_key?: string | null;
	error_code?: string | null;
	error_message?: string | null;
	[key: string]: unknown;
}

export interface PinBridgeImportJob {
	id: string;
	workspace_id: string;
	source_type: string;
	status: string;
	source_filename?: string | null;
	total_rows: number;
	processed_rows: number;
	created_rows: number;
	existing_rows: number;
	failed_rows: number;
	results: PinBridgeImportJobResult[];
	error_message?: string | null;
	started_at?: string | null;
	completed_at?: string | null;
	created_at: string;
	updated_at: string;
	[key: string]: unknown;
}

export interface PinBridgeSchedule {
	id: string;
	workspace_id: string;
	pinterest_account_id: string;
	run_at: string;
	status: string;
	payload: {
		board_id?: string;
		title?: string;
		description?: string | null;
		link_url?: string | null;
		media_type?: string;
		media_url?: string;
		image_url?: string;
		asset_id?: string | null;
		cover_image_url?: string | null;
		[key: string]: unknown;
	};
	last_error?: string | null;
	pin_id?: string | null;
	created_at: string;
	updated_at: string;
	[key: string]: unknown;
}

export interface PinBridgeAsset {
	id: string;
	workspace_id: string;
	asset_type: string;
	original_filename: string;
	stored_filename: string;
	content_type: string;
	file_size_bytes: number;
	file_size_display?: string;
	referenced_by_pin_count?: number;
	public_url: string;
	created_at: string;
	updated_at: string;
	[key: string]: unknown;
}

export interface PinBridgeAssetList {
	assets: PinBridgeAsset[];
	total: number;
	storage_used_bytes: number;
	storage_quota_bytes: number;
	storage_used_percent: number;
	[key: string]: unknown;
}

export interface PinBridgeAssetDeleteResponse {
	deleted: boolean;
	requires_confirmation: boolean;
	referenced_pin_count: number;
	freed_bytes: number;
	[key: string]: unknown;
}

export interface PinBridgeRateBucket {
	account_id?: string;
	tokens_available: number;
	capacity: number;
	refill_rate: number;
}

export interface PinBridgeRateMeter {
	account: PinBridgeRateBucket;
	global: PinBridgeRateBucket;
}

export interface PinBridgeOAuthStartResponse {
	authorization_url: string;
	[key: string]: unknown;
}

export interface PinBridgeOAuthCallbackResponse {
	status: string;
	message: string;
	account_id?: string | null;
	[key: string]: unknown;
}

export interface PinBridgeWebhook {
	id: string;
	workspace_id: string;
	url: string;
	events: string[];
	is_enabled: boolean;
	created_at: string;
	updated_at: string;
	[key: string]: unknown;
}

export interface PinBridgeActivityLog {
	id: string;
	actor_user_id?: string | null;
	actor_type: string;
	actor_label?: string | null;
	action: string;
	category: string;
	resource_type?: string | null;
	resource_id?: string | null;
	status: string;
	message: string;
	metadata: IDataObject;
	request_id?: string | null;
	created_at: string;
	[key: string]: unknown;
}

export interface PinBridgeActivityLogPage {
	items: PinBridgeActivityLog[];
	next_cursor?: string | null;
	[key: string]: unknown;
}

/** Shared by `GET /v1/pins/{id}/analytics` and `GET /v1/pinterest/accounts/{id}/analytics`. */
export interface PinBridgeAnalytics {
	pin_id?: string;
	pinterest_pin_id?: string | null;
	account_id: string;
	start_date: string;
	end_date: string;
	provider_mode: string;
	totals: IDataObject;
	daily: IDataObject[];
	source?: string;
	data_as_of?: string | null;
	history_start?: string | null;
	removed_from_pinterest_at?: string | null;
	[key: string]: unknown;
}

export interface PinBridgeAnalyticsOverview {
	start_date: string;
	end_date: string;
	previous_start_date: string;
	previous_end_date: string;
	metrics: string[];
	totals: IDataObject;
	previous_totals?: IDataObject | null;
	daily: IDataObject[];
	history_start?: string | null;
	data_as_of?: string | null;
	accounts: IDataObject[];
	[key: string]: unknown;
}

export interface PinBridgeTopPinsPage {
	items: IDataObject[];
	total: number;
	[key: string]: unknown;
}

export interface PinBridgeAnalyticsCollect {
	account_id: string;
	status: string;
	message: string;
	[key: string]: unknown;
}

export interface PinBridgeDashboardSummary {
	start: string;
	end: string;
	timezone: string;
	granularity: string;
	previous_start: string;
	previous_end: string;
	account_id?: string | null;
	pins: IDataObject;
	previous_pins: IDataObject;
	series: IDataObject[];
	published_by_account: IDataObject[];
	queue: IDataObject;
	schedules: IDataObject;
	import_jobs?: IDataObject | null;
	[key: string]: unknown;
}
