import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes as NodeConnectionType, NodeOperationError } from 'n8n-workflow';

import { pinBridgeApiRequest, pinBridgeMultipartRequest } from './GenericFunctions';

interface PinBridgeAccount {
	id: string;
	pinterest_user_id: string;
	display_name?: string;
	username?: string;
	scopes: string;
	[key: string]: unknown;
}

interface PinBridgeBoard {
	id: string;
	name: string;
	description?: string;
	privacy?: string;
	[key: string]: unknown;
}

interface PinBridgeRelatedTermsItem {
	term: string;
	related_terms: string[];
	[key: string]: unknown;
}

interface PinBridgeRelatedTermsResponse {
	id: string;
	related_term_count: number;
	related_terms_list: PinBridgeRelatedTermsItem[];
	exact_match: boolean;
	[key: string]: unknown;
}

interface PinBridgePinRecord {
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
	[key: string]: unknown;
}

interface PinBridgeJobStatus {
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

interface PinBridgeImportJobResult {
	row_number: number;
	status: string;
	pin_id?: string | null;
	schedule_id?: string | null;
	idempotency_key?: string | null;
	error_code?: string | null;
	error_message?: string | null;
	[key: string]: unknown;
}

interface PinBridgeImportJob {
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

interface PinBridgeSchedule {
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

interface PinBridgeAsset {
	id: string;
	workspace_id: string;
	asset_type: string;
	original_filename: string;
	stored_filename: string;
	content_type: string;
	file_size_bytes: number;
	public_url: string;
	created_at: string;
	updated_at: string;
	[key: string]: unknown;
}

interface PinBridgeRateBucket {
	account_id?: string;
	tokens_available: number;
	capacity: number;
	refill_rate: number;
}

interface PinBridgeRateMeter {
	account: PinBridgeRateBucket;
	global: PinBridgeRateBucket;
}

interface PinBridgeOAuthStartResponse {
	authorization_url: string;
	[key: string]: unknown;
}

interface PinBridgeOAuthCallbackResponse {
	status: string;
	message: string;
	account_id?: string | null;
	[key: string]: unknown;
}

interface PinBridgeWebhook {
	id: string;
	workspace_id: string;
	url: string;
	events: string[];
	is_enabled: boolean;
	created_at: string;
	updated_at: string;
	[key: string]: unknown;
}

function normalizeAccountName(account: PinBridgeAccount): string {
	return (
		account.display_name ||
		account.username ||
		account.pinterest_user_id ||
		`Account ${account.id}`
	);
}

function mapBoardJson(board: PinBridgeBoard): IDataObject {
	return {
		id: board.id,
		name: board.name,
		description: board.description ?? null,
		privacy: board.privacy ?? null,
		raw: board as unknown as IDataObject,
	};
}

function mapRelatedTermsJson(
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
		rawGroup: group as unknown as IDataObject,
		rawResponse: response as unknown as IDataObject,
	};
}

function mapConnectionJson(account: PinBridgeAccount): IDataObject {
	return {
		id: account.id,
		name: normalizeAccountName(account),
		scopes: account.scopes,
		pinterestUserId: account.pinterest_user_id,
		raw: account as unknown as IDataObject,
	};
}

function mapPinJson(pin: PinBridgePinRecord): IDataObject {
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
		raw: pin as unknown as IDataObject,
	};
}

function mapJobStatusJson(status: PinBridgeJobStatus): IDataObject {
	return {
		jobId: status.job_id,
		pinId: status.pin_id,
		status: status.status,
		submittedAt: status.submitted_at,
		completedAt: status.completed_at ?? null,
		pinterestPinId: status.pinterest_pin_id ?? null,
		errorCode: status.error_code ?? null,
		errorMessage: status.error_message ?? null,
		raw: status as unknown as IDataObject,
	};
}

function mapImportJobJson(job: PinBridgeImportJob): IDataObject {
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
			raw: result as unknown as IDataObject,
		})),
		raw: job as unknown as IDataObject,
	};
}

function mapScheduleJson(schedule: PinBridgeSchedule): IDataObject {
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
		raw: schedule as unknown as IDataObject,
	};
}

function mapAssetJson(asset: PinBridgeAsset): IDataObject {
	return {
		id: asset.id,
		workspaceId: asset.workspace_id,
		assetType: asset.asset_type,
		originalFilename: asset.original_filename,
		storedFilename: asset.stored_filename,
		contentType: asset.content_type,
		fileSizeBytes: asset.file_size_bytes,
		publicUrl: asset.public_url,
		createdAt: asset.created_at,
		updatedAt: asset.updated_at,
		raw: asset as unknown as IDataObject,
	};
}

function mapRateMeterJson(rateMeter: PinBridgeRateMeter): IDataObject {
	return {
		accountId: rateMeter.account.account_id ?? null,
		accountTokensAvailable: rateMeter.account.tokens_available,
		accountCapacity: rateMeter.account.capacity,
		accountRefillRate: rateMeter.account.refill_rate,
		globalTokensAvailable: rateMeter.global.tokens_available,
		globalCapacity: rateMeter.global.capacity,
		globalRefillRate: rateMeter.global.refill_rate,
		raw: rateMeter as unknown as IDataObject,
	};
}

function mapDeleteJson(resource: string, id: string): IDataObject {
	return {
		id,
		resource,
		deleted: true,
	};
}

function mapWebhookJson(webhook: PinBridgeWebhook): IDataObject {
	return {
		id: webhook.id,
		workspaceId: webhook.workspace_id,
		url: webhook.url,
		events: webhook.events,
		isEnabled: webhook.is_enabled,
		createdAt: webhook.created_at,
		updatedAt: webhook.updated_at,
		raw: webhook as unknown as IDataObject,
	};
}

function parseCsvList(value: string): string[] {
	return value
		.split(',')
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);
}

function hasExplicitTimezoneOffset(value: string): boolean {
	return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
}

async function fetchPaginatedCollection<TRecord>(
	context: IExecuteFunctions,
	path: string,
	limit: number,
	returnAll: boolean,
	baseQuery: IDataObject = {},
): Promise<TRecord[]> {
	if (!returnAll) {
		return (await pinBridgeApiRequest.call(context, 'GET', path, {
			...baseQuery,
			limit,
			offset: 0,
		})) as TRecord[];
	}

	const results: TRecord[] = [];
	const pageSize = 100;
	let offset = 0;
	let hasMore = true;

	while (hasMore) {
		const page = (await pinBridgeApiRequest.call(context, 'GET', path, {
			...baseQuery,
			limit: pageSize,
			offset,
		})) as TRecord[];

		results.push(...page);
		hasMore = page.length === pageSize;
		offset += page.length;
	}

	return results;
}

export class PinBridge implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PinBridge',
		name: 'pinBridge',
		icon: 'file:pinbridge.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Publish, schedule, and manage Pinterest workflows through the PinBridge API',
		defaults: {
			name: 'PinBridge',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'pinBridgeApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Asset',
						value: 'assets',
					},
					{
						name: 'Board',
						value: 'boards',
					},
					{
						name: 'Connection',
						value: 'connections',
					},
					{
						name: 'Pin',
						value: 'pins',
					},
					{
						name: 'Rate Meter',
						value: 'rateMeter',
					},
					{
						name: 'Schedule',
						value: 'schedules',
					},
					{
						name: 'Terms',
						value: 'terms',
					},
					{
						name: 'Webhook',
						value: 'webhooks',
					},
				],
				default: 'pins',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['assets'],
					},
				},
				options: [
					{
						name: 'Get',
						value: 'get',
						action: 'Get an asset',
					},
					{
						name: 'Upload Image',
						value: 'uploadImage',
						action: 'Upload an image asset',
					},
					{
						name: 'Upload Video',
						value: 'uploadVideo',
						action: 'Upload a video asset',
					},
				],
				default: 'uploadImage',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['boards'],
					},
				},
				options: [
					{
						name: 'Create',
						value: 'create',
						action: 'Create a board',
					},
					{
						name: 'Delete',
						value: 'delete',
						action: 'Delete a board',
					},
					{
						name: 'List',
						value: 'list',
						action: 'List boards',
					},
				],
				default: 'list',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['terms'],
					},
				},
				options: [
					{
						name: 'List Related',
						value: 'listRelated',
						action: 'List related terms',
					},
				],
				default: 'listRelated',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['pins'],
					},
				},
				options: [
					{
						name: 'Delete',
						value: 'delete',
						action: 'Delete a pin',
					},
					{
						name: 'Get',
						value: 'get',
						action: 'Get a pin',
					},
					{
						name: 'Get Import',
						value: 'getImport',
						action: 'Get a bulk import job',
					},
					{
						name: 'Get Status',
						value: 'getStatus',
						action: 'Get a pin job status',
					},
					{
						name: 'Import CSV',
						value: 'importCsv',
						action: 'Import pins from a CSV file',
					},
					{
						name: 'Import JSON',
						value: 'importJson',
						action: 'Import pins from incoming JSON items',
					},
					{
						name: 'List',
						value: 'list',
						action: 'List pins',
					},
					{
						name: 'List Imports',
						value: 'listImports',
						action: 'List bulk import jobs',
					},
					{
						name: 'Publish',
						value: 'publish',
						action: 'Publish a pin',
					},
				],
				default: 'publish',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['schedules'],
					},
				},
				options: [
					{
						name: 'Cancel',
						value: 'cancel',
						action: 'Cancel a schedule',
					},
					{
						name: 'Create',
						value: 'create',
						action: 'Create a schedule',
					},
					{
						name: 'Get',
						value: 'get',
						action: 'Get a schedule',
					},
					{
						name: 'List',
						value: 'list',
						action: 'List schedules',
					},
				],
				default: 'create',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['connections'],
					},
				},
				options: [
					{
						name: 'Complete OAuth Callback',
						value: 'completeOAuth',
						action: 'Complete Pinterest OAuth callback',
					},
					{
						name: 'List',
						value: 'list',
						action: 'List connected Pinterest accounts',
					},
					{
						name: 'Revoke',
						value: 'revoke',
						action: 'Revoke a connected Pinterest account',
					},
					{
						name: 'Start OAuth',
						value: 'startOAuth',
						action: 'Start Pinterest OAuth flow',
					},
				],
				default: 'list',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['rateMeter'],
					},
				},
				options: [
					{
						name: 'Get',
						value: 'get',
						action: 'Get rate meter status',
					},
				],
				default: 'get',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['webhooks'],
					},
				},
				options: [
					{
						name: 'Create',
						value: 'create',
						action: 'Create a webhook',
					},
					{
						name: 'Delete',
						value: 'delete',
						action: 'Delete a webhook',
					},
					{
						name: 'Get',
						value: 'get',
						action: 'Get a webhook',
					},
					{
						name: 'List',
						value: 'list',
						action: 'List webhooks',
					},
					{
						name: 'Update',
						value: 'update',
						action: 'Update a webhook',
					},
				],
				default: 'list',
			},
			{
				displayName: 'Connection',
				name: 'accountId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getAccounts',
				},
				displayOptions: {
					show: {
						resource: ['boards'],
						operation: ['list', 'create', 'delete'],
					},
				},
				default: '',
				required: true,
				description: 'Pinterest connection/account ID from PinBridge',
			},
			{
				displayName: 'Connection',
				name: 'accountId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getAccounts',
				},
				displayOptions: {
					show: {
						resource: ['terms'],
						operation: ['listRelated'],
					},
				},
				default: '',
				required: true,
				description: 'Pinterest connection/account ID used for the related-terms lookup',
			},
			{
				displayName: 'Connection',
				name: 'accountId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getAccounts',
				},
				displayOptions: {
					show: {
						resource: ['pins'],
						operation: ['publish'],
					},
				},
				default: '',
				required: true,
				description: 'Pinterest connection/account used for publishing',
			},
			{
				displayName: 'Connection',
				name: 'accountId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getAccounts',
				},
				displayOptions: {
					show: {
						resource: ['schedules'],
						operation: ['create'],
					},
				},
				default: '',
				required: true,
				description: 'Pinterest connection/account used for scheduled publishing',
			},
			{
				displayName: 'Connection',
				name: 'accountId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getAccounts',
				},
				displayOptions: {
					show: {
						resource: ['rateMeter'],
						operation: ['get'],
					},
				},
				default: '',
				required: true,
				description: 'Pinterest connection/account used for the rate meter lookup',
			},
			{
				displayName: 'Connection',
				name: 'connectionId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getAccounts',
				},
				displayOptions: {
					show: {
						resource: ['connections'],
						operation: ['revoke'],
					},
				},
				default: '',
				required: true,
				description: 'Connected Pinterest account ID to revoke',
			},
			{
				displayName: 'OAuth Code',
				name: 'oauthCode',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['connections'],
						operation: ['completeOAuth'],
					},
				},
				default: '',
				required: true,
				description: 'Pinterest OAuth callback code',
			},
			{
				displayName: 'OAuth State',
				name: 'oauthState',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['connections'],
						operation: ['completeOAuth'],
					},
				},
				default: '',
				required: true,
				description: 'Signed OAuth state returned by Start OAuth',
			},
			{
				displayName: 'Board',
				name: 'boardId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getBoards',
				},
				displayOptions: {
					show: {
						resource: ['pins'],
						operation: ['publish'],
					},
				},
				default: '',
				required: true,
				description: 'Pinterest board ID where the pin will be published',
			},
			{
				displayName: 'Board',
				name: 'boardId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getBoards',
				},
				displayOptions: {
					show: {
						resource: ['schedules'],
						operation: ['create'],
					},
				},
				default: '',
				required: true,
				description: 'Pinterest board ID where the scheduled pin will be published',
			},
			{
				displayName: 'Board',
				name: 'boardId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getBoards',
				},
				displayOptions: {
					show: {
						resource: ['boards'],
						operation: ['delete'],
					},
				},
				default: '',
				required: true,
				description: 'Pinterest board ID to delete',
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				displayOptions: {
					show: {
						resource: ['boards', 'connections', 'pins', 'schedules', 'webhooks'],
						operation: ['list', 'listImports'],
					},
				},
				default: true,
				description: 'Whether to return all records or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: {
					minValue: 1,
					maxValue: 1000,
				},
				displayOptions: {
					show: {
						resource: ['boards', 'connections', 'pins', 'schedules', 'webhooks'],
						operation: ['list', 'listImports'],
						returnAll: [false],
					},
				},
				default: 50,
				description: 'Max number of records to return when Return All is disabled',
			},
			{
				displayName: 'Terms',
				name: 'termsInput',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['terms'],
						operation: ['listRelated'],
					},
				},
				default: '',
				required: true,
				description:
					'One or more terms to look up. Separate multiple values with commas.',
			},
			{
				displayName: 'Exact Match',
				name: 'exactMatch',
				type: 'boolean',
				displayOptions: {
					show: {
						resource: ['terms'],
						operation: ['listRelated'],
					},
				},
				default: false,
				description:
					'Whether to keep only groups whose returned term exactly matches one requested term',
			},
			{
				displayName: 'Import Status',
				name: 'importStatus',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['pins'],
						operation: ['listImports'],
					},
				},
				options: [
					{
						name: 'Any',
						value: '',
					},
					{
						name: 'Queued',
						value: 'queued',
					},
					{
						name: 'Processing',
						value: 'processing',
					},
					{
						name: 'Completed',
						value: 'completed',
					},
					{
						name: 'Completed With Errors',
						value: 'completed_with_errors',
					},
					{
						name: 'Failed',
						value: 'failed',
					},
				],
				default: '',
				description: 'Optionally filter import jobs by processing status',
			},
			{
				displayName: 'Import Source',
				name: 'importSourceType',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['pins'],
						operation: ['listImports'],
					},
				},
				options: [
					{
						name: 'Any',
						value: '',
					},
					{
						name: 'JSON',
						value: 'json',
					},
					{
						name: 'CSV',
						value: 'csv',
					},
				],
				default: '',
				description: 'Optionally filter import jobs by source type',
			},
			{
				displayName: 'Media Source',
				name: 'imageSource',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['pins', 'schedules'],
						operation: ['publish', 'create'],
					},
				},
				options: [
					{
						name: 'Uploaded Asset',
						value: 'asset',
					},
					{
						name: 'Public Image URL',
						value: 'url',
					},
				],
				default: 'asset',
				description:
					'Choose whether to reference a PinBridge asset (image or video) or an existing public image URL',
			},
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['pins', 'schedules'],
						operation: ['publish', 'create'],
					},
				},
				default: '',
				required: true,
				description: 'Pin title (max 100 characters)',
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: {
					rows: 3,
				},
				displayOptions: {
					show: {
						resource: ['pins', 'schedules'],
						operation: ['publish', 'create'],
					},
				},
				default: '',
				description: 'Optional pin description (max 800 characters)',
			},
			{
				displayName: 'Link URL',
				name: 'linkUrl',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['pins', 'schedules'],
						operation: ['publish', 'create'],
					},
				},
				default: '',
				description: 'Optional destination URL for the pin (max 2048 characters)',
			},
			{
				displayName: 'Alt Text',
				name: 'altText',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['pins'],
						operation: ['publish'],
					},
				},
				default: '',
				description: 'Optional accessibility alt text sent to Pinterest (max 500 characters)',
			},
			{
				displayName: 'Related Terms',
				name: 'relatedTerms',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['pins'],
						operation: ['publish'],
					},
				},
				default: '',
				description: 'Optional comma-separated related terms for Pinterest',
			},
			{
				displayName: 'Dominant Color',
				name: 'dominantColor',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['pins'],
						operation: ['publish'],
					},
				},
				default: '',
				description: 'Optional dominant media color in hex format (for example #6E7874)',
			},
			{
				displayName: 'Video Cover Source',
				name: 'coverImageSource',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['pins', 'schedules'],
						operation: ['publish', 'create'],
					},
				},
				options: [
					{
						name: 'None (API Default)',
						value: 'none',
					},
					{
						name: 'Public Image URL',
						value: 'url',
					},
					{
						name: 'Uploaded Asset',
						value: 'asset',
					},
				],
				default: 'none',
				description:
					'Optional cover for video pins: leave empty to let Pinterest use keyframe/default behavior',
			},
			{
				displayName: 'Cover Image URL',
				name: 'coverImageUrl',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['pins', 'schedules'],
						operation: ['publish', 'create'],
						coverImageSource: ['url'],
					},
				},
				default: '',
				required: true,
				description: 'Public URL for a video cover image (max 2048 characters)',
			},
			{
				displayName: 'Cover Image Asset ID',
				name: 'coverImageAssetId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['pins', 'schedules'],
						operation: ['publish', 'create'],
						coverImageSource: ['asset'],
					},
				},
				default: '={{$json["id"]}}',
				required: true,
				description: 'PinBridge uploaded image asset ID used as a video cover image',
			},
			{
				displayName: 'Image URL',
				name: 'imageUrl',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['pins', 'schedules'],
						operation: ['publish', 'create'],
						imageSource: ['url'],
					},
				},
				default: '',
				required: true,
				description: 'Public image URL accepted by the PinBridge API',
			},
			{
				displayName: 'Asset ID',
				name: 'assetId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['pins', 'schedules'],
						operation: ['publish', 'create'],
						imageSource: ['asset'],
					},
				},
				default: '={{$json["id"]}}',
				required: true,
				description: 'PinBridge asset ID returned by the Upload Image or Upload Video operation',
			},
			{
				displayName: 'Asset ID',
				name: 'assetLookupId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['assets'],
						operation: ['get'],
					},
				},
				default: '={{$json["id"]}}',
				required: true,
				description: 'PinBridge asset ID returned by the Upload Image or Upload Video operation',
			},
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['assets', 'pins'],
						operation: ['uploadImage', 'uploadVideo', 'importCsv'],
					},
				},
				default: 'data',
				required: true,
				description: 'Name of the incoming binary property to upload',
			},
			{
				displayName: 'Run At',
				name: 'runAt',
				type: 'dateTime',
				displayOptions: {
					show: {
						resource: ['schedules'],
						operation: ['create'],
					},
				},
				default: '',
				required: true,
				description: 'When the pin should be published (ISO 8601 timestamp)',
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['pins'],
						operation: ['publish'],
					},
				},
				default: '={{$execution.id + "-" + $itemIndex}}',
				required: true,
				description: 'Deduplication key sent to PinBridge as idempotency_key',
			},
			{
				displayName: 'Pin ID',
				name: 'pinId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['pins'],
						operation: ['get', 'getStatus', 'delete'],
					},
				},
				default: '={{$json["id"]}}',
				required: true,
				description: 'Pin ID returned by PinBridge. The same UUID is used for Get Status.',
			},
			{
				displayName: 'Import Job ID',
				name: 'importJobId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['pins'],
						operation: ['getImport'],
					},
				},
				default: '={{$json["id"]}}',
				required: true,
				description: 'Bulk import job ID returned by an Import JSON or Import CSV operation',
			},
			{
				displayName: 'Schedule ID',
				name: 'scheduleId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['schedules'],
						operation: ['get', 'cancel'],
					},
				},
				default: '={{$json["id"]}}',
				required: true,
				description: 'Schedule ID returned by PinBridge',
			},
			{
				displayName: 'Board Name',
				name: 'boardName',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['boards'],
						operation: ['create'],
					},
				},
				default: '',
				required: true,
				description: 'Name of the board to create',
			},
			{
				displayName: 'Board Description',
				name: 'boardDescription',
				type: 'string',
				typeOptions: {
					rows: 3,
				},
				displayOptions: {
					show: {
						resource: ['boards'],
						operation: ['create'],
					},
				},
				default: '',
				description: 'Optional description for the board',
			},
			{
				displayName: 'Board Privacy',
				name: 'boardPrivacy',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['boards'],
						operation: ['create'],
					},
				},
				options: [
					{
						name: 'Default',
						value: '',
					},
					{
						name: 'Public',
						value: 'PUBLIC',
					},
					{
						name: 'Protected',
						value: 'PROTECTED',
					},
					{
						name: 'Secret',
						value: 'SECRET',
					},
				],
				default: '',
				description: 'Optional Pinterest board privacy value',
			},
			{
				displayName: 'Webhook ID',
				name: 'webhookId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['webhooks'],
						operation: ['get', 'update', 'delete'],
					},
				},
				default: '={{$json["id"]}}',
				required: true,
				description: 'Webhook ID returned by PinBridge',
			},
			{
				displayName: 'Webhook URL',
				name: 'webhookUrl',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['webhooks'],
						operation: ['create'],
					},
				},
				default: '',
				required: true,
				description: 'Webhook endpoint URL',
			},
			{
				displayName: 'Webhook Secret',
				name: 'webhookSecret',
				type: 'string',
				typeOptions: {
					password: true,
				},
				displayOptions: {
					show: {
						resource: ['webhooks'],
						operation: ['create'],
					},
				},
				default: '',
				required: true,
				description: 'Signing secret (minimum 16 characters)',
			},
			{
				displayName: 'Webhook Events',
				name: 'webhookEvents',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['webhooks'],
						operation: ['create'],
					},
				},
				default: 'pin.published,pin.failed',
				description: 'Comma-separated events (for example: pin.published,pin.failed)',
			},
			{
				displayName: 'Enabled',
				name: 'webhookEnabled',
				type: 'boolean',
				displayOptions: {
					show: {
						resource: ['webhooks'],
						operation: ['create'],
					},
				},
				default: true,
				description: 'Whether the webhook is active',
			},
			{
				displayName: 'Webhook URL (Optional)',
				name: 'webhookUrlUpdate',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['webhooks'],
						operation: ['update'],
					},
				},
				default: '',
				description: 'New webhook endpoint URL',
			},
			{
				displayName: 'Webhook Secret (Optional)',
				name: 'webhookSecretUpdate',
				type: 'string',
				typeOptions: {
					password: true,
				},
				displayOptions: {
					show: {
						resource: ['webhooks'],
						operation: ['update'],
					},
				},
				default: '',
				description: 'New signing secret (minimum 16 characters)',
			},
			{
				displayName: 'Webhook Events (Optional)',
				name: 'webhookEventsUpdate',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['webhooks'],
						operation: ['update'],
					},
				},
				default: '',
				description: 'New comma-separated event list',
			},
			{
				displayName: 'Enabled (Optional)',
				name: 'webhookEnabledUpdate',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['webhooks'],
						operation: ['update'],
					},
				},
				options: [
					{
						name: 'Unchanged',
						value: '',
					},
					{
						name: 'Enabled',
						value: 'true',
					},
					{
						name: 'Disabled',
						value: 'false',
					},
				],
				default: '',
				description: 'Optionally update enabled status',
			},
		],
	};

	methods = {
		loadOptions: {
			async getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const accounts = await pinBridgeApiRequest.call(this, 'GET', '/v1/pinterest/accounts');
				const typedAccounts = accounts as PinBridgeAccount[];

				return typedAccounts
					.map((account) => ({
						name: normalizeAccountName(account),
						value: account.id,
						description: account.scopes || undefined,
					}))
					.sort((a, b) => a.name.localeCompare(b.name));
			},

			async getBoards(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const accountId = this.getCurrentNodeParameter('accountId') as string | undefined;
				if (!accountId) {
					return [];
				}

				const boards = await pinBridgeApiRequest.call(
					this,
					'GET',
					'/v1/pinterest/boards',
					{ account_id: accountId },
				);
				const typedBoards = boards as PinBridgeBoard[];

				return typedBoards
					.map((board) => ({
						name: board.name,
						value: board.id,
						description: board.privacy || undefined,
					}))
					.sort((a, b) => a.name.localeCompare(b.name));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;
		const returnData: INodeExecutionData[] = [];

		if (resource === 'boards' && operation === 'list') {
			const accountId = this.getNodeParameter('accountId', 0) as string;
			const returnAll = this.getNodeParameter('returnAll', 0) as boolean;
			const limit = this.getNodeParameter('limit', 0, 50) as number;

			const boards = (await pinBridgeApiRequest.call(
				this,
				'GET',
				'/v1/pinterest/boards',
				{ account_id: accountId },
			)) as PinBridgeBoard[];

			const selectedBoards = returnAll ? boards : boards.slice(0, limit);
			for (const board of selectedBoards) {
				returnData.push({
					json: mapBoardJson(board),
					pairedItem: { item: 0 },
				});
			}

			return [returnData];
		}

		if (resource === 'terms' && operation === 'listRelated') {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const accountId = this.getNodeParameter('accountId', itemIndex) as string;
					const termsInput = this.getNodeParameter('termsInput', itemIndex) as string;
					const exactMatch = this.getNodeParameter('exactMatch', itemIndex, false) as boolean;

					const response = (await pinBridgeApiRequest.call(
						this,
						'GET',
						'/v1/pinterest/terms/related',
						{
							account_id: accountId,
							terms: termsInput,
							exact_match: exactMatch,
						},
					)) as PinBridgeRelatedTermsResponse;

					for (const group of response.related_terms_list) {
						returnData.push({
							json: mapRelatedTermsJson(response, group),
							pairedItem: { item: itemIndex },
						});
					}
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		}

		if (resource === 'connections' && operation === 'list') {
			const returnAll = this.getNodeParameter('returnAll', 0) as boolean;
			const limit = this.getNodeParameter('limit', 0, 50) as number;
			const accounts = (await pinBridgeApiRequest.call(
				this,
				'GET',
				'/v1/pinterest/accounts',
			)) as PinBridgeAccount[];

			const selectedAccounts = returnAll ? accounts : accounts.slice(0, limit);
			for (const account of selectedAccounts) {
				returnData.push({
					json: mapConnectionJson(account),
					pairedItem: { item: 0 },
				});
			}

			return [returnData];
		}

		if (resource === 'connections' && operation === 'startOAuth') {
			const oauthStart = (await pinBridgeApiRequest.call(
				this,
				'GET',
				'/v1/pinterest/oauth/start',
			)) as PinBridgeOAuthStartResponse;

			return [[{
				json: { authorizationUrl: oauthStart.authorization_url, raw: oauthStart },
				pairedItem: { item: 0 },
			}]];
		}

		if (resource === 'connections' && operation === 'completeOAuth') {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const oauthCode = this.getNodeParameter('oauthCode', itemIndex) as string;
					const oauthState = this.getNodeParameter('oauthState', itemIndex) as string;

					const callback = (await pinBridgeApiRequest.call(
						this,
						'GET',
						'/v1/pinterest/oauth/callback',
						{ code: oauthCode, state: oauthState },
					)) as PinBridgeOAuthCallbackResponse;

					returnData.push({
						json: {
							status: callback.status,
							message: callback.message,
							accountId: callback.account_id ?? null,
							raw: callback as unknown as IDataObject,
						},
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		}

		if (resource === 'connections' && operation === 'revoke') {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const connectionId = this.getNodeParameter('connectionId', itemIndex) as string;
					if (!connectionId) {
						throw new NodeOperationError(this.getNode(), 'Connection ID is required', {
							itemIndex,
						});
					}

					await pinBridgeApiRequest.call(
						this,
						'DELETE',
						`/v1/pinterest/accounts/${encodeURIComponent(connectionId)}`,
					);

					returnData.push({
						json: mapDeleteJson('connection', connectionId),
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		}

		if (resource === 'assets' && (operation === 'uploadImage' || operation === 'uploadVideo')) {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const binaryPropertyName = this.getNodeParameter(
						'binaryPropertyName',
						itemIndex,
					) as string;
					const binaryData = items[itemIndex].binary?.[binaryPropertyName];
					if (!binaryData) {
						throw new NodeOperationError(
							this.getNode(),
							`Binary property '${binaryPropertyName}' is required`,
							{ itemIndex },
						);
					}

					const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryData);
					const formData = new FormData();
					const isVideoUpload = operation === 'uploadVideo';
					const filename =
						binaryData.fileName || (isVideoUpload ? 'pin-video.mp4' : 'pin-image.png');
					const mimeType =
						binaryData.mimeType || (isVideoUpload ? 'video/mp4' : 'image/png');
					formData.append('file', new Blob([buffer], { type: mimeType }), filename);
					const assetPath = isVideoUpload ? '/v1/assets/videos' : '/v1/assets/images';

					const asset = (await pinBridgeMultipartRequest.call(
						this,
						'POST',
						assetPath,
						formData,
					)) as PinBridgeAsset;

					returnData.push({
						json: mapAssetJson(asset),
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		}

		if (resource === 'assets' && operation === 'get') {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const assetLookupId = this.getNodeParameter('assetLookupId', itemIndex) as string;
					if (!assetLookupId) {
						throw new NodeOperationError(this.getNode(), 'Asset ID is required', {
							itemIndex,
						});
					}

					const asset = (await pinBridgeApiRequest.call(
						this,
						'GET',
						`/v1/assets/${encodeURIComponent(assetLookupId)}`,
					)) as PinBridgeAsset;

					returnData.push({
						json: mapAssetJson(asset),
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		}

		if (resource === 'pins' && operation === 'list') {
			const returnAll = this.getNodeParameter('returnAll', 0) as boolean;
			const limit = this.getNodeParameter('limit', 0, 50) as number;
			const pins = await fetchPaginatedCollection<PinBridgePinRecord>(
				this,
				'/v1/pins',
				limit,
				returnAll,
			);

			for (const pin of pins) {
				returnData.push({
					json: mapPinJson(pin),
					pairedItem: { item: 0 },
				});
			}

			return [returnData];
		}

		if (resource === 'pins' && operation === 'listImports') {
			const returnAll = this.getNodeParameter('returnAll', 0) as boolean;
			const limit = this.getNodeParameter('limit', 0, 50) as number;
			const importStatus = this.getNodeParameter('importStatus', 0, '') as string;
			const importSourceType = this.getNodeParameter('importSourceType', 0, '') as string;
			const query: IDataObject = {};
			if (importStatus) {
				query.status = importStatus;
			}
			if (importSourceType) {
				query.source_type = importSourceType;
			}
			const imports = await fetchPaginatedCollection<PinBridgeImportJob>(
				this,
				'/v1/pins/imports',
				limit,
				returnAll,
				query,
			);

			for (const importJob of imports) {
				returnData.push({
					json: mapImportJobJson(importJob),
					pairedItem: { item: 0 },
				});
			}

			return [returnData];
		}

		if (resource === 'schedules' && operation === 'list') {
			const returnAll = this.getNodeParameter('returnAll', 0) as boolean;
			const limit = this.getNodeParameter('limit', 0, 50) as number;
			const schedules = await fetchPaginatedCollection<PinBridgeSchedule>(
				this,
				'/v1/schedules',
				limit,
				returnAll,
			);

			for (const schedule of schedules) {
				returnData.push({
					json: mapScheduleJson(schedule),
					pairedItem: { item: 0 },
				});
			}

			return [returnData];
		}

		if (resource === 'pins' && operation === 'importJson') {
			try {
				const rows = items.map((item) => item.json as IDataObject);
				for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
					const runAt = rows[rowIndex].run_at;
					if (typeof runAt === 'string' && runAt && !hasExplicitTimezoneOffset(runAt)) {
						throw new NodeOperationError(
							this.getNode(),
							`Import row ${rowIndex + 1} has run_at without timezone offset`,
						);
					}
				}
				const importJob = (await pinBridgeApiRequest.call(
					this,
					'POST',
					'/v1/pins/imports/json',
					undefined,
					rows,
				)) as PinBridgeImportJob;

				return [[{
					json: mapImportJobJson(importJob),
					pairedItem: { item: 0 },
				}]];
			} catch (error) {
				if (this.continueOnFail()) {
					return [[{
						json: { error: (error as Error).message },
						pairedItem: { item: 0 },
					}]];
				}
				throw error;
			}
		}

		if (resource === 'pins' && operation === 'importCsv') {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const binaryPropertyName = this.getNodeParameter(
						'binaryPropertyName',
						itemIndex,
					) as string;
					const binaryData = items[itemIndex].binary?.[binaryPropertyName];
					if (!binaryData) {
						throw new NodeOperationError(
							this.getNode(),
							`Binary property '${binaryPropertyName}' is required`,
							{ itemIndex },
						);
					}

					const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryData);
					const formData = new FormData();
					formData.append('file', new Blob([buffer], { type: binaryData.mimeType || 'text/csv' }), binaryData.fileName || 'pin-import.csv');

					const importJob = (await pinBridgeMultipartRequest.call(
						this,
						'POST',
						'/v1/pins/imports/csv',
						formData,
					)) as PinBridgeImportJob;

					returnData.push({
						json: mapImportJobJson(importJob),
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		}

		if (resource === 'pins' && operation === 'publish') {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const accountId = this.getNodeParameter('accountId', itemIndex) as string;
					const boardId = this.getNodeParameter('boardId', itemIndex) as string;
					const title = this.getNodeParameter('title', itemIndex) as string;
					const description = this.getNodeParameter('description', itemIndex, '') as string;
					const linkUrl = this.getNodeParameter('linkUrl', itemIndex, '') as string;
					const altText = this.getNodeParameter('altText', itemIndex, '') as string;
					const relatedTerms = this.getNodeParameter('relatedTerms', itemIndex, '') as string;
					const dominantColor = this.getNodeParameter('dominantColor', itemIndex, '') as string;
					const imageSource = this.getNodeParameter('imageSource', itemIndex) as string;
					const coverImageSource = this.getNodeParameter(
						'coverImageSource',
						itemIndex,
						'none',
					) as string;
					const idempotencyKey = this.getNodeParameter('idempotencyKey', itemIndex) as string;

					const body: IDataObject = {
						account_id: accountId,
						board_id: boardId,
						title,
						idempotency_key: idempotencyKey,
					};
					if (imageSource === 'asset') {
						body.asset_id = this.getNodeParameter('assetId', itemIndex) as string;
					} else {
						body.image_url = this.getNodeParameter('imageUrl', itemIndex) as string;
					}

					if (description) {
						body.description = description;
					}
					if (linkUrl) {
						body.link_url = linkUrl;
					}
					if (altText) {
						body.alt_text = altText;
					}
					if (relatedTerms) {
						body.related_terms = relatedTerms;
					}
					if (dominantColor) {
						body.dominant_color = dominantColor;
					}
					if (coverImageSource === 'url') {
						body.cover_image_url = this.getNodeParameter('coverImageUrl', itemIndex) as string;
					}
					if (coverImageSource === 'asset') {
						body.cover_image_asset_id = this.getNodeParameter(
							'coverImageAssetId',
							itemIndex,
						) as string;
					}

					const pin = (await pinBridgeApiRequest.call(
						this,
						'POST',
						'/v1/pins',
						undefined,
						body,
					)) as PinBridgePinRecord;

					returnData.push({
						json: mapPinJson(pin),
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		}

		if (resource === 'pins' && operation === 'get') {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const pinId = this.getNodeParameter('pinId', itemIndex) as string;
					if (!pinId) {
						throw new NodeOperationError(this.getNode(), 'Pin ID is required', {
							itemIndex,
						});
					}

					const pin = (await pinBridgeApiRequest.call(
						this,
						'GET',
						`/v1/pins/${encodeURIComponent(pinId)}`,
					)) as PinBridgePinRecord;

					returnData.push({
						json: mapPinJson(pin),
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		}

		if (resource === 'pins' && operation === 'getImport') {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const importJobId = this.getNodeParameter('importJobId', itemIndex) as string;
					if (!importJobId) {
						throw new NodeOperationError(this.getNode(), 'Import Job ID is required', {
							itemIndex,
						});
					}

					const importJob = (await pinBridgeApiRequest.call(
						this,
						'GET',
						`/v1/pins/imports/${encodeURIComponent(importJobId)}`,
					)) as PinBridgeImportJob;

					returnData.push({
						json: mapImportJobJson(importJob),
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		}

		if (resource === 'pins' && operation === 'getStatus') {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const pinId = this.getNodeParameter('pinId', itemIndex) as string;
					if (!pinId) {
						throw new NodeOperationError(this.getNode(), 'Pin ID is required', {
							itemIndex,
						});
					}

					const statusResponse = (await pinBridgeApiRequest.call(
						this,
						'GET',
						`/v1/jobs/${encodeURIComponent(pinId)}`,
					)) as PinBridgeJobStatus;

					returnData.push({
						json: mapJobStatusJson(statusResponse),
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		}

		if (resource === 'pins' && operation === 'delete') {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const pinId = this.getNodeParameter('pinId', itemIndex) as string;
					if (!pinId) {
						throw new NodeOperationError(this.getNode(), 'Pin ID is required', {
							itemIndex,
						});
					}

					await pinBridgeApiRequest.call(
						this,
						'DELETE',
						`/v1/pins/${encodeURIComponent(pinId)}`,
					);

					returnData.push({
						json: mapDeleteJson('pin', pinId),
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		}

		if (resource === 'schedules' && operation === 'create') {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const accountId = this.getNodeParameter('accountId', itemIndex) as string;
					const boardId = this.getNodeParameter('boardId', itemIndex) as string;
					const runAt = String(this.getNodeParameter('runAt', itemIndex));
					if (!hasExplicitTimezoneOffset(runAt)) {
						throw new NodeOperationError(
							this.getNode(),
							'Run At must include a timezone offset (for example 2026-03-06T10:00:00Z)',
							{ itemIndex },
						);
					}
					const title = this.getNodeParameter('title', itemIndex) as string;
					const description = this.getNodeParameter('description', itemIndex, '') as string;
					const linkUrl = this.getNodeParameter('linkUrl', itemIndex, '') as string;
					const imageSource = this.getNodeParameter('imageSource', itemIndex) as string;
					const coverImageSource = this.getNodeParameter(
						'coverImageSource',
						itemIndex,
						'none',
					) as string;

					const body: IDataObject = {
						account_id: accountId,
						run_at: runAt,
						board_id: boardId,
						title,
					};
					if (imageSource === 'asset') {
						body.asset_id = this.getNodeParameter('assetId', itemIndex) as string;
					} else {
						body.image_url = this.getNodeParameter('imageUrl', itemIndex) as string;
					}

					if (description) {
						body.description = description;
					}
					if (linkUrl) {
						body.link_url = linkUrl;
					}
					if (coverImageSource === 'url') {
						body.cover_image_url = this.getNodeParameter('coverImageUrl', itemIndex) as string;
					}
					if (coverImageSource === 'asset') {
						body.cover_image_asset_id = this.getNodeParameter(
							'coverImageAssetId',
							itemIndex,
						) as string;
					}

					const schedule = (await pinBridgeApiRequest.call(
						this,
						'POST',
						'/v1/schedules',
						undefined,
						body,
					)) as PinBridgeSchedule;

					returnData.push({
						json: mapScheduleJson(schedule),
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		}

		if (resource === 'schedules' && operation === 'get') {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const scheduleId = this.getNodeParameter('scheduleId', itemIndex) as string;
					if (!scheduleId) {
						throw new NodeOperationError(this.getNode(), 'Schedule ID is required', {
							itemIndex,
						});
					}

					const schedule = (await pinBridgeApiRequest.call(
						this,
						'GET',
						`/v1/schedules/${encodeURIComponent(scheduleId)}`,
					)) as PinBridgeSchedule;

					returnData.push({
						json: mapScheduleJson(schedule),
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		}

		if (resource === 'schedules' && operation === 'cancel') {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const scheduleId = this.getNodeParameter('scheduleId', itemIndex) as string;
					if (!scheduleId) {
						throw new NodeOperationError(this.getNode(), 'Schedule ID is required', {
							itemIndex,
						});
					}

					const schedule = (await pinBridgeApiRequest.call(
						this,
						'POST',
						`/v1/schedules/${encodeURIComponent(scheduleId)}/cancel`,
					)) as PinBridgeSchedule;

					returnData.push({
						json: mapScheduleJson(schedule),
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		}

		if (resource === 'boards' && operation === 'create') {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const accountId = this.getNodeParameter('accountId', itemIndex) as string;
					const boardName = this.getNodeParameter('boardName', itemIndex) as string;
					const boardDescription = this.getNodeParameter(
						'boardDescription',
						itemIndex,
						'',
					) as string;
					const boardPrivacy = this.getNodeParameter('boardPrivacy', itemIndex, '') as string;

					const body: IDataObject = {
						account_id: accountId,
						name: boardName,
					};

					if (boardDescription) {
						body.description = boardDescription;
					}
					if (boardPrivacy) {
						body.privacy = boardPrivacy;
					}

					const board = (await pinBridgeApiRequest.call(
						this,
						'POST',
						'/v1/pinterest/boards',
						undefined,
						body,
					)) as PinBridgeBoard;

					returnData.push({
						json: mapBoardJson(board),
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		}

		if (resource === 'boards' && operation === 'delete') {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const accountId = this.getNodeParameter('accountId', itemIndex) as string;
					const boardId = this.getNodeParameter('boardId', itemIndex) as string;

					await pinBridgeApiRequest.call(
						this,
						'DELETE',
						`/v1/pinterest/boards/${encodeURIComponent(boardId)}`,
						{ account_id: accountId },
					);

					returnData.push({
						json: mapDeleteJson('board', boardId),
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		}

		if (resource === 'webhooks' && operation === 'list') {
			const returnAll = this.getNodeParameter('returnAll', 0) as boolean;
			const limit = this.getNodeParameter('limit', 0, 50) as number;
			const webhooks = (await pinBridgeApiRequest.call(
				this,
				'GET',
				'/v1/webhooks',
			)) as PinBridgeWebhook[];

			const selectedWebhooks = returnAll ? webhooks : webhooks.slice(0, limit);
			for (const webhook of selectedWebhooks) {
				returnData.push({
					json: mapWebhookJson(webhook),
					pairedItem: { item: 0 },
				});
			}

			return [returnData];
		}

		if (resource === 'webhooks' && operation === 'create') {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const webhookUrl = this.getNodeParameter('webhookUrl', itemIndex) as string;
					const webhookSecret = this.getNodeParameter('webhookSecret', itemIndex) as string;
					const webhookEvents = this.getNodeParameter('webhookEvents', itemIndex, '') as string;
					const webhookEnabled = this.getNodeParameter('webhookEnabled', itemIndex, true) as boolean;

					const body: IDataObject = {
						url: webhookUrl,
						secret: webhookSecret,
						is_enabled: webhookEnabled,
					};
					const parsedEvents = parseCsvList(webhookEvents);
					if (parsedEvents.length > 0) {
						body.events = parsedEvents;
					}

					const webhook = (await pinBridgeApiRequest.call(
						this,
						'POST',
						'/v1/webhooks',
						undefined,
						body,
					)) as PinBridgeWebhook;

					returnData.push({
						json: mapWebhookJson(webhook),
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		}

		if (resource === 'webhooks' && operation === 'get') {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const webhookId = this.getNodeParameter('webhookId', itemIndex) as string;
					if (!webhookId) {
						throw new NodeOperationError(this.getNode(), 'Webhook ID is required', {
							itemIndex,
						});
					}

					const webhook = (await pinBridgeApiRequest.call(
						this,
						'GET',
						`/v1/webhooks/${encodeURIComponent(webhookId)}`,
					)) as PinBridgeWebhook;

					returnData.push({
						json: mapWebhookJson(webhook),
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		}

		if (resource === 'webhooks' && operation === 'update') {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const webhookId = this.getNodeParameter('webhookId', itemIndex) as string;
					if (!webhookId) {
						throw new NodeOperationError(this.getNode(), 'Webhook ID is required', {
							itemIndex,
						});
					}

					const webhookUrlUpdate = this.getNodeParameter(
						'webhookUrlUpdate',
						itemIndex,
						'',
					) as string;
					const webhookSecretUpdate = this.getNodeParameter(
						'webhookSecretUpdate',
						itemIndex,
						'',
					) as string;
					const webhookEventsUpdate = this.getNodeParameter(
						'webhookEventsUpdate',
						itemIndex,
						'',
					) as string;
					const webhookEnabledUpdate = this.getNodeParameter(
						'webhookEnabledUpdate',
						itemIndex,
						'',
					) as string;

					const body: IDataObject = {};
					if (webhookUrlUpdate) {
						body.url = webhookUrlUpdate;
					}
					if (webhookSecretUpdate) {
						body.secret = webhookSecretUpdate;
					}
					if (webhookEventsUpdate) {
						body.events = parseCsvList(webhookEventsUpdate);
					}
					if (webhookEnabledUpdate === 'true') {
						body.is_enabled = true;
					} else if (webhookEnabledUpdate === 'false') {
						body.is_enabled = false;
					}

					const webhook = (await pinBridgeApiRequest.call(
						this,
						'PATCH',
						`/v1/webhooks/${encodeURIComponent(webhookId)}`,
						undefined,
						body,
					)) as PinBridgeWebhook;

					returnData.push({
						json: mapWebhookJson(webhook),
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		}

		if (resource === 'webhooks' && operation === 'delete') {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const webhookId = this.getNodeParameter('webhookId', itemIndex) as string;
					if (!webhookId) {
						throw new NodeOperationError(this.getNode(), 'Webhook ID is required', {
							itemIndex,
						});
					}

					await pinBridgeApiRequest.call(
						this,
						'DELETE',
						`/v1/webhooks/${encodeURIComponent(webhookId)}`,
					);

					returnData.push({
						json: mapDeleteJson('webhook', webhookId),
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		}

		if (resource === 'rateMeter' && operation === 'get') {
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				try {
					const accountId = this.getNodeParameter('accountId', itemIndex) as string;

					const rateMeter = (await pinBridgeApiRequest.call(
						this,
						'GET',
						'/v1/rate-meter',
						{ account_id: accountId },
					)) as PinBridgeRateMeter;

					returnData.push({
						json: mapRateMeterJson(rateMeter),
						pairedItem: { item: itemIndex },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error;
				}
			}

			return [returnData];
		}

		throw new NodeOperationError(this.getNode(), `Unsupported operation: ${resource}.${operation}`);
	}
}
