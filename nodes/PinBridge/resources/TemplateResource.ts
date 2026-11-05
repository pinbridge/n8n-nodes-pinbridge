import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type {
	PinBridgePinRecord,
	PinBridgeSchedule,
	PinBridgeTemplate,
	PinBridgeTemplateDetail,
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
	toTimestampWithOffset,
} from '../GenericFunctions';
import { mapPinJson, mapScheduleJson, mapTemplateJson } from '../Mappers';
import { accountField, boardField, returnAllAndLimitFields } from '../SharedFields';

const show = (operation: string[]) => ({ resource: ['templates'], operation });
const DRAW_OPERATIONS = ['publishPin', 'createSchedule'];

export const templateProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['templates'] } },
		options: [
			{
				name: 'Create Schedule',
				value: 'createSchedule',
				action: 'Schedule a pin drawn from a template',
				description: 'PinBridge draws the pin from the template and inputs, then publishes it later',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a template',
				description: 'Get a template with its inputs and their limits',
			},
			{
				name: 'List',
				value: 'list',
				action: 'List templates',
			},
			{
				name: 'Publish Pin',
				value: 'publishPin',
				action: 'Publish a pin drawn from a template',
				description: 'PinBridge draws the pin from the template and inputs, then publishes it',
			},
		],
		default: 'publishPin',
	},
	{
		displayName: 'Template Name or ID',
		name: 'templateId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getTemplates',
		},
		displayOptions: { show: show(['get', ...DRAW_OPERATIONS]) },
		default: '',
		required: true,
		description:
			'A gallery template or one of your own. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Template Inputs',
		name: 'templateInputs',
		type: 'json',
		displayOptions: { show: show(DRAW_OPERATIONS) },
		default: '{}',
		required: true,
		description:
			'Values for the template\'s inputs, by input name, for example {"title": "Pineapple Salsa", "photo": "https://example.com/salsa.jpg"}. A photo takes an image URL, {"src": URL, "focus": [x, y], "zoom": 1 to 3} or {"asset_id": ID}. The Get operation lists the inputs.',
	},
	accountField(show(DRAW_OPERATIONS)),
	boardField(show(DRAW_OPERATIONS)),
	{
		displayName: 'Run At',
		name: 'runAt',
		type: 'dateTime',
		displayOptions: { show: show(['createSchedule']) },
		default: '',
		required: true,
		description:
			"When the pin should be published. A time without an offset is read in the workflow's time zone.",
	},
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		displayOptions: { show: show(DRAW_OPERATIONS) },
		default: '',
		required: true,
		description: 'Pin title (max 100 characters)',
	},
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		typeOptions: {
			rows: 3,
		},
		displayOptions: { show: show(DRAW_OPERATIONS) },
		default: '',
		description: 'Optional pin description (max 800 characters)',
	},
	{
		displayName: 'Link URL',
		name: 'linkUrl',
		type: 'string',
		displayOptions: { show: show(DRAW_OPERATIONS) },
		default: '',
		description: 'Optional destination URL for the pin (max 2048 characters)',
	},
	{
		displayName: 'Alt Text',
		name: 'altText',
		type: 'string',
		displayOptions: { show: show(DRAW_OPERATIONS) },
		default: '',
		description: 'Optional accessibility alt text sent to Pinterest (max 500 characters)',
	},
	{
		displayName: 'Idempotency Key',
		name: 'idempotencyKey',
		type: 'string',
		displayOptions: { show: show(['publishPin']) },
		default: '={{$execution.id + "-" + $itemIndex}}',
		required: true,
		description:
			'Deduplication key sent as idempotency_key. Publishing twice with the same key returns the first pin, and the template is drawn only once.',
	},
	{
		displayName: 'Template Options',
		name: 'templateOptions',
		type: 'collection',
		placeholder: 'Add Option',
		displayOptions: { show: show(DRAW_OPERATIONS) },
		default: {},
		options: [
			{
				displayName: 'Size',
				name: 'size',
				type: 'options',
				options: [
					{
						name: '2:3 (1000 × 1500)',
						value: 'pin_2x3',
					},
					{
						name: '1:2 (1000 × 2000)',
						value: 'pin_1x2',
					},
					{
						name: 'Template Canvas',
						value: '',
					},
					{
						name: 'Tall (1200 × 2520)',
						value: 'pin_10x21',
					},
				],
				default: '',
				description: 'Size to draw the pin at. Template Canvas uses the size the template was made at.',
			},
			{
				displayName: 'Version',
				name: 'version',
				type: 'number',
				typeOptions: {
					minValue: 0,
				},
				default: 0,
				description: 'Template version to draw. 0 draws the current version.',
			},
		],
	},
	{
		displayName: 'Source',
		name: 'templateSource',
		type: 'options',
		displayOptions: { show: show(['list']) },
		options: [
			{
				name: 'All',
				value: '',
			},
			{
				name: 'Gallery',
				value: 'gallery',
			},
			{
				name: 'Mine',
				value: 'workspace',
			},
		],
		default: '',
		description: 'Gallery templates, your own, or both',
	},
	{
		displayName: 'Search',
		name: 'templateSearch',
		type: 'string',
		displayOptions: { show: show(['list']) },
		default: '',
		description: 'Only templates whose name or description contains this text',
	},
	...returnAllAndLimitFields(show(['list'])),
];

function templateInputs(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const value = this.getNodeParameter('templateInputs', itemIndex, '{}') as unknown;
	let parsed: unknown = value;
	if (typeof value === 'string') {
		try {
			parsed = JSON.parse(value.trim() || '{}');
		} catch {
			throw new NodeOperationError(this.getNode(), 'Template Inputs must be valid JSON', {
				itemIndex,
				description: 'Write the inputs as a JSON object, for example {"title": "Pineapple Salsa"}',
			});
		}
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new NodeOperationError(this.getNode(), 'Template Inputs must be a JSON object', {
			itemIndex,
			description: 'Write the inputs as {"input name": value, ...}',
		});
	}
	return parsed as IDataObject;
}

/** Template, inputs and text fields shared by Publish Pin and Create Schedule. */
function drawBody(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const body: IDataObject = {
		account_id: this.getNodeParameter('accountId', itemIndex) as string,
		board_id: this.getNodeParameter('boardId', itemIndex) as string,
		title: this.getNodeParameter('title', itemIndex) as string,
		template_id: getRequiredId.call(this, 'templateId', 'Template ID', itemIndex),
		template_inputs: templateInputs.call(this, itemIndex),
	};
	const options = this.getNodeParameter('templateOptions', itemIndex, {}) as IDataObject;
	if (options.size) {
		body.template_size = options.size;
	}
	if (typeof options.version === 'number' && options.version > 0) {
		body.template_version = options.version;
	}
	for (const [field, apiField] of [
		['description', 'description'],
		['linkUrl', 'link_url'],
		['altText', 'alt_text'],
	]) {
		const value = this.getNodeParameter(field, itemIndex, '') as string;
		if (value) {
			body[apiField] = value;
		}
	}
	return body;
}

export const templateOperations: ResourceOperations = {
	list: once(async function (itemIndex) {
		const query: PinBridgeQuery = { sort: 'name' };
		const source = this.getNodeParameter('templateSource', itemIndex, '') as string;
		const search = this.getNodeParameter('templateSearch', itemIndex, '') as string;
		if (source) {
			query.source = source;
		}
		if (search) {
			query.q = search;
		}
		const templates = (await pinBridgeApiRequestAllItems.call(this, '/v1/templates', query, {
			...getListLimits.call(this, itemIndex),
			maxPageSize: 200,
		})) as PinBridgeTemplate[];
		return templates.map((template) => mapTemplateJson(template));
	}),

	get: perItem(async function (itemIndex) {
		const templateId = getRequiredId.call(this, 'templateId', 'Template ID', itemIndex);
		const template = (await pinBridgeApiRequest.call(
			this,
			'GET',
			`/v1/templates/${encodeURIComponent(templateId)}`,
		)) as PinBridgeTemplateDetail;
		return mapTemplateJson(template);
	}),

	publishPin: perItem(async function (itemIndex) {
		const body = drawBody.call(this, itemIndex);
		body.idempotency_key = this.getNodeParameter('idempotencyKey', itemIndex) as string;
		const pin = (await pinBridgeApiRequest.call(
			this,
			'POST',
			'/v1/pins',
			undefined,
			body,
		)) as PinBridgePinRecord;
		return mapPinJson(pin);
	}),

	createSchedule: perItem(async function (itemIndex) {
		const body = drawBody.call(this, itemIndex);
		body.run_at = toTimestampWithOffset(
			dateParameterText(this.getNodeParameter('runAt', itemIndex)),
			this.getTimezone(),
		);
		const schedule = (await pinBridgeApiRequest.call(
			this,
			'POST',
			'/v1/schedules',
			undefined,
			body,
		)) as PinBridgeSchedule;
		return mapScheduleJson(schedule);
	}),
};
