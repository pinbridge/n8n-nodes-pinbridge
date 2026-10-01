import type { IDataObject, INodeProperties } from 'n8n-workflow';

import type { PinBridgeWebhook } from '../ApiTypes';
import type { ResourceOperations } from '../GenericFunctions';
import {
	getListLimits,
	getRequiredId,
	once,
	parseCsvList,
	perItem,
	pinBridgeApiRequest,
} from '../GenericFunctions';
import { mapDeleteJson, mapWebhookJson } from '../Mappers';
import { returnAllAndLimitFields } from '../SharedFields';

const show = (operation: string[]) => ({ resource: ['webhooks'], operation });

export const webhookProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['webhooks'] } },
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
	...returnAllAndLimitFields(show(['list'])),
	{
		displayName: 'Webhook ID',
		name: 'webhookId',
		type: 'string',
		displayOptions: { show: show(['get', 'update', 'delete']) },
		default: '={{$json["id"]}}',
		required: true,
		description: 'Webhook ID returned by PinBridge',
	},
	{
		displayName: 'Webhook URL',
		name: 'webhookUrl',
		type: 'string',
		displayOptions: { show: show(['create']) },
		default: '',
		required: true,
		description: 'Endpoint PinBridge sends the events to',
	},
	{
		displayName: 'Webhook Secret',
		name: 'webhookSecret',
		type: 'string',
		typeOptions: {
			password: true,
		},
		displayOptions: { show: show(['create']) },
		default: '',
		required: true,
		description: 'Signing secret (minimum 16 characters)',
	},
	{
		displayName: 'Webhook Events',
		name: 'webhookEvents',
		type: 'string',
		displayOptions: { show: show(['create']) },
		default: 'pin.published,pin.failed',
		description: 'Comma-separated events. PinBridge sends pin.published and pin.failed.',
	},
	{
		displayName: 'Enabled',
		name: 'webhookEnabled',
		type: 'boolean',
		displayOptions: { show: show(['create']) },
		default: true,
		description: 'Whether the webhook is active',
	},
	{
		displayName: 'Webhook URL (Optional)',
		name: 'webhookUrlUpdate',
		type: 'string',
		displayOptions: { show: show(['update']) },
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
		displayOptions: { show: show(['update']) },
		default: '',
		description: 'New signing secret (minimum 16 characters)',
	},
	{
		displayName: 'Webhook Events (Optional)',
		name: 'webhookEventsUpdate',
		type: 'string',
		displayOptions: { show: show(['update']) },
		default: '',
		description: 'New comma-separated event list',
	},
	{
		displayName: 'Enabled (Optional)',
		name: 'webhookEnabledUpdate',
		type: 'options',
		displayOptions: { show: show(['update']) },
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
];

export const webhookOperations: ResourceOperations = {
	list: once(async function (itemIndex) {
		const { returnAll, limit } = getListLimits.call(this, itemIndex);
		const webhooks = (await pinBridgeApiRequest.call(
			this,
			'GET',
			'/v1/webhooks',
		)) as PinBridgeWebhook[];
		return (returnAll ? webhooks : webhooks.slice(0, limit)).map(mapWebhookJson);
	}),

	create: perItem(async function (itemIndex) {
		const body: IDataObject = {
			url: this.getNodeParameter('webhookUrl', itemIndex) as string,
			secret: this.getNodeParameter('webhookSecret', itemIndex) as string,
			is_enabled: this.getNodeParameter('webhookEnabled', itemIndex, true) as boolean,
		};
		const events = parseCsvList(this.getNodeParameter('webhookEvents', itemIndex, '') as string);
		if (events.length > 0) {
			body.events = events;
		}

		const webhook = (await pinBridgeApiRequest.call(
			this,
			'POST',
			'/v1/webhooks',
			undefined,
			body,
		)) as PinBridgeWebhook;
		return mapWebhookJson(webhook);
	}),

	get: perItem(async function (itemIndex) {
		const webhookId = getRequiredId.call(this, 'webhookId', 'Webhook ID', itemIndex);
		const webhook = (await pinBridgeApiRequest.call(
			this,
			'GET',
			`/v1/webhooks/${encodeURIComponent(webhookId)}`,
		)) as PinBridgeWebhook;
		return mapWebhookJson(webhook);
	}),

	update: perItem(async function (itemIndex) {
		const webhookId = getRequiredId.call(this, 'webhookId', 'Webhook ID', itemIndex);
		const url = this.getNodeParameter('webhookUrlUpdate', itemIndex, '') as string;
		const secret = this.getNodeParameter('webhookSecretUpdate', itemIndex, '') as string;
		const events = this.getNodeParameter('webhookEventsUpdate', itemIndex, '') as string;
		const enabled = this.getNodeParameter('webhookEnabledUpdate', itemIndex, '') as string;

		const body: IDataObject = {};
		if (url) {
			body.url = url;
		}
		if (secret) {
			body.secret = secret;
		}
		if (events) {
			body.events = parseCsvList(events);
		}
		if (enabled === 'true') {
			body.is_enabled = true;
		} else if (enabled === 'false') {
			body.is_enabled = false;
		}

		const webhook = (await pinBridgeApiRequest.call(
			this,
			'PATCH',
			`/v1/webhooks/${encodeURIComponent(webhookId)}`,
			undefined,
			body,
		)) as PinBridgeWebhook;
		return mapWebhookJson(webhook);
	}),

	delete: perItem(async function (itemIndex) {
		const webhookId = getRequiredId.call(this, 'webhookId', 'Webhook ID', itemIndex);
		await pinBridgeApiRequest.call(
			this,
			'DELETE',
			`/v1/webhooks/${encodeURIComponent(webhookId)}`,
		);
		return mapDeleteJson('webhook', webhookId);
	}),
};
