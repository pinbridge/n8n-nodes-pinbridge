import type { IDataObject, INodeProperties } from 'n8n-workflow';

import type { PinBridgeAsset, PinBridgeAssetDeleteResponse, PinBridgeAssetList } from '../ApiTypes';
import type { ResourceOperations } from '../GenericFunctions';
import {
	getBinaryFormData,
	getListLimits,
	getRequiredId,
	once,
	perItem,
	pinBridgeApiRequest,
	pinBridgeApiRequestAllItems,
	pinBridgeMultipartRequest,
} from '../GenericFunctions';
import { mapAssetDeleteJson, mapAssetJson } from '../Mappers';
import { returnAllAndLimitFields, timestampQueryValue } from '../SharedFields';

const show = (operation: string[]) => ({ resource: ['assets'], operation });

export const assetProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['assets'] } },
		options: [
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete an asset',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get an asset',
			},
			{
				name: 'List',
				value: 'list',
				action: 'List assets',
			},
			{
				name: 'Upload Image',
				value: 'uploadImage',
				action: 'Upload an image asset',
			},
			{
				name: 'Upload Video',
				value: 'uploadVideo',
				action: 'Upload a video asset',
			},
		],
		default: 'uploadImage',
	},
	{
		displayName: 'Asset ID',
		name: 'assetLookupId',
		type: 'string',
		displayOptions: { show: show(['get', 'delete']) },
		default: '={{$json["id"]}}',
		required: true,
		description: 'PinBridge asset ID returned by the Upload Image or Upload Video operation',
	},
	{
		displayName: 'Delete Even If In Use',
		name: 'deleteIfInUse',
		type: 'boolean',
		displayOptions: { show: show(['delete']) },
		default: false,
		description:
			'Whether to delete an asset that pins or pending schedules still use. When off, such an asset is kept and the output says requiresConfirmation.',
	},
	{
		displayName: 'Binary Property',
		name: 'binaryPropertyName',
		type: 'string',
		displayOptions: { show: show(['uploadImage', 'uploadVideo']) },
		default: 'data',
		required: true,
		description: 'Name of the incoming binary property to upload',
	},
	...returnAllAndLimitFields(show(['list'])),
	{
		displayName: 'Filters',
		name: 'assetFilters',
		type: 'collection',
		placeholder: 'Add Filter',
		displayOptions: { show: show(['list']) },
		default: {},
		options: [
			{
				displayName: 'Asset Type',
				name: 'assetType',
				type: 'options',
				options: [
					{
						name: 'Image',
						value: 'image',
					},
					{
						name: 'Video',
						value: 'video',
					},
				],
				default: 'image',
				description: 'Only images or only videos',
			},
			{
				displayName: 'In Use',
				name: 'inUse',
				type: 'boolean',
				default: true,
				description:
					'Whether to return only assets used by a pin or pending schedule (on) or only unused assets (off)',
			},
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				default: '',
				description: 'Case-insensitive match on the original file name',
			},
			{
				displayName: 'Sort',
				name: 'sort',
				type: 'options',
				options: [
					{
						name: 'Name (A-Z)',
						value: 'name_asc',
					},
					{
						name: 'Name (Z-A)',
						value: 'name_desc',
					},
					{
						name: 'Size (Largest First)',
						value: 'size_desc',
					},
					{
						name: 'Size (Smallest First)',
						value: 'size_asc',
					},
					{
						name: 'Uploaded (Newest First)',
						value: 'created_at_desc',
					},
					{
						name: 'Uploaded (Oldest First)',
						value: 'created_at_asc',
					},
				],
				default: 'created_at_desc',
				description: 'Order of the returned assets',
			},
			{
				displayName: 'Uploaded After',
				name: 'since',
				type: 'dateTime',
				default: '',
				description: "Only assets uploaded at or after this time (workflow time zone if it has no offset)",
			},
			{
				displayName: 'Uploaded Before',
				name: 'until',
				type: 'dateTime',
				default: '',
				description: "Only assets uploaded before this time (workflow time zone if it has no offset)",
			},
		],
	},
];

export const assetOperations: ResourceOperations = {
	uploadImage: perItem(async function (itemIndex) {
		const formData = await getBinaryFormData.call(this, itemIndex, 'pin-image.png', 'image/png');
		const asset = (await pinBridgeMultipartRequest.call(
			this,
			'POST',
			'/v1/assets/images',
			formData,
		)) as PinBridgeAsset;
		return mapAssetJson(asset);
	}),

	uploadVideo: perItem(async function (itemIndex) {
		const formData = await getBinaryFormData.call(this, itemIndex, 'pin-video.mp4', 'video/mp4');
		const asset = (await pinBridgeMultipartRequest.call(
			this,
			'POST',
			'/v1/assets/videos',
			formData,
		)) as PinBridgeAsset;
		return mapAssetJson(asset);
	}),

	get: perItem(async function (itemIndex) {
		const assetId = getRequiredId.call(this, 'assetLookupId', 'Asset ID', itemIndex);
		const asset = (await pinBridgeApiRequest.call(
			this,
			'GET',
			`/v1/assets/${encodeURIComponent(assetId)}`,
		)) as PinBridgeAsset;
		return mapAssetJson(asset);
	}),

	list: once(async function (itemIndex) {
		const filters = this.getNodeParameter('assetFilters', itemIndex, {}) as IDataObject;
		const assets = (await pinBridgeApiRequestAllItems.call(
			this,
			'/v1/assets',
			{
				asset_type: filters.assetType as string | undefined,
				in_use: filters.inUse as boolean | undefined,
				q: filters.search as string | undefined,
				sort: filters.sort as string | undefined,
				since: timestampQueryValue.call(this, filters.since),
				until: timestampQueryValue.call(this, filters.until),
			},
			{
				...getListLimits.call(this, itemIndex),
				maxPageSize: 200,
				extract: (page) => (page as PinBridgeAssetList).assets,
			},
		)) as PinBridgeAsset[];
		return assets.map(mapAssetJson);
	}),

	delete: perItem(async function (itemIndex) {
		const assetId = getRequiredId.call(this, 'assetLookupId', 'Asset ID', itemIndex);
		const confirm = this.getNodeParameter('deleteIfInUse', itemIndex, false) as boolean;
		const response = (await pinBridgeApiRequest.call(
			this,
			'DELETE',
			`/v1/assets/${encodeURIComponent(assetId)}`,
			{ confirm: confirm || undefined },
		)) as unknown as PinBridgeAssetDeleteResponse;
		return mapAssetDeleteJson(assetId, response);
	}),
};
