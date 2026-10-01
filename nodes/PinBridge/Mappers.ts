/**
 * Map PinBridge API responses to n8n item JSON (camelCase keys, raw payload kept).
 *
 * Output keys are part of the node's contract: workflows reference them in expressions,
 * so existing keys must never be renamed or removed. Add new keys instead.
 */

import type { IDataObject } from 'n8n-workflow';

import type {
	PinBridgeAccount,
	PinBridgeActivityLog,
	PinBridgeAnalytics,
	PinBridgeAnalyticsCollect,
	PinBridgeAnalyticsOverview,
	PinBridgeAsset,
	PinBridgeAssetDeleteResponse,
	PinBridgeBatchItemResult,
	PinBridgeBoard,
	PinBridgeBoardAccess,
	PinBridgeDashboardSummary,
	PinBridgeImportJob,
	PinBridgeJobStatus,
	PinBridgePinDeleteResponse,
	PinBridgePinRecord,
	PinBridgeRateMeter,
	PinBridgeRelatedTermsItem,
	PinBridgeRelatedTermsResponse,
	PinBridgeSchedule,
	PinBridgeValidationResponse,
	PinBridgeWebhook,
} from './ApiTypes';

function raw(value: unknown): IDataObject {
	return value as IDataObject;
}

export function normalizeAccountName(account: PinBridgeAccount): string {
	return (
		account.display_name ||
		account.username ||
		account.pinterest_user_id ||
		`Account ${account.id}`
	);
}

export function mapBoardJson(board: PinBridgeBoard): IDataObject {
	return {
		id: board.id,
		name: board.name,
		description: board.description ?? null,
		privacy: board.privacy ?? null,
		raw: raw(board),
	};
}

export function mapBoardAccessJson(access: PinBridgeBoardAccess): IDataObject {
	return {
		accountId: access.account_id,
		boardId: access.board_id,
		publishable: access.publishable,
		status: access.status,
		code: access.code ?? null,
		message: access.message,
		remediation: access.remediation ?? null,
		checkedAt: access.checked_at,
		source: access.source,
		retryAfterSeconds: access.retry_after_seconds ?? null,
		raw: raw(access),
	};
}

export function mapRelatedTermsJson(
	response: PinBridgeRelatedTermsResponse,
	group: PinBridgeRelatedTermsItem,
): IDataObject {
	return {
		requestId: response.id,
		term: group.term,
		relatedTerms: group.related_terms,
		relatedTermCount: group.related_terms.length,
		totalRelatedTermCount: response.related_term_count,
		exactMatch: response.exact_match,
		rawGroup: raw(group),
		rawResponse: raw(response),
	};
}

export function mapConnectionJson(account: PinBridgeAccount): IDataObject {
	return {
		id: account.id,
		name: normalizeAccountName(account),
		scopes: account.scopes,
		pinterestUserId: account.pinterest_user_id,
		username: account.username ?? null,
		healthStatus: account.health_status ?? null,
		healthMessage: account.health_message ?? null,
		reconnectRequired: account.reconnect_required ?? false,
		missingScopes: account.missing_scopes ?? [],
		tokenExpiresAt: account.token_expires_at ?? null,
		raw: raw(account),
	};
}

export function mapPinJson(pin: PinBridgePinRecord): IDataObject {
	return {
		id: pin.id,
		workspaceId: pin.workspace_id,
		accountId: pin.pinterest_account_id,
		status: pin.status,
		mediaType: pin.media_type,
		title: pin.title,
		description: pin.description ?? null,
		relatedTerms: pin.related_terms ?? null,
		altText: pin.alt_text ?? null,
		dominantColor: pin.dominant_color ?? null,
		coverImageUrl: pin.cover_image_url ?? null,
		linkUrl: pin.link_url ?? null,
		mediaUrl: pin.media_url,
		imageUrl: pin.image_url,
		assetId: pin.asset_id ?? null,
		boardId: pin.board_id,
		pinterestPinId: pin.pinterest_pin_id ?? null,
		errorCode: pin.error_code ?? null,
		errorMessage: pin.error_message ?? null,
		idempotencyKey: pin.idempotency_key,
		createdAt: pin.created_at,
		updatedAt: pin.updated_at,
		publishedAt: pin.published_at ?? null,
		failedAt: pin.failed_at ?? null,
		removedFromPinterestAt: pin.removed_from_pinterest_at ?? null,
		raw: raw(pin),
	};
}

export function mapJobStatusJson(status: PinBridgeJobStatus): IDataObject {
	return {
		jobId: status.job_id,
		pinId: status.pin_id,
		status: status.status,
		submittedAt: status.submitted_at,
		completedAt: status.completed_at ?? null,
		pinterestPinId: status.pinterest_pin_id ?? null,
		errorCode: status.error_code ?? null,
		errorMessage: status.error_message ?? null,
		raw: raw(status),
	};
}

export function mapImportJobJson(job: PinBridgeImportJob): IDataObject {
	return {
		id: job.id,
		workspaceId: job.workspace_id,
		sourceType: job.source_type,
		status: job.status,
		sourceFilename: job.source_filename ?? null,
		totalRows: job.total_rows,
		processedRows: job.processed_rows,
		createdRows: job.created_rows,
		existingRows: job.existing_rows,
		failedRows: job.failed_rows,
		errorMessage: job.error_message ?? null,
		startedAt: job.started_at ?? null,
		completedAt: job.completed_at ?? null,
		createdAt: job.created_at,
		updatedAt: job.updated_at,
		results: job.results.map((result) => ({
			rowNumber: result.row_number,
			status: result.status,
			pinId: result.pin_id ?? null,
			scheduleId: result.schedule_id ?? null,
			idempotencyKey: result.idempotency_key ?? null,
			errorCode: result.error_code ?? null,
			errorMessage: result.error_message ?? null,
			raw: raw(result),
		})),
		raw: raw(job),
	};
}

export function mapScheduleJson(schedule: PinBridgeSchedule): IDataObject {
	return {
		id: schedule.id,
		workspaceId: schedule.workspace_id,
		accountId: schedule.pinterest_account_id,
		runAt: schedule.run_at,
		status: schedule.status,
		boardId: schedule.payload.board_id ?? null,
		title: schedule.payload.title ?? null,
		description: schedule.payload.description ?? null,
		linkUrl: schedule.payload.link_url ?? null,
		mediaType: schedule.payload.media_type ?? null,
		mediaUrl: schedule.payload.media_url ?? null,
		imageUrl: schedule.payload.image_url ?? null,
		assetId: schedule.payload.asset_id ?? null,
		coverImageUrl: schedule.payload.cover_image_url ?? null,
		pinId: schedule.pin_id ?? null,
		lastError: schedule.last_error ?? null,
		createdAt: schedule.created_at,
		updatedAt: schedule.updated_at,
		raw: raw(schedule),
	};
}

export function mapAssetJson(asset: PinBridgeAsset): IDataObject {
	return {
		id: asset.id,
		workspaceId: asset.workspace_id,
		assetType: asset.asset_type,
		originalFilename: asset.original_filename,
		storedFilename: asset.stored_filename,
		contentType: asset.content_type,
		fileSizeBytes: asset.file_size_bytes,
		fileSizeDisplay: asset.file_size_display ?? null,
		referencedByPinCount: asset.referenced_by_pin_count ?? 0,
		publicUrl: asset.public_url,
		createdAt: asset.created_at,
		updatedAt: asset.updated_at,
		raw: raw(asset),
	};
}

export function mapAssetDeleteJson(id: string, response: PinBridgeAssetDeleteResponse): IDataObject {
	return {
		id,
		resource: 'asset',
		deleted: response.deleted,
		requiresConfirmation: response.requires_confirmation,
		referencedPinCount: response.referenced_pin_count,
		freedBytes: response.freed_bytes,
		raw: raw(response),
	};
}

export function mapRateMeterJson(rateMeter: PinBridgeRateMeter): IDataObject {
	return {
		accountId: rateMeter.account.account_id ?? null,
		accountTokensAvailable: rateMeter.account.tokens_available,
		accountCapacity: rateMeter.account.capacity,
		accountRefillRate: rateMeter.account.refill_rate,
		globalTokensAvailable: rateMeter.global.tokens_available,
		globalCapacity: rateMeter.global.capacity,
		globalRefillRate: rateMeter.global.refill_rate,
		raw: raw(rateMeter),
	};
}

export function mapDeleteJson(resource: string, id: string): IDataObject {
	return {
		id,
		resource,
		deleted: true,
	};
}

/** Pin delete: 204 (record only) or a PinDeleteResponse when Pinterest was asked too. */
export function mapPinDeleteJson(
	id: string,
	response: PinBridgePinDeleteResponse | undefined,
): IDataObject {
	if (!response || typeof response !== 'object') {
		return { ...mapDeleteJson('pin', id), removedFromPinterest: false };
	}
	return {
		...mapDeleteJson('pin', id),
		removedFromPinterest: response.removed_from_pinterest,
		pinterestPinId: response.pinterest_pin_id ?? null,
		reason: response.reason ?? null,
	};
}

export function mapWebhookJson(webhook: PinBridgeWebhook): IDataObject {
	return {
		id: webhook.id,
		workspaceId: webhook.workspace_id,
		url: webhook.url,
		events: webhook.events,
		isEnabled: webhook.is_enabled,
		createdAt: webhook.created_at,
		updatedAt: webhook.updated_at,
		raw: raw(webhook),
	};
}

export function mapValidationJson(validation: PinBridgeValidationResponse): IDataObject {
	const failedChecks = validation.checks.filter((check) => check.status === 'failed');
	return {
		valid: validation.valid,
		dryRun: validation.dry_run ?? true,
		failedChecks: failedChecks.map((check) => ({
			name: check.name ?? null,
			code: check.code ?? null,
			message: check.message ?? null,
			remediation: check.remediation ?? null,
		})),
		checks: raw(validation.checks),
		resolved: validation.resolved ?? null,
		existingPinId: validation.existing_pin_id ?? null,
		headroom: validation.headroom ?? null,
		raw: raw(validation),
	};
}

export function mapBatchResultJson(result: PinBridgeBatchItemResult): IDataObject {
	const error = result.error ?? null;
	return {
		batchStatus: result.status,
		batchIndex: result.index,
		idempotencyKey: result.idempotency_key,
		...(result.pin ? mapPinJson(result.pin) : {}),
		errorCode: (error?.code as string | undefined) ?? result.pin?.error_code ?? null,
		errorMessage: (error?.message as string | undefined) ?? result.pin?.error_message ?? null,
		remediation: (error?.remediation as string | undefined) ?? null,
		raw: raw(result),
	};
}

export function mapActivityLogJson(log: PinBridgeActivityLog): IDataObject {
	return {
		id: log.id,
		createdAt: log.created_at,
		action: log.action,
		category: log.category,
		status: log.status,
		message: log.message,
		actorType: log.actor_type,
		actorLabel: log.actor_label ?? null,
		actorUserId: log.actor_user_id ?? null,
		resourceType: log.resource_type ?? null,
		resourceId: log.resource_id ?? null,
		requestId: log.request_id ?? null,
		metadata: log.metadata,
		raw: raw(log),
	};
}

export function mapAnalyticsJson(analytics: PinBridgeAnalytics): IDataObject {
	const json: IDataObject = {
		accountId: analytics.account_id,
		startDate: analytics.start_date,
		endDate: analytics.end_date,
		source: analytics.source ?? null,
		providerMode: analytics.provider_mode,
		dataAsOf: analytics.data_as_of ?? null,
		historyStart: analytics.history_start ?? null,
		totals: analytics.totals,
		daily: analytics.daily,
	};
	if (analytics.pin_id !== undefined) {
		json.pinId = analytics.pin_id;
		json.pinterestPinId = analytics.pinterest_pin_id ?? null;
		json.removedFromPinterestAt = analytics.removed_from_pinterest_at ?? null;
	}
	return json;
}

export function mapAnalyticsOverviewJson(overview: PinBridgeAnalyticsOverview): IDataObject {
	return {
		startDate: overview.start_date,
		endDate: overview.end_date,
		previousStartDate: overview.previous_start_date,
		previousEndDate: overview.previous_end_date,
		metrics: overview.metrics,
		totals: overview.totals,
		previousTotals: overview.previous_totals ?? null,
		daily: overview.daily,
		historyStart: overview.history_start ?? null,
		dataAsOf: overview.data_as_of ?? null,
		accounts: overview.accounts,
	};
}

export function mapTopPinJson(pin: IDataObject, rank: number): IDataObject {
	return {
		rank,
		pinId: pin.pin_id,
		pinterestPinId: pin.pinterest_pin_id ?? null,
		accountId: pin.account_id,
		title: pin.title,
		linkUrl: pin.link_url ?? null,
		thumbnailUrl: pin.thumbnail_url ?? null,
		mediaType: pin.media_type,
		publishedAt: pin.published_at ?? null,
		totals: pin.totals,
	};
}

export function mapAnalyticsCollectJson(response: PinBridgeAnalyticsCollect): IDataObject {
	return {
		accountId: response.account_id,
		status: response.status,
		message: response.message,
	};
}

export function mapDashboardSummaryJson(summary: PinBridgeDashboardSummary): IDataObject {
	return {
		start: summary.start,
		end: summary.end,
		timezone: summary.timezone,
		granularity: summary.granularity,
		previousStart: summary.previous_start,
		previousEnd: summary.previous_end,
		accountId: summary.account_id ?? null,
		pins: summary.pins,
		previousPins: summary.previous_pins,
		series: summary.series,
		publishedByAccount: summary.published_by_account,
		queue: summary.queue,
		schedules: summary.schedules,
		importJobs: summary.import_jobs ?? null,
	};
}
