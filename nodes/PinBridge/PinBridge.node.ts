import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { pinBridgeApiRequest } from './GenericFunctions';

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

interface PinBridgePinRecord {
	id: string;
	workspace_id: string;
	pinterest_account_id: string;
	status: string;
	title: string;
	description?: string | null;
	link_url?: string | null;
	image_url: string;
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
		image_url?: string;
		[key: string]: unknown;
	};
	last_error?: string | null;
	pin_id?: string | null;
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
		title: pin.title,
		description: pin.description ?? null,
		linkUrl: pin.link_url ?? null,
		imageUrl: pin.image_url,
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
		imageUrl: schedule.payload.image_url ?? null,
		pinId: schedule.pin_id ?? null,
		lastError: schedule.last_error ?? null,
		createdAt: schedule.created_at,
		updatedAt: schedule.updated_at,
		raw: schedule as unknown as IDataObject,
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

async function fetchPaginatedCollection<TRecord>(
	context: IExecuteFunctions,
	path: string,
	limit: number,
	returnAll: boolean,
): Promise<TRecord[]> {
	if (!returnAll) {
		return (await pinBridgeApiRequest.call(context, 'GET', path, {
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
		inputs: ['main'],
		outputs: ['main'],
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
						name: 'Boards',
						value: 'boards',
					},
					{
						name: 'Pins',
						value: 'pins',
					},
					{
						name: 'Schedules',
						value: 'schedules',
					},
					{
						name: 'Connections',
						value: 'connections',
					},
					{
						name: 'Rate Meter',
						value: 'rateMeter',
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
						name: 'Get Status',
						value: 'getStatus',
						action: 'Get a pin job status',
					},
					{
						name: 'List',
						value: 'list',
						action: 'List pins',
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
						name: 'List',
						value: 'list',
						action: 'List connected Pinterest accounts',
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
						resource: ['boards', 'connections', 'pins', 'schedules'],
						operation: ['list'],
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
						resource: ['boards', 'connections', 'pins', 'schedules'],
						operation: ['list'],
						returnAll: [false],
					},
				},
				default: 50,
				description: 'Max number of records to return when Return All is disabled',
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
				description: 'Pin title (max 500 characters)',
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
				description: 'Optional pin description',
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
				description: 'Optional destination URL for the pin',
			},
			{
				displayName: 'Image URL',
				name: 'imageUrl',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['pins', 'schedules'],
						operation: ['publish', 'create'],
					},
				},
				default: '',
				required: true,
				description: 'Public image URL accepted by the PinBridge API',
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
				returnData.push({ json: mapBoardJson(board) });
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
				returnData.push({ json: mapConnectionJson(account) });
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
				returnData.push({ json: mapPinJson(pin) });
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
				returnData.push({ json: mapScheduleJson(schedule) });
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
					const imageUrl = this.getNodeParameter('imageUrl', itemIndex) as string;
					const idempotencyKey = this.getNodeParameter('idempotencyKey', itemIndex) as string;

					const body: IDataObject = {
						account_id: accountId,
						board_id: boardId,
						title,
						image_url: imageUrl,
						idempotency_key: idempotencyKey,
					};

					if (description) {
						body.description = description;
					}
					if (linkUrl) {
						body.link_url = linkUrl;
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
					const title = this.getNodeParameter('title', itemIndex) as string;
					const description = this.getNodeParameter('description', itemIndex, '') as string;
					const linkUrl = this.getNodeParameter('linkUrl', itemIndex, '') as string;
					const imageUrl = this.getNodeParameter('imageUrl', itemIndex) as string;

					const body: IDataObject = {
						account_id: accountId,
						run_at: runAt,
						board_id: boardId,
						title,
						image_url: imageUrl,
					};

					if (description) {
						body.description = description;
					}
					if (linkUrl) {
						body.link_url = linkUrl;
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
