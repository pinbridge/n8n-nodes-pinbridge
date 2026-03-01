import type { ICredentialType, IHttpRequestMethods, INodeProperties } from 'n8n-workflow';

export class PinBridgeApi implements ICredentialType {
	name = 'pinBridgeApi';
	displayName = 'PinBridge API Key';
	documentationUrl = 'https://docs.n8n.io/integrations/creating-nodes/';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.pinbridge.io',
			required: true,
			placeholder: 'https://api.pinbridge.io',
			description:
				'PinBridge API base URL. Use the hosted API endpoint or your self-hosted PinBridge API URL.',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'PinBridge API key sent in the X-API-Key header',
		},
	];

	authenticate = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	} as const;

	test = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/v1/pinterest/accounts',
			method: 'GET' as IHttpRequestMethods,
		},
	};
}
