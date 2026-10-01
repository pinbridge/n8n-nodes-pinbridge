import type { IDataObject, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { PinBridgeSchedule, PinBridgeValidationResponse } from '../ApiTypes';
import type { ResourceOperations } from '../GenericFunctions';
import {
	dateParameterText,
	getListLimits,
	getRequiredId,
	once,
	perItem,
	pinBridgeApiRequest,
	pinBridgeApiRequestAllItems,
	toTimestampWithOffset,
} from '../GenericFunctions';
import { mapDeleteJson, mapScheduleJson, mapValidationJson } from '../Mappers';
import {
	accountField,
	boardField,
	buildScheduleBody,
	pinContentFields,
	returnAllAndLimitFields,
	timestampQueryValue,
} from '../SharedFields';

const show = (operation: string[]) => ({ resource: ['schedules'], operation });
const CREATE_OPERATIONS = ['create', 'validate'];

export const scheduleProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['schedules'] } },
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
				name: 'Delete',
				value: 'delete',
				action: 'Delete a schedule',
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
			{
				name: 'Retry',
				value: 'retry',
				action: 'Retry a failed schedule',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a schedule',
				description: 'Change the time, board, text or media of a schedule that has not run yet',
			},
			{
				name: 'Validate',
				value: 'validate',
				action: 'Validate a schedule without creating it',
				description: 'Dry run: run every schedule check without creating the schedule',
			},
		],
		default: 'create',
	},
	accountField(show(CREATE_OPERATIONS)),
	boardField(show(CREATE_OPERATIONS)),
	{
		displayName: 'Run At',
		name: 'runAt',
		type: 'dateTime',
		displayOptions: { show: show(CREATE_OPERATIONS) },
		default: '',
		required: true,
		description:
			"When the pin should be published. A time without an offset is read in the workflow's time zone.",
	},
	...pinContentFields(show(CREATE_OPERATIONS), { pinOnly: false }),
	{
		displayName: 'Schedule ID',
		name: 'scheduleId',
		type: 'string',
		displayOptions: { show: show(['get', 'cancel', 'update', 'retry', 'delete']) },
		default: '={{$json["id"]}}',
		required: true,
		description: 'Schedule ID returned by PinBridge',
	},
	{
		displayName: 'Update Fields',
		name: 'scheduleUpdateFields',
		type: 'collection',
		placeholder: 'Add Field',
		displayOptions: { show: show(['update']) },
		default: {},
		options: [
			{
				displayName: 'Asset ID',
				name: 'assetId',
				type: 'string',
				default: '',
				description: 'Replace the media with this uploaded PinBridge asset',
			},
			{
				displayName: 'Board ID',
				name: 'boardId',
				type: 'string',
				default: '',
				description: 'Publish to this board instead',
			},
			{
				displayName: 'Cover Image Asset ID',
				name: 'coverImageAssetId',
				type: 'string',
				default: '',
				description: 'Video cover from an uploaded image asset',
			},
			{
				displayName: 'Cover Image URL',
				name: 'coverImageUrl',
				type: 'string',
				default: '',
				description: 'Video cover from a public image URL',
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
				displayName: 'Image URL',
				name: 'imageUrl',
				type: 'string',
				default: '',
				description: 'Replace the media with this public image URL',
			},
			{
				displayName: 'Link URL',
				name: 'linkUrl',
				type: 'string',
				default: '',
				description: 'New destination URL. Leave empty to clear it.',
			},
			{
				displayName: 'Run At',
				name: 'runAt',
				type: 'dateTime',
				default: '',
				description:
					"New publish time. A time without an offset is read in the workflow's time zone.",
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
	...returnAllAndLimitFields(show(['list'])),
	{
		displayName: 'Filters',
		name: 'scheduleFilters',
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
				description: 'Only schedules targeting this Pinterest board',
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
					'Only schedules of this Pinterest account. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Run After',
				name: 'since',
				type: 'dateTime',
				default: '',
				description: "Only schedules running at or after this time (workflow time zone if it has no offset)",
			},
			{
				displayName: 'Run Before',
				name: 'until',
				type: 'dateTime',
				default: '',
				description: "Only schedules running before this time (workflow time zone if it has no offset)",
			},
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				default: '',
				description: 'Case-insensitive match on the pin title, description and link URL',
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
						name: 'Run Time (Latest First)',
						value: 'run_at_desc',
					},
					{
						name: 'Run Time (Next First)',
						value: 'run_at_asc',
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
				default: 'run_at_asc',
				description: 'Order of the returned schedules',
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
						name: 'Deferred',
						value: 'deferred',
					},
					{
						name: 'Done',
						value: 'done',
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
						name: 'Running',
						value: 'running',
					},
					{
						name: 'Scheduled',
						value: 'scheduled',
					},
				],
				default: 'scheduled',
				description: 'Only schedules in this status',
			},
		],
	},
];

function schedulePath(scheduleId: string, suffix = ''): string {
	return `/v1/schedules/${encodeURIComponent(scheduleId)}${suffix}`;
}

export const scheduleOperations: ResourceOperations = {
	create: perItem(async function (itemIndex) {
		const schedule = (await pinBridgeApiRequest.call(
			this,
			'POST',
			'/v1/schedules',
			undefined,
			buildScheduleBody.call(this, itemIndex),
		)) as PinBridgeSchedule;
		return mapScheduleJson(schedule);
	}),

	validate: perItem(async function (itemIndex) {
		const validation = (await pinBridgeApiRequest.call(
			this,
			'POST',
			'/v1/schedules/validate',
			undefined,
			buildScheduleBody.call(this, itemIndex),
		)) as unknown as PinBridgeValidationResponse;
		return mapValidationJson(validation);
	}),

	get: perItem(async function (itemIndex) {
		const scheduleId = getRequiredId.call(this, 'scheduleId', 'Schedule ID', itemIndex);
		const schedule = (await pinBridgeApiRequest.call(
			this,
			'GET',
			schedulePath(scheduleId),
		)) as PinBridgeSchedule;
		return mapScheduleJson(schedule);
	}),

	update: perItem(async function (itemIndex) {
		const scheduleId = getRequiredId.call(this, 'scheduleId', 'Schedule ID', itemIndex);
		const fields = this.getNodeParameter('scheduleUpdateFields', itemIndex, {}) as IDataObject;
		const body: IDataObject = {};

		const runAt = dateParameterText(fields.runAt);
		if (runAt) {
			body.run_at = toTimestampWithOffset(runAt, this.getTimezone());
		}
		for (const [field, apiField] of [
			['boardId', 'board_id'],
			['title', 'title'],
			['imageUrl', 'image_url'],
			['assetId', 'asset_id'],
			['coverImageUrl', 'cover_image_url'],
			['coverImageAssetId', 'cover_image_asset_id'],
		]) {
			if (fields[field]) {
				body[apiField] = fields[field];
			}
		}
		// An added-but-empty text field clears the value on the schedule.
		for (const [field, apiField] of [
			['description', 'description'],
			['linkUrl', 'link_url'],
		]) {
			if (fields[field] !== undefined) {
				body[apiField] = fields[field] === '' ? null : fields[field];
			}
		}
		if (Object.keys(body).length === 0) {
			throw new NodeOperationError(this.getNode(), 'Add at least one schedule field to update', {
				itemIndex,
			});
		}

		const schedule = (await pinBridgeApiRequest.call(
			this,
			'PATCH',
			schedulePath(scheduleId),
			undefined,
			body,
		)) as PinBridgeSchedule;
		return mapScheduleJson(schedule);
	}),

	cancel: perItem(async function (itemIndex) {
		const scheduleId = getRequiredId.call(this, 'scheduleId', 'Schedule ID', itemIndex);
		const schedule = (await pinBridgeApiRequest.call(
			this,
			'POST',
			schedulePath(scheduleId, '/cancel'),
		)) as PinBridgeSchedule;
		return mapScheduleJson(schedule);
	}),

	retry: perItem(async function (itemIndex) {
		const scheduleId = getRequiredId.call(this, 'scheduleId', 'Schedule ID', itemIndex);
		const schedule = (await pinBridgeApiRequest.call(
			this,
			'POST',
			schedulePath(scheduleId, '/retry'),
		)) as PinBridgeSchedule;
		return mapScheduleJson(schedule);
	}),

	delete: perItem(async function (itemIndex) {
		const scheduleId = getRequiredId.call(this, 'scheduleId', 'Schedule ID', itemIndex);
		await pinBridgeApiRequest.call(this, 'DELETE', schedulePath(scheduleId));
		return mapDeleteJson('schedule', scheduleId);
	}),

	list: once(async function (itemIndex) {
		const filters = this.getNodeParameter('scheduleFilters', itemIndex, {}) as IDataObject;
		const schedules = (await pinBridgeApiRequestAllItems.call(
			this,
			'/v1/schedules',
			{
				account_id: filters.accountId as string | undefined,
				board_id: filters.boardId as string | undefined,
				status: filters.status as string | undefined,
				q: filters.search as string | undefined,
				sort: filters.sort as string | undefined,
				since: timestampQueryValue.call(this, filters.since),
				until: timestampQueryValue.call(this, filters.until),
			},
			{ ...getListLimits.call(this, itemIndex), maxPageSize: 200 },
		)) as PinBridgeSchedule[];
		return schedules.map(mapScheduleJson);
	}),
};
