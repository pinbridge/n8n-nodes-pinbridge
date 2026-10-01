import type { IDataObject, INodeProperties } from 'n8n-workflow';

import type { PinBridgeActivityLog, PinBridgeActivityLogPage } from '../ApiTypes';
import type { ResourceOperations } from '../GenericFunctions';
import { getListLimits, once, pinBridgeApiRequest } from '../GenericFunctions';
import { mapActivityLogJson } from '../Mappers';
import { returnAllAndLimitFields, timestampQueryValue } from '../SharedFields';

/** Largest page `GET /v1/activity-logs` accepts. */
const MAX_PAGE_SIZE = 200;

const show = (operation: string[]) => ({ resource: ['activityLogs'], operation });

export const activityLogProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['activityLogs'] } },
		options: [
			{
				name: 'List',
				value: 'list',
				action: 'List activity log entries',
			},
		],
		default: 'list',
	},
	...returnAllAndLimitFields(show(['list'])),
	{
		displayName: 'Filters',
		name: 'activityLogFilters',
		type: 'collection',
		placeholder: 'Add Filter',
		displayOptions: { show: show(['list']) },
		default: {},
		options: [
			{
				displayName: 'Action',
				name: 'action',
				type: 'string',
				default: '',
				placeholder: 'pin.published',
				description: 'Only entries with this action, for example pin.published or schedule.updated',
			},
			{
				displayName: 'Category',
				name: 'category',
				type: 'options',
				options: [
					{
						name: 'Billing',
						value: 'billing',
					},
					{
						name: 'Configuration',
						value: 'configuration',
					},
					{
						name: 'Integration',
						value: 'integration',
					},
					{
						name: 'Publishing',
						value: 'publishing',
					},
					{
						name: 'Security',
						value: 'security',
					},
				],
				default: 'publishing',
				description: 'Only entries in this category',
			},
			{
				displayName: 'Resource Type',
				name: 'resourceType',
				type: 'string',
				default: '',
				placeholder: 'pin',
				description: 'Only entries about this kind of resource, for example pin or schedule',
			},
			{
				displayName: 'Since',
				name: 'since',
				type: 'dateTime',
				default: '',
				description: "Only entries created at or after this time (workflow time zone if it has no offset)",
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{
						name: 'Canceled',
						value: 'canceled',
					},
					{
						name: 'Failed',
						value: 'failed',
					},
					{
						name: 'Queued',
						value: 'queued',
					},
					{
						name: 'Success',
						value: 'success',
					},
				],
				default: 'failed',
				description: 'Only entries with this outcome',
			},
		],
	},
];

export const activityLogOperations: ResourceOperations = {
	list: once(async function (itemIndex) {
		const { returnAll, limit } = getListLimits.call(this, itemIndex);
		const filters = this.getNodeParameter('activityLogFilters', itemIndex, {}) as IDataObject;
		const query = {
			category: filters.category as string | undefined,
			action: filters.action as string | undefined,
			status: filters.status as string | undefined,
			resource_type: filters.resourceType as string | undefined,
			since: timestampQueryValue.call(this, filters.since),
		};

		const logs: PinBridgeActivityLog[] = [];
		let cursor: string | undefined;
		do {
			const pageLimit = returnAll ? MAX_PAGE_SIZE : Math.min(limit - logs.length, MAX_PAGE_SIZE);
			const page = (await pinBridgeApiRequest.call(this, 'GET', '/v1/activity-logs', {
				...query,
				limit: pageLimit,
				cursor,
			})) as unknown as PinBridgeActivityLogPage;
			logs.push(...page.items);
			// An empty page ends the walk even if the API hands back a cursor.
			cursor = page.items.length > 0 ? (page.next_cursor ?? undefined) : undefined;
		} while (cursor && (returnAll || logs.length < limit));

		return (returnAll ? logs : logs.slice(0, limit)).map(mapActivityLogJson);
	}),
};
