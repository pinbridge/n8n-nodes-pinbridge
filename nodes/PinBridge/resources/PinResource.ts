import type { IDataObject, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type {
	PinBridgeBatchResponse,
	PinBridgeImportJob,
	PinBridgeJobStatus,
	PinBridgePinDeleteResponse,
	PinBridgePinRecord,
	PinBridgeValidationResponse,
} from '../ApiTypes';
import type { ResourceOperations } from '../GenericFunctions';
import {
	allItems,
	errorItemJson,
	getBinaryFormData,
	getListLimits,
	getRequiredId,
	hasExplicitTimezoneOffset,
	once,
	perItem,
	pinBridgeApiRequest,
	pinBridgeApiRequestAllItems,
	pinBridgeMultipartRequest,
	toNodeError,
} from '../GenericFunctions';
import {
	mapBatchResultJson,
	mapImportJobJson,
	mapJobStatusJson,
	mapPinDeleteJson,
	mapPinJson,
	mapValidationJson,
} from '../Mappers';
import {
	accountField,
	boardField,
	buildPinBody,
	pinContentFields,
	returnAllAndLimitFields,
	timestampQueryValue,
} from '../SharedFields';

/** Pins per `POST /v1/pins/batch` call (the API's default PIN_BATCH_MAX_ITEMS). */
const BATCH_SIZE = 100;

const show = (operation: string[]) => ({ resource: ['pins'], operation });
const CREATE_OPERATIONS = ['publish', 'publishBatch', 'validate'];

export const pinProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['pins'] } },
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
			{
				name: 'Publish Batch',
				value: 'publishBatch',
				action: 'Publish many pins in one request',
				description:
					'Send every input item as one batch request (up to 100 pins per call) with a result per item',
			},
			{
				name: 'Retry',
				value: 'retry',
				action: 'Retry a failed pin',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a pin',
				description: 'Edit a pin that is not published yet',
			},
			{
				name: 'Validate',
				value: 'validate',
				action: 'Validate a pin without publishing it',
				description:
					'Dry run: run every publish check (account, media, board access, quota) without creating the pin',
			},
		],
		default: 'publish',
	},
	accountField(show(CREATE_OPERATIONS)),
	boardField(show(CREATE_OPERATIONS)),
	...pinContentFields(show(CREATE_OPERATIONS), { pinOnly: true }),
	{
		displayName: 'Idempotency Key',
		name: 'idempotencyKey',
		type: 'string',
		displayOptions: { show: show(CREATE_OPERATIONS) },
		default: '={{$execution.id + "-" + $itemIndex}}',
		required: true,
		description:
			'Deduplication key sent as idempotency_key. Publishing twice with the same key returns the first pin.',
	},
	{
		displayName: 'Pin ID',
		name: 'pinId',
		type: 'string',
		displayOptions: { show: show(['get', 'getStatus', 'delete', 'update', 'retry']) },
		default: '={{$json["id"]}}',
		required: true,
		description: 'Pin ID returned by PinBridge. The same UUID is used for Get Status.',
	},
	{
		displayName: 'Delete on Pinterest Too',
		name: 'deleteFromPinterest',
		type: 'boolean',
		displayOptions: { show: show(['delete']) },
		default: false,
		description:
			'Whether to also delete the published pin on Pinterest. When off, only the PinBridge record is deleted.',
	},
	{
		displayName:
			'Only pins that are not published yet (queued, deferred or failed) can be edited. To change a published pin, delete it and publish a corrected one.',
		name: 'pinUpdateNotice',
		type: 'notice',
		displayOptions: { show: show(['update']) },
		default: '',
	},
	{
		displayName: 'Update Fields',
		name: 'pinUpdateFields',
		type: 'collection',
		placeholder: 'Add Field',
		displayOptions: { show: show(['update']) },
		default: {},
		options: [
			{
				displayName: 'Alt Text',
				name: 'altText',
				type: 'string',
				default: '',
				description: 'New alt text (max 500 characters). Leave empty to clear it.',
			},
			{
				displayName: 'Board ID',
				name: 'boardId',
				type: 'string',
				default: '',
				description: 'Move the pin to another board of the same connection',
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: {
					rows: 3,
				},
				default: '',
				description: 'New description (max 800 characters). Leave empty to clear it.',
			},
			{
				displayName: 'Link URL',
				name: 'linkUrl',
				type: 'string',
				default: '',
				description: 'New destination URL. Leave empty to clear it.',
			},
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				default: '',
				description: 'New title (max 100 characters)',
			},
		],
	},
	{
		displayName: 'Retry Options',
		name: 'retryOptions',
		type: 'collection',
		placeholder: 'Add Option',
		displayOptions: { show: show(['retry']) },
		default: {},
		options: [
			{
				displayName: 'Board ID',
				name: 'boardId',
				type: 'string',
				default: '',
				description: 'Publish to this board instead of the original one',
			},
			{
				displayName: 'Connection Name or ID',
				name: 'accountId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getAccounts',
				},
				default: '',
				description:
					'Publish with this Pinterest account instead of the original one. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
		],
	},
	{
		displayName: 'Import Job ID',
		name: 'importJobId',
		type: 'string',
		displayOptions: { show: show(['getImport']) },
		default: '={{$json["id"]}}',
		required: true,
		description: 'Bulk import job ID returned by an Import JSON or Import CSV operation',
	},
	{
		displayName: 'Binary Property',
		name: 'binaryPropertyName',
		type: 'string',
		displayOptions: { show: show(['importCsv']) },
		default: 'data',
		required: true,
		description: 'Name of the incoming binary property holding the CSV file',
	},
	...returnAllAndLimitFields(show(['list', 'listImports'])),
	{
		displayName: 'Filters',
		name: 'pinFilters',
		type: 'collection',
		placeholder: 'Add Filter',
		displayOptions: { show: show(['list']) },
		default: {},
		options: [
			{
				displayName: 'Board ID',
				name: 'boardId',
				type: 'string',
				default: '',
				description: 'Only pins targeting this Pinterest board',
			},
			{
				displayName: 'Connection Name or ID',
				name: 'accountId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getAccounts',
				},
				default: '',
				description:
					'Only pins of this Pinterest account. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Created After',
				name: 'since',
				type: 'dateTime',
				default: '',
				description: "Only pins created at or after this time (workflow time zone if it has no offset)",
			},
			{
				displayName: 'Created Before',
				name: 'until',
				type: 'dateTime',
				default: '',
				description: "Only pins created before this time (workflow time zone if it has no offset)",
			},
			{
				displayName: 'Error Code',
				name: 'errorCode',
				type: 'string',
				default: '',
				description: 'Only failed pins with this error code, for example board_access_denied',
			},
			{
				displayName: 'Removed From Pinterest',
				name: 'removed',
				type: 'boolean',
				default: true,
				description:
					'Whether to return only published pins deleted on Pinterest since (on) or to leave them out (off)',
			},
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				default: '',
				description: 'Case-insensitive match on title, description and link URL',
			},
			{
				displayName: 'Sort',
				name: 'sort',
				type: 'options',
				options: [
					{
						name: 'Created (Newest First)',
						value: 'created_at_desc',
					},
					{
						name: 'Created (Oldest First)',
						value: 'created_at_asc',
					},
					{
						name: 'Published (Newest First)',
						value: 'published_at_desc',
					},
					{
						name: 'Published (Oldest First)',
						value: 'published_at_asc',
					},
					{
						name: 'Status (A-Z)',
						value: 'status_asc',
					},
					{
						name: 'Status (Z-A)',
						value: 'status_desc',
					},
					{
						name: 'Title (A-Z)',
						value: 'title_asc',
					},
					{
						name: 'Title (Z-A)',
						value: 'title_desc',
					},
				],
				default: 'created_at_desc',
				description: 'Order of the returned pins',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{
						name: 'Deferred',
						value: 'deferred',
					},
					{
						name: 'Failed',
						value: 'failed',
					},
					{
						name: 'Published',
						value: 'published',
					},
					{
						name: 'Publishing',
						value: 'publishing',
					},
					{
						name: 'Queued',
						value: 'queued',
					},
				],
				default: 'published',
				description: 'Only pins in this status',
			},
		],
	},
	{
		displayName: 'Import Status',
		name: 'importStatus',
		type: 'options',
		displayOptions: { show: show(['listImports']) },
		options: [
			{
				name: 'Any',
				value: '',
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
			{
				name: 'Processing',
				value: 'processing',
			},
			{
				name: 'Queued',
				value: 'queued',
			},
		],
		default: '',
		description: 'Optionally filter import jobs by processing status',
	},
	{
		displayName: 'Import Source',
		name: 'importSourceType',
		type: 'options',
		displayOptions: { show: show(['listImports']) },
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
];

function pinPath(pinId: string, suffix = ''): string {
	return `/v1/pins/${encodeURIComponent(pinId)}${suffix}`;
}

function itemIndexOf(item: INodeExecutionData): number {
	const paired = item.pairedItem;
	return typeof paired === 'object' && !Array.isArray(paired) ? paired.item : 0;
}

export const pinOperations: ResourceOperations = {
	publish: perItem(async function (itemIndex) {
		const pin = (await pinBridgeApiRequest.call(
			this,
			'POST',
			'/v1/pins',
			undefined,
			buildPinBody.call(this, itemIndex),
		)) as PinBridgePinRecord;
		return mapPinJson(pin);
	}),

	validate: perItem(async function (itemIndex) {
		const validation = (await pinBridgeApiRequest.call(
			this,
			'POST',
			'/v1/pins/validate',
			undefined,
			buildPinBody.call(this, itemIndex),
		)) as unknown as PinBridgeValidationResponse;
		return mapValidationJson(validation);
	}),

	publishBatch: allItems(async function (items) {
		const output: INodeExecutionData[] = [];
		const pending: Array<{ itemIndex: number; body: IDataObject }> = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				pending.push({ itemIndex, body: buildPinBody.call(this, itemIndex) });
			} catch (error) {
				if (!this.continueOnFail()) {
					throw toNodeError(this.getNode(), error, itemIndex);
				}
				output.push({ json: errorItemJson(error, itemIndex), pairedItem: { item: itemIndex } });
			}
		}

		for (let start = 0; start < pending.length; start += BATCH_SIZE) {
			const chunk = pending.slice(start, start + BATCH_SIZE);
			try {
				const response = (await pinBridgeApiRequest.call(this, 'POST', '/v1/pins/batch', undefined, {
					pins: chunk.map((entry) => entry.body),
				})) as unknown as PinBridgeBatchResponse;
				for (const result of response.results) {
					const entry = chunk[result.index] ?? chunk[0];
					output.push({ json: mapBatchResultJson(result), pairedItem: { item: entry.itemIndex } });
				}
			} catch (error) {
				if (!this.continueOnFail()) {
					throw toNodeError(this.getNode(), error, chunk[0].itemIndex);
				}
				for (const entry of chunk) {
					output.push({
						json: errorItemJson(error, entry.itemIndex),
						pairedItem: { item: entry.itemIndex },
					});
				}
			}
		}

		return output.sort((a, b) => itemIndexOf(a) - itemIndexOf(b));
	}),

	get: perItem(async function (itemIndex) {
		const pinId = getRequiredId.call(this, 'pinId', 'Pin ID', itemIndex);
		const pin = (await pinBridgeApiRequest.call(this, 'GET', pinPath(pinId))) as PinBridgePinRecord;
		return mapPinJson(pin);
	}),

	getStatus: perItem(async function (itemIndex) {
		const pinId = getRequiredId.call(this, 'pinId', 'Pin ID', itemIndex);
		const status = (await pinBridgeApiRequest.call(
			this,
			'GET',
			`/v1/jobs/${encodeURIComponent(pinId)}`,
		)) as PinBridgeJobStatus;
		return mapJobStatusJson(status);
	}),

	update: perItem(async function (itemIndex) {
		const pinId = getRequiredId.call(this, 'pinId', 'Pin ID', itemIndex);
		const fields = this.getNodeParameter('pinUpdateFields', itemIndex, {}) as IDataObject;
		const body: IDataObject = {};
		if (fields.title) {
			body.title = fields.title;
		}
		if (fields.boardId) {
			body.board_id = fields.boardId;
		}
		// An added-but-empty text field clears the value on the pin.
		for (const [field, apiField] of [
			['description', 'description'],
			['linkUrl', 'link_url'],
			['altText', 'alt_text'],
		]) {
			if (fields[field] !== undefined) {
				body[apiField] = fields[field] === '' ? null : fields[field];
			}
		}
		if (Object.keys(body).length === 0) {
			throw new NodeOperationError(this.getNode(), 'Add at least one pin field to update', {
				itemIndex,
			});
		}

		const pin = (await pinBridgeApiRequest.call(
			this,
			'PATCH',
			pinPath(pinId),
			undefined,
			body,
		)) as PinBridgePinRecord;
		return mapPinJson(pin);
	}),

	retry: perItem(async function (itemIndex) {
		const pinId = getRequiredId.call(this, 'pinId', 'Pin ID', itemIndex);
		const options = this.getNodeParameter('retryOptions', itemIndex, {}) as IDataObject;
		const body: IDataObject = {};
		if (options.boardId) {
			body.board_id = options.boardId;
		}
		if (options.accountId) {
			body.account_id = options.accountId;
		}

		const pin = (await pinBridgeApiRequest.call(
			this,
			'POST',
			pinPath(pinId, '/retry'),
			undefined,
			Object.keys(body).length > 0 ? body : undefined,
		)) as PinBridgePinRecord;
		return mapPinJson(pin);
	}),

	delete: perItem(async function (itemIndex) {
		const pinId = getRequiredId.call(this, 'pinId', 'Pin ID', itemIndex);
		const fromPinterest = this.getNodeParameter('deleteFromPinterest', itemIndex, false) as boolean;
		const response = (await pinBridgeApiRequest.call(this, 'DELETE', pinPath(pinId), {
			delete_from_pinterest: fromPinterest || undefined,
		})) as unknown as PinBridgePinDeleteResponse | undefined;
		return mapPinDeleteJson(pinId, response);
	}),

	list: once(async function (itemIndex) {
		const filters = this.getNodeParameter('pinFilters', itemIndex, {}) as IDataObject;
		const pins = (await pinBridgeApiRequestAllItems.call(
			this,
			'/v1/pins',
			{
				account_id: filters.accountId as string | undefined,
				board_id: filters.boardId as string | undefined,
				status: filters.status as string | undefined,
				error_code: filters.errorCode as string | undefined,
				removed: filters.removed as boolean | undefined,
				q: filters.search as string | undefined,
				sort: filters.sort as string | undefined,
				since: timestampQueryValue.call(this, filters.since),
				until: timestampQueryValue.call(this, filters.until),
			},
			{ ...getListLimits.call(this, itemIndex), maxPageSize: 200 },
		)) as PinBridgePinRecord[];
		return pins.map(mapPinJson);
	}),

	listImports: once(async function (itemIndex) {
		const imports = (await pinBridgeApiRequestAllItems.call(
			this,
			'/v1/pins/imports',
			{
				status: this.getNodeParameter('importStatus', itemIndex, '') as string,
				source_type: this.getNodeParameter('importSourceType', itemIndex, '') as string,
			},
			{ ...getListLimits.call(this, itemIndex), maxPageSize: 200 },
		)) as PinBridgeImportJob[];
		return imports.map(mapImportJobJson);
	}),

	getImport: perItem(async function (itemIndex) {
		const importJobId = getRequiredId.call(this, 'importJobId', 'Import Job ID', itemIndex);
		const importJob = (await pinBridgeApiRequest.call(
			this,
			'GET',
			`/v1/pins/imports/${encodeURIComponent(importJobId)}`,
		)) as PinBridgeImportJob;
		return mapImportJobJson(importJob);
	}),

	importJson: allItems(async function (items) {
		const rows = items.map((item) => item.json);
		rows.forEach((row, rowIndex) => {
			const runAt = row.run_at;
			if (typeof runAt === 'string' && runAt && !hasExplicitTimezoneOffset(runAt)) {
				throw new NodeOperationError(
					this.getNode(),
					`Import row ${rowIndex + 1} has run_at without timezone offset`,
					{ itemIndex: rowIndex },
				);
			}
		});

		const importJob = (await pinBridgeApiRequest.call(
			this,
			'POST',
			'/v1/pins/imports/json',
			undefined,
			rows,
		)) as PinBridgeImportJob;
		return [
			{
				json: mapImportJobJson(importJob),
				pairedItem: items.map((_, itemIndex) => ({ item: itemIndex })),
			},
		];
	}),

	importCsv: perItem(async function (itemIndex) {
		const formData = await getBinaryFormData.call(this, itemIndex, 'pin-import.csv', 'text/csv');
		const importJob = (await pinBridgeMultipartRequest.call(
			this,
			'POST',
			'/v1/pins/imports/csv',
			formData,
		)) as PinBridgeImportJob;
		return mapImportJobJson(importJob);
	}),
};
