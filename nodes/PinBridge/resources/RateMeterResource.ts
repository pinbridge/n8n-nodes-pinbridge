import type { INodeProperties } from 'n8n-workflow';

import type { PinBridgeRateMeter } from '../ApiTypes';
import type { ResourceOperations } from '../GenericFunctions';
import { perItem, pinBridgeApiRequest } from '../GenericFunctions';
import { mapRateMeterJson } from '../Mappers';
import { accountField } from '../SharedFields';

export const rateMeterProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['rateMeter'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				action: 'Get rate meter status',
			},
		],
		default: 'get',
	},
	accountField({ resource: ['rateMeter'], operation: ['get'] }),
];

export const rateMeterOperations: ResourceOperations = {
	get: perItem(async function (itemIndex) {
		const rateMeter = (await pinBridgeApiRequest.call(this, 'GET', '/v1/rate-meter', {
			account_id: this.getNodeParameter('accountId', itemIndex) as string,
		})) as unknown as PinBridgeRateMeter;
		return mapRateMeterJson(rateMeter);
	}),
};
