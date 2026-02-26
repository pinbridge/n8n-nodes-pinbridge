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

interface PinBridgePinResponse {
	id: string;
	status: string;
	board_id: string;
	image_url: string;
	link_url?: string;
	pinterest_pin_id?: string;
	[key: string]: unknown;
}

interface PinBridgeJobStatus {
	job_id: string;
	pin_id: string;
	status: string;
	submitted_at: string;
	completed_at?: string;
	pinterest_pin_id?: string;
	error_code?: string;
	error_message?: string;
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

export class PinBridge implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PinBridge',
		name: 'pinBridge',
		icon: 'file:pinbridge.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Publish and track Pinterest pins through the PinBridge API',
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
						name: 'Connections',
						value: 'connections',
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
						name: 'Publish',
						value: 'publish',
						action: 'Publish a pin',
					},
					{
						name: 'Get Status',
						value: 'getStatus',
						action: 'Get a pin status',
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
				displayName: 'Connection',
				name: 'accountId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getAccounts',
				},
				displayOptions: {
					show: {
						resource: ['boards'],
						operation: ['list'],
					},
				},
				default: '',
				required: true,
				description: 'Pinterest connection/account ID from PinBridge',
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				displayOptions: {
					show: {
						resource: ['boards', 'connections'],
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
						resource: ['boards', 'connections'],
						operation: ['list'],
						returnAll: [false],
					},
				},
				default: 50,
				description: 'Max number of records to return when Return All is disabled',
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
				displayName: 'Title',
				name: 'title',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['pins'],
						operation: ['publish'],
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
						resource: ['pins'],
						operation: ['publish'],
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
						resource: ['pins'],
						operation: ['publish'],
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
						resource: ['pins'],
						operation: ['publish'],
					},
				},
				default: '',
				required: true,
				description:
					'Public image URL. PinBridge /v1/pins currently accepts image_url only (no binary upload).',
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
						operation: ['getStatus'],
					},
				},
				default: '={{$json["id"]}}',
				required: true,
				description: 'Pin/Job UUID returned by publish operation',
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
					json: {
						id: board.id,
						name: board.name,
						description: board.description ?? null,
						privacy: board.privacy ?? null,
						raw: board,
					},
				});
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
					json: {
						id: account.id,
						name: normalizeAccountName(account),
						scopes: account.scopes,
						pinterestUserId: account.pinterest_user_id,
						raw: account,
					},
				});
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
					)) as PinBridgePinResponse;

					returnData.push({
						json: {
							id: pin.id,
							status: pin.status,
							pinterestPinId: pin.pinterest_pin_id ?? null,
							boardId: pin.board_id,
							imageUrl: pin.image_url,
							linkUrl: pin.link_url ?? null,
							raw: pin,
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
						json: {
							jobId: statusResponse.job_id,
							pinId: statusResponse.pin_id,
							status: statusResponse.status,
							submittedAt: statusResponse.submitted_at,
							completedAt: statusResponse.completed_at ?? null,
							pinterestPinId: statusResponse.pinterest_pin_id ?? null,
							errorCode: statusResponse.error_code ?? null,
							errorMessage: statusResponse.error_message ?? null,
							raw: statusResponse,
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

		throw new NodeOperationError(this.getNode(), `Unsupported operation: ${resource}.${operation}`);
	}
}
