/**
 * Field definitions shared by several resources.
 *
 * Parameter names, defaults and option values are stored in saved workflows (defaults are
 * omitted there), so they must stay exactly as they are. Labels and help text can change.
 */

import type { IDataObject, IDisplayOptions, IExecuteFunctions, INodeProperties } from 'n8n-workflow';

import { dateParameterText, parseCsvList, toTimestampWithOffset } from './GenericFunctions';

type Show = NonNullable<IDisplayOptions['show']>;

export function accountField(show: Show): INodeProperties {
	return {
		displayName: 'Connection Name or ID',
		name: 'accountId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getAccounts',
		},
		displayOptions: { show },
		default: '',
		required: true,
		description:
			'Pinterest account connected to PinBridge. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	};
}

export function boardField(show: Show): INodeProperties {
	return {
		displayName: 'Board Name or ID',
		name: 'boardId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getBoards',
			loadOptionsDependsOn: ['accountId'],
		},
		displayOptions: { show },
		default: '',
		required: true,
		description:
			'Pinterest board of the selected connection. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	};
}

export function returnAllAndLimitFields(show: Show): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			displayOptions: { show },
			default: true,
			description: 'Whether to return all results or only up to a given limit',
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			typeOptions: {
				minValue: 1,
			},
			displayOptions: { show: { ...show, returnAll: [false] } },
			default: 50,
			description: 'Max number of results to return',
		},
	];
}

/**
 * Title, text and media fields of a pin, used by pin publishing and schedule creation.
 * `pinOnly` adds the fields a schedule does not accept (alt text, related terms, color).
 */
export function pinContentFields(show: Show, options: { pinOnly: boolean }): INodeProperties[] {
	const fields: INodeProperties[] = [
		{
			displayName: 'Media Source',
			name: 'imageSource',
			type: 'options',
			displayOptions: { show },
			options: [
				{
					name: 'Uploaded Asset',
					value: 'asset',
				},
				{
					name: 'Public Image URL',
					value: 'url',
				},
			],
			default: 'asset',
			description:
				'Whether the pin uses a PinBridge asset (image or video) or an existing public image URL',
		},
		{
			displayName: 'Asset ID',
			name: 'assetId',
			type: 'string',
			displayOptions: { show: { ...show, imageSource: ['asset'] } },
			default: '={{$json["id"]}}',
			required: true,
			description: 'PinBridge asset ID returned by the Upload Image or Upload Video operation',
		},
		{
			displayName: 'Image URL',
			name: 'imageUrl',
			type: 'string',
			displayOptions: { show: { ...show, imageSource: ['url'] } },
			default: '',
			required: true,
			description: 'Public image URL PinBridge can download',
		},
		{
			displayName: 'Title',
			name: 'title',
			type: 'string',
			displayOptions: { show },
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
			displayOptions: { show },
			default: '',
			description: 'Optional pin description (max 800 characters)',
		},
		{
			displayName: 'Link URL',
			name: 'linkUrl',
			type: 'string',
			displayOptions: { show },
			default: '',
			description: 'Optional destination URL for the pin (max 2048 characters)',
		},
	];

	if (options.pinOnly) {
		fields.push(
			{
				displayName: 'Alt Text',
				name: 'altText',
				type: 'string',
				displayOptions: { show },
				default: '',
				description: 'Optional accessibility alt text sent to Pinterest (max 500 characters)',
			},
			{
				displayName: 'Related Terms',
				name: 'relatedTerms',
				type: 'string',
				displayOptions: { show },
				default: '',
				description: 'Optional comma-separated related terms for Pinterest',
			},
			{
				displayName: 'Dominant Color',
				name: 'dominantColor',
				type: 'color',
				displayOptions: { show },
				default: '',
				description: 'Optional dominant media color, for example #6E7874',
			},
		);
	}

	fields.push(
		{
			displayName: 'Video Cover Source',
			name: 'coverImageSource',
			type: 'options',
			displayOptions: { show },
			options: [
				{
					name: 'None (API Default)',
					value: 'none',
				},
				{
					name: 'Public Image URL',
					value: 'url',
				},
				{
					name: 'Uploaded Asset',
					value: 'asset',
				},
			],
			default: 'none',
			description:
				'Optional cover for video pins. Leave it empty to let Pinterest use the first keyframe.',
		},
		{
			displayName: 'Cover Image URL',
			name: 'coverImageUrl',
			type: 'string',
			displayOptions: { show: { ...show, coverImageSource: ['url'] } },
			default: '',
			required: true,
			description: 'Public URL for a video cover image (max 2048 characters)',
		},
		{
			displayName: 'Cover Image Asset ID',
			name: 'coverImageAssetId',
			type: 'string',
			displayOptions: { show: { ...show, coverImageSource: ['asset'] } },
			default: '={{$json["id"]}}',
			required: true,
			description: 'PinBridge uploaded image asset ID used as a video cover image',
		},
	);

	return fields;
}

/** Add the media and video-cover fields of {@link pinContentFields} to a request body. */
export function addMediaFields(this: IExecuteFunctions, itemIndex: number, body: IDataObject): void {
	const imageSource = this.getNodeParameter('imageSource', itemIndex) as string;
	if (imageSource === 'asset') {
		body.asset_id = this.getNodeParameter('assetId', itemIndex) as string;
	} else {
		body.image_url = this.getNodeParameter('imageUrl', itemIndex) as string;
	}

	const coverImageSource = this.getNodeParameter('coverImageSource', itemIndex, 'none') as string;
	if (coverImageSource === 'url') {
		body.cover_image_url = this.getNodeParameter('coverImageUrl', itemIndex) as string;
	}
	if (coverImageSource === 'asset') {
		body.cover_image_asset_id = this.getNodeParameter('coverImageAssetId', itemIndex) as string;
	}
}

/** The `PinCreate` body sent by Publish, Publish Batch and Validate. */
export function buildPinBody(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const body: IDataObject = {
		account_id: this.getNodeParameter('accountId', itemIndex) as string,
		board_id: this.getNodeParameter('boardId', itemIndex) as string,
		title: this.getNodeParameter('title', itemIndex) as string,
		idempotency_key: this.getNodeParameter('idempotencyKey', itemIndex) as string,
	};
	addMediaFields.call(this, itemIndex, body);

	const description = this.getNodeParameter('description', itemIndex, '') as string;
	const linkUrl = this.getNodeParameter('linkUrl', itemIndex, '') as string;
	const altText = this.getNodeParameter('altText', itemIndex, '') as string;
	const relatedTerms = parseCsvList(this.getNodeParameter('relatedTerms', itemIndex, '') as string);
	const dominantColor = this.getNodeParameter('dominantColor', itemIndex, '') as string;

	if (description) {
		body.description = description;
	}
	if (linkUrl) {
		body.link_url = linkUrl;
	}
	if (altText) {
		body.alt_text = altText;
	}
	if (relatedTerms.length > 0) {
		body.related_terms = relatedTerms;
	}
	if (dominantColor) {
		body.dominant_color = dominantColor;
	}
	return body;
}

/** The `ScheduleCreate` body sent by Create and Validate. */
export function buildScheduleBody(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const runAt = toTimestampWithOffset(
		dateParameterText(this.getNodeParameter('runAt', itemIndex)),
		this.getTimezone(),
	);
	const body: IDataObject = {
		account_id: this.getNodeParameter('accountId', itemIndex) as string,
		run_at: runAt,
		board_id: this.getNodeParameter('boardId', itemIndex) as string,
		title: this.getNodeParameter('title', itemIndex) as string,
	};
	addMediaFields.call(this, itemIndex, body);

	const description = this.getNodeParameter('description', itemIndex, '') as string;
	const linkUrl = this.getNodeParameter('linkUrl', itemIndex, '') as string;
	if (description) {
		body.description = description;
	}
	if (linkUrl) {
		body.link_url = linkUrl;
	}
	return body;
}

/** Copy a date-time filter into a query, reading offset-less values in the workflow's time zone. */
export function timestampQueryValue(
	this: IExecuteFunctions,
	value: unknown,
): string | undefined {
	const text = dateParameterText(value);
	return text ? toTimestampWithOffset(text, this.getTimezone()) : undefined;
}
