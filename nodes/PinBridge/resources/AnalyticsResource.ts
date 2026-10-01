import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';

import type {
	PinBridgeAnalytics,
	PinBridgeAnalyticsCollect,
	PinBridgeAnalyticsOverview,
	PinBridgeDashboardSummary,
	PinBridgeTopPinsPage,
} from '../ApiTypes';
import type { PinBridgeQuery } from '../../../src/transport/PinBridgeClient';
import type { ResourceOperations } from '../GenericFunctions';
import {
	dateParameterText,
	getListLimits,
	getRequiredId,
	once,
	perItem,
	pinBridgeApiRequest,
	pinBridgeApiRequestAllItems,
	toDateOnly,
} from '../GenericFunctions';
import {
	mapAnalyticsCollectJson,
	mapAnalyticsJson,
	mapAnalyticsOverviewJson,
	mapDashboardSummaryJson,
	mapTopPinJson,
} from '../Mappers';
import { accountField } from '../SharedFields';

const show = (operation: string[]) => ({ resource: ['analytics'], operation });
const DATE_RANGE_OPERATIONS = ['getAccount', 'getPin', 'getOverview', 'listTopPins'];
const ACCOUNT_FILTER_OPERATIONS = ['getOverview', 'listTopPins', 'getPublishingSummary'];

export const analyticsProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['analytics'] } },
		options: [
			{
				name: 'Collect Account Analytics',
				value: 'collectAccount',
				action: 'Collect fresh analytics for an account',
				description:
					'Ask PinBridge to fetch the analytics of an account from Pinterest now (once per account every 15 minutes)',
			},
			{
				name: 'Get Account Analytics',
				value: 'getAccount',
				action: 'Get analytics for an account',
			},
			{
				name: 'Get Overview',
				value: 'getOverview',
				action: 'Get the analytics overview',
				description: 'Metrics summed across connected accounts, with the previous period',
			},
			{
				name: 'Get Pin Analytics',
				value: 'getPin',
				action: 'Get analytics for a pin',
			},
			{
				name: 'Get Publishing Summary',
				value: 'getPublishingSummary',
				action: 'Get the publishing summary',
				description:
					'Pins published and failed over a period, success rate, queue and upcoming schedules',
			},
			{
				name: 'List Top Pins',
				value: 'listTopPins',
				action: 'List top pins',
				description: 'Published pins ranked by a metric over a period',
			},
		],
		default: 'getOverview',
	},
	accountField(show(['getAccount', 'collectAccount'])),
	{
		displayName: 'Pin ID',
		name: 'pinId',
		type: 'string',
		displayOptions: { show: show(['getPin']) },
		default: '={{$json["id"]}}',
		required: true,
		description: 'PinBridge pin ID',
	},
	{
		displayName: 'Start Date',
		name: 'startDate',
		type: 'dateTime',
		displayOptions: { show: show(DATE_RANGE_OPERATIONS) },
		default: '',
		description: 'First day of the range, inclusive. Defaults to 30 days ago.',
	},
	{
		displayName: 'End Date',
		name: 'endDate',
		type: 'dateTime',
		displayOptions: { show: show(DATE_RANGE_OPERATIONS) },
		default: '',
		description: 'Last day of the range, inclusive. Defaults to today.',
	},
	{
		displayName: 'Range Start',
		name: 'rangeStart',
		type: 'dateTime',
		displayOptions: { show: show(['getPublishingSummary']) },
		default: '',
		description: 'Start of the period, inclusive. Defaults to 30 days before the end.',
	},
	{
		displayName: 'Range End',
		name: 'rangeEnd',
		type: 'dateTime',
		displayOptions: { show: show(['getPublishingSummary']) },
		default: '',
		description: 'End of the period, exclusive. Defaults to now.',
	},
	{
		displayName: 'Time Zone',
		name: 'summaryTimezone',
		type: 'string',
		displayOptions: { show: show(['getPublishingSummary']) },
		default: '',
		placeholder: 'Europe/Paris',
		description:
			"IANA time zone for the daily or hourly buckets and for times without an offset. Defaults to the workflow's time zone.",
	},
	{
		displayName: 'Rank By',
		name: 'sortBy',
		type: 'options',
		displayOptions: { show: show(['listTopPins']) },
		options: [
			{
				name: 'Comments',
				value: 'total_comments',
			},
			{
				name: 'Impressions',
				value: 'impression',
			},
			{
				name: 'Outbound Clicks',
				value: 'outbound_click',
			},
			{
				name: 'Pin Clicks',
				value: 'pin_click',
			},
			{
				name: 'Reactions',
				value: 'total_reactions',
			},
			{
				name: 'Saves',
				value: 'save',
			},
		],
		default: 'impression',
		description: 'Metric the pins are ranked by',
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		displayOptions: { show: show(['listTopPins']) },
		default: false,
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: {
			minValue: 1,
		},
		displayOptions: { show: { ...show(['listTopPins']), returnAll: [false] } },
		default: 50,
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'analyticsFilters',
		type: 'collection',
		placeholder: 'Add Filter',
		displayOptions: { show: show(ACCOUNT_FILTER_OPERATIONS) },
		default: {},
		options: [
			{
				displayName: 'Connection Name or ID',
				name: 'accountId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getAccounts',
				},
				default: '',
				description:
					'Limit to one Pinterest account. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
		],
	},
	{
		displayName: 'Options',
		name: 'metricOptions',
		type: 'collection',
		placeholder: 'Add Option',
		displayOptions: { show: show(['getAccount', 'getPin']) },
		default: {},
		options: [
			{
				displayName: 'Include Daily Rows',
				name: 'includeDaily',
				type: 'boolean',
				default: true,
				description:
					'Whether to include one row per day. Turn it off when only the range totals are needed.',
			},
			{
				displayName: 'Metrics',
				name: 'metrics',
				type: 'string',
				default: '',
				placeholder: 'IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK',
				description: 'Comma-separated Pinterest metric types. Defaults to the standard set.',
			},
			{
				displayName: 'Source',
				name: 'source',
				type: 'options',
				options: [
					{
						name: 'Auto',
						value: 'auto',
						description: 'Stored history when it covers the range, else Pinterest',
					},
					{
						name: 'Live',
						value: 'live',
						description: 'Always ask Pinterest (last 90 days only, counts against the read limit)',
					},
					{
						name: 'Stored',
						value: 'stored',
						description: 'Only the nightly copy stored by PinBridge (up to 366 days)',
					},
				],
				default: 'auto',
				description: 'Where the numbers come from',
			},
		],
	},
];

function dateRangeQuery(this: IExecuteFunctions, itemIndex: number): PinBridgeQuery {
	return {
		start_date: toDateOnly.call(
			this,
			this.getNodeParameter('startDate', itemIndex, ''),
			'Start Date',
			itemIndex,
		),
		end_date: toDateOnly.call(
			this,
			this.getNodeParameter('endDate', itemIndex, ''),
			'End Date',
			itemIndex,
		),
	};
}

function metricQuery(this: IExecuteFunctions, itemIndex: number): PinBridgeQuery {
	const options = this.getNodeParameter('metricOptions', itemIndex, {}) as IDataObject;
	return {
		...dateRangeQuery.call(this, itemIndex),
		metrics: options.metrics as string | undefined,
		source: options.source as string | undefined,
		include_daily: options.includeDaily as boolean | undefined,
	};
}

function accountFilter(this: IExecuteFunctions, itemIndex: number): string | undefined {
	const filters = this.getNodeParameter('analyticsFilters', itemIndex, {}) as IDataObject;
	return (filters.accountId as string | undefined) || undefined;
}

export const analyticsOperations: ResourceOperations = {
	getAccount: perItem(async function (itemIndex) {
		const accountId = this.getNodeParameter('accountId', itemIndex) as string;
		const analytics = (await pinBridgeApiRequest.call(
			this,
			'GET',
			`/v1/pinterest/accounts/${encodeURIComponent(accountId)}/analytics`,
			metricQuery.call(this, itemIndex),
		)) as unknown as PinBridgeAnalytics;
		return mapAnalyticsJson(analytics);
	}),

	getPin: perItem(async function (itemIndex) {
		const pinId = getRequiredId.call(this, 'pinId', 'Pin ID', itemIndex);
		const analytics = (await pinBridgeApiRequest.call(
			this,
			'GET',
			`/v1/pins/${encodeURIComponent(pinId)}/analytics`,
			metricQuery.call(this, itemIndex),
		)) as unknown as PinBridgeAnalytics;
		return mapAnalyticsJson(analytics);
	}),

	getOverview: perItem(async function (itemIndex) {
		const overview = (await pinBridgeApiRequest.call(this, 'GET', '/v1/analytics/overview', {
			...dateRangeQuery.call(this, itemIndex),
			account_id: accountFilter.call(this, itemIndex),
		})) as unknown as PinBridgeAnalyticsOverview;
		return mapAnalyticsOverviewJson(overview);
	}),

	listTopPins: once(async function (itemIndex) {
		const pins = (await pinBridgeApiRequestAllItems.call(
			this,
			'/v1/analytics/pins',
			{
				...dateRangeQuery.call(this, itemIndex),
				account_id: accountFilter.call(this, itemIndex),
				sort_by: this.getNodeParameter('sortBy', itemIndex, 'impression') as string,
			},
			{
				...getListLimits.call(this, itemIndex),
				maxPageSize: 100,
				extract: (page) => (page as PinBridgeTopPinsPage).items,
			},
		)) as IDataObject[];
		return pins.map((pin, index) => mapTopPinJson(pin, index + 1));
	}),

	getPublishingSummary: perItem(async function (itemIndex) {
		const timezone =
			(this.getNodeParameter('summaryTimezone', itemIndex, '') as string).trim() ||
			this.getTimezone();
		const summary = (await pinBridgeApiRequest.call(this, 'GET', '/v1/dashboard/summary', {
			start: dateParameterText(this.getNodeParameter('rangeStart', itemIndex, '')) || undefined,
			end: dateParameterText(this.getNodeParameter('rangeEnd', itemIndex, '')) || undefined,
			tz: timezone,
			account_id: accountFilter.call(this, itemIndex),
		})) as unknown as PinBridgeDashboardSummary;
		return mapDashboardSummaryJson(summary);
	}),

	collectAccount: perItem(async function (itemIndex) {
		const accountId = this.getNodeParameter('accountId', itemIndex) as string;
		const response = (await pinBridgeApiRequest.call(
			this,
			'POST',
			`/v1/analytics/accounts/${encodeURIComponent(accountId)}/collect`,
		)) as unknown as PinBridgeAnalyticsCollect;
		return mapAnalyticsCollectJson(response);
	}),
};
