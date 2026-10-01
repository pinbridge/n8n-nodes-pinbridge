import type { INodeProperties } from 'n8n-workflow';

import type {
	PinBridgeAccount,
	PinBridgeOAuthCallbackResponse,
	PinBridgeOAuthStartResponse,
} from '../ApiTypes';
import type { ResourceOperations } from '../GenericFunctions';
import { getListLimits, getRequiredId, once, perItem, pinBridgeApiRequest } from '../GenericFunctions';
import { mapConnectionJson, mapDeleteJson } from '../Mappers';
import { returnAllAndLimitFields } from '../SharedFields';

const show = (operation: string[]) => ({ resource: ['connections'], operation });

export const connectionProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['connections'] } },
		options: [
			{
				name: 'Complete OAuth Callback',
				value: 'completeOAuth',
				action: 'Complete the pinterest authorization callback',
			},
			{
				name: 'List',
				value: 'list',
				action: 'List connected pinterest accounts',
			},
			{
				name: 'Revoke',
				value: 'revoke',
				action: 'Revoke a connected pinterest account',
			},
			{
				name: 'Start OAuth',
				value: 'startOAuth',
				action: 'Start the pinterest authorization flow',
			},
		],
		default: 'list',
	},
	{
		displayName: 'Connection Name or ID',
		name: 'connectionId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getAccounts',
		},
		displayOptions: { show: show(['revoke']) },
		default: '',
		required: true,
		description:
			'Connected Pinterest account to revoke. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'OAuth Code',
		name: 'oauthCode',
		type: 'string',
		displayOptions: { show: show(['completeOAuth']) },
		default: '',
		required: true,
		description: 'Pinterest OAuth callback code',
	},
	{
		displayName: 'OAuth State',
		name: 'oauthState',
		type: 'string',
		displayOptions: { show: show(['completeOAuth']) },
		default: '',
		required: true,
		description: 'Signed OAuth state returned by Start OAuth',
	},
	...returnAllAndLimitFields(show(['list'])),
];

export const connectionOperations: ResourceOperations = {
	list: once(async function (itemIndex) {
		const { returnAll, limit } = getListLimits.call(this, itemIndex);
		const accounts = (await pinBridgeApiRequest.call(
			this,
			'GET',
			'/v1/pinterest/accounts',
		)) as PinBridgeAccount[];
		return (returnAll ? accounts : accounts.slice(0, limit)).map(mapConnectionJson);
	}),

	startOAuth: once(async function () {
		const oauthStart = (await pinBridgeApiRequest.call(
			this,
			'GET',
			'/v1/pinterest/oauth/start',
		)) as PinBridgeOAuthStartResponse;
		return { authorizationUrl: oauthStart.authorization_url, raw: oauthStart };
	}),

	completeOAuth: perItem(async function (itemIndex) {
		const callback = (await pinBridgeApiRequest.call(this, 'GET', '/v1/pinterest/oauth/callback', {
			code: this.getNodeParameter('oauthCode', itemIndex) as string,
			state: this.getNodeParameter('oauthState', itemIndex) as string,
		})) as PinBridgeOAuthCallbackResponse;
		return {
			status: callback.status,
			message: callback.message,
			accountId: callback.account_id ?? null,
			raw: callback,
		};
	}),

	revoke: perItem(async function (itemIndex) {
		const connectionId = getRequiredId.call(this, 'connectionId', 'Connection ID', itemIndex);
		await pinBridgeApiRequest.call(
			this,
			'DELETE',
			`/v1/pinterest/accounts/${encodeURIComponent(connectionId)}`,
		);
		return mapDeleteJson('connection', connectionId);
	}),
};
