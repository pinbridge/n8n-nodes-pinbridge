import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes as NodeConnectionType, NodeOperationError } from 'n8n-workflow';

import type { PinBridgeAccount, PinBridgeBoard } from './ApiTypes';
import type { ResourceOperations } from './GenericFunctions';
import { errorItemJson, pinBridgeApiRequest, toNodeError } from './GenericFunctions';
import { normalizeAccountName } from './Mappers';
import { activityLogOperations, activityLogProperties } from './resources/ActivityLogResource';
import { analyticsOperations, analyticsProperties } from './resources/AnalyticsResource';
import { assetOperations, assetProperties } from './resources/AssetResource';
import { boardOperations, boardProperties } from './resources/BoardResource';
import { connectionOperations, connectionProperties } from './resources/ConnectionResource';
import { pinOperations, pinProperties } from './resources/PinResource';
import { rateMeterOperations, rateMeterProperties } from './resources/RateMeterResource';
import { scheduleOperations, scheduleProperties } from './resources/ScheduleResource';
import { termOperations, termProperties } from './resources/TermResource';
import { webhookOperations, webhookProperties } from './resources/WebhookResource';

export const operationsByResource: Record<string, ResourceOperations> = {
	activityLogs: activityLogOperations,
	analytics: analyticsOperations,
	assets: assetOperations,
	boards: boardOperations,
	connections: connectionOperations,
	pins: pinOperations,
	rateMeter: rateMeterOperations,
	schedules: scheduleOperations,
	terms: termOperations,
	webhooks: webhookOperations,
};

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
		usableAsTool: true,
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
						name: 'Activity Log',
						value: 'activityLogs',
					},
					{
						name: 'Analytics',
						value: 'analytics',
					},
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
						name: 'Term',
						value: 'terms',
					},
					{
						name: 'Webhook',
						value: 'webhooks',
					},
				],
				default: 'pins',
			},
			...activityLogProperties,
			...analyticsProperties,
			...assetProperties,
			...boardProperties,
			...connectionProperties,
			...pinProperties,
			...rateMeterProperties,
			...scheduleProperties,
			...termProperties,
			...webhookProperties,
		],
	};

	methods = {
		loadOptions: {
			async getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const accounts = (await pinBridgeApiRequest.call(
					this,
					'GET',
					'/v1/pinterest/accounts',
				)) as PinBridgeAccount[];

				return accounts
					.map((account) => ({
						name: normalizeAccountName(account),
						value: account.id,
						description: account.reconnect_required
							? 'Reconnect required in PinBridge'
							: account.scopes || undefined,
					}))
					.sort((a, b) => a.name.localeCompare(b.name));
			},

			async getBoards(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const accountId = this.getCurrentNodeParameter('accountId') as string | undefined;
				if (!accountId) {
					return [];
				}

				const boards = (await pinBridgeApiRequest.call(this, 'GET', '/v1/pinterest/boards', {
					account_id: accountId,
				})) as PinBridgeBoard[];

				return boards
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
		const handler = operationsByResource[resource]?.[operation];
		if (!handler) {
			throw new NodeOperationError(this.getNode(), `Unsupported operation: ${resource}.${operation}`);
		}

		if (handler.mode === 'allItems') {
			try {
				return [await handler.run.call(this, items)];
			} catch (error) {
				if (this.continueOnFail()) {
					return [[{ json: errorItemJson(error, 0), pairedItem: { item: 0 } }]];
				}
				throw toNodeError(this.getNode(), error);
			}
		}

		const returnData: INodeExecutionData[] = [];
		// List-style operations run once with the first item's parameters.
		const runs = handler.mode === 'once' ? 1 : items.length;
		for (let itemIndex = 0; itemIndex < runs; itemIndex++) {
			try {
				const result = await handler.run.call(this, itemIndex);
				for (const json of Array.isArray(result) ? result : [result]) {
					returnData.push({ json, pairedItem: { item: itemIndex } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: errorItemJson(error, itemIndex), pairedItem: { item: itemIndex } });
					continue;
				}
				throw toNodeError(this.getNode(), error, itemIndex);
			}
		}

		return [returnData];
	}
}
