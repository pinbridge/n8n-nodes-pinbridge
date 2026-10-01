import type { IDataObject, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { PinBridgeBoard, PinBridgeBoardAccess } from '../ApiTypes';
import type { ResourceOperations } from '../GenericFunctions';
import { getListLimits, once, perItem, pinBridgeApiRequest } from '../GenericFunctions';
import { mapBoardAccessJson, mapBoardJson, mapDeleteJson } from '../Mappers';
import { accountField, boardField, returnAllAndLimitFields } from '../SharedFields';

const show = (operation: string[]) => ({ resource: ['boards'], operation });

const privacyOptions = [
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
];

export const boardProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['boards'] } },
		options: [
			{
				name: 'Check Access',
				value: 'checkAccess',
				action: 'Check whether a board can be published to',
				description: 'Preflight: report whether a connection can publish to a board, and why not',
			},
			{
				name: 'Create',
				value: 'create',
				action: 'Create a board',
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a board',
				description: 'Delete a board on Pinterest, together with every pin on it',
			},
			{
				name: 'List',
				value: 'list',
				action: 'List boards',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a board',
				description: 'Rename a board or change its description or privacy on Pinterest',
			},
		],
		default: 'list',
	},
	accountField(show(['list', 'create', 'delete', 'update', 'checkAccess'])),
	boardField(show(['delete', 'update', 'checkAccess'])),
	{
		displayName:
			'Deleting a board deletes it on Pinterest, together with every pin on it. This cannot be undone.',
		name: 'boardDeleteNotice',
		type: 'notice',
		displayOptions: { show: show(['delete']) },
		default: '',
	},
	...returnAllAndLimitFields(show(['list'])),
	{
		displayName: 'Board Name',
		name: 'boardName',
		type: 'string',
		displayOptions: { show: show(['create']) },
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
		displayOptions: { show: show(['create']) },
		default: '',
		description: 'Optional description for the board',
	},
	{
		displayName: 'Board Privacy',
		name: 'boardPrivacy',
		type: 'options',
		displayOptions: { show: show(['create']) },
		options: [
			{
				name: 'Default',
				value: '',
			},
			...privacyOptions,
		],
		default: '',
		description: 'Optional Pinterest board privacy',
	},
	{
		displayName: 'Update Fields',
		name: 'boardUpdateFields',
		type: 'collection',
		placeholder: 'Add Field',
		displayOptions: { show: show(['update']) },
		default: {},
		options: [
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: {
					rows: 3,
				},
				default: '',
				description: 'New board description',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'New board name (max 180 characters)',
			},
			{
				displayName: 'Privacy',
				name: 'privacy',
				type: 'options',
				options: privacyOptions,
				default: 'PUBLIC',
				description:
					'New board privacy. Secret needs the boards:write_secret scope, so reconnect older connections first.',
			},
		],
	},
	{
		displayName: 'Bypass Cache',
		name: 'bypassCache',
		type: 'boolean',
		displayOptions: { show: show(['checkAccess']) },
		default: false,
		description: 'Whether to ask Pinterest again instead of using a recent cached verdict',
	},
];

export const boardOperations: ResourceOperations = {
	list: once(async function (itemIndex) {
		const { returnAll, limit } = getListLimits.call(this, itemIndex);
		const boards = (await pinBridgeApiRequest.call(this, 'GET', '/v1/pinterest/boards', {
			account_id: this.getNodeParameter('accountId', itemIndex) as string,
		})) as PinBridgeBoard[];
		return (returnAll ? boards : boards.slice(0, limit)).map(mapBoardJson);
	}),

	create: perItem(async function (itemIndex) {
		const body: IDataObject = {
			account_id: this.getNodeParameter('accountId', itemIndex) as string,
			name: this.getNodeParameter('boardName', itemIndex) as string,
		};
		const description = this.getNodeParameter('boardDescription', itemIndex, '') as string;
		const privacy = this.getNodeParameter('boardPrivacy', itemIndex, '') as string;
		if (description) {
			body.description = description;
		}
		if (privacy) {
			body.privacy = privacy;
		}

		const board = (await pinBridgeApiRequest.call(
			this,
			'POST',
			'/v1/pinterest/boards',
			undefined,
			body,
		)) as PinBridgeBoard;
		return mapBoardJson(board);
	}),

	update: perItem(async function (itemIndex) {
		const boardId = this.getNodeParameter('boardId', itemIndex) as string;
		const fields = this.getNodeParameter('boardUpdateFields', itemIndex, {}) as IDataObject;
		const body: IDataObject = {
			account_id: this.getNodeParameter('accountId', itemIndex) as string,
		};
		if (fields.name) {
			body.name = fields.name;
		}
		if (fields.description !== undefined) {
			body.description = fields.description;
		}
		if (fields.privacy) {
			body.privacy = fields.privacy;
		}
		if (Object.keys(body).length === 1) {
			throw new NodeOperationError(this.getNode(), 'Add at least one board field to update', {
				itemIndex,
			});
		}

		const board = (await pinBridgeApiRequest.call(
			this,
			'PATCH',
			`/v1/pinterest/boards/${encodeURIComponent(boardId)}`,
			undefined,
			body,
		)) as PinBridgeBoard;
		return mapBoardJson(board);
	}),

	delete: perItem(async function (itemIndex) {
		const boardId = this.getNodeParameter('boardId', itemIndex) as string;
		await pinBridgeApiRequest.call(
			this,
			'DELETE',
			`/v1/pinterest/boards/${encodeURIComponent(boardId)}`,
			{ account_id: this.getNodeParameter('accountId', itemIndex) as string },
		);
		return mapDeleteJson('board', boardId);
	}),

	checkAccess: perItem(async function (itemIndex) {
		const boardId = this.getNodeParameter('boardId', itemIndex) as string;
		const access = (await pinBridgeApiRequest.call(
			this,
			'GET',
			`/v1/pinterest/boards/${encodeURIComponent(boardId)}/access`,
			{
				account_id: this.getNodeParameter('accountId', itemIndex) as string,
				fresh: (this.getNodeParameter('bypassCache', itemIndex, false) as boolean) || undefined,
			},
		)) as unknown as PinBridgeBoardAccess;
		return mapBoardAccessJson(access);
	}),
};
