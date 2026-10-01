import type { INodeProperties } from 'n8n-workflow';

import type { PinBridgeRelatedTermsResponse } from '../ApiTypes';
import type { ResourceOperations } from '../GenericFunctions';
import { perItem, pinBridgeApiRequest } from '../GenericFunctions';
import { mapRelatedTermsJson } from '../Mappers';
import { accountField } from '../SharedFields';

const show = (operation: string[]) => ({ resource: ['terms'], operation });

export const termProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['terms'] } },
		options: [
			{
				name: 'List Related',
				value: 'listRelated',
				action: 'List related terms',
			},
		],
		default: 'listRelated',
	},
	accountField(show(['listRelated'])),
	{
		displayName: 'Terms',
		name: 'termsInput',
		type: 'string',
		displayOptions: { show: show(['listRelated']) },
		default: '',
		required: true,
		description: 'One or more terms to look up. Separate multiple values with commas.',
	},
	{
		displayName: 'Exact Match',
		name: 'exactMatch',
		type: 'boolean',
		displayOptions: { show: show(['listRelated']) },
		default: false,
		description:
			'Whether to keep only groups whose returned term exactly matches one requested term',
	},
];

export const termOperations: ResourceOperations = {
	listRelated: perItem(async function (itemIndex) {
		const response = (await pinBridgeApiRequest.call(this, 'GET', '/v1/pinterest/terms/related', {
			account_id: this.getNodeParameter('accountId', itemIndex) as string,
			terms: this.getNodeParameter('termsInput', itemIndex) as string,
			exact_match: this.getNodeParameter('exactMatch', itemIndex, false) as boolean,
		})) as PinBridgeRelatedTermsResponse;
		return (response.related_terms_list ?? []).map((group) => mapRelatedTermsJson(response, group));
	}),
};
