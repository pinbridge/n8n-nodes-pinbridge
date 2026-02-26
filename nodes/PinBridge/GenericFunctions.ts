import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import type {
	PinBridgeHttpRequest,
	PinBridgeMethod,
	PinBridgeQuery,
} from '../../src/transport/PinBridgeClient';
import { PinBridgeApiError, PinBridgeClient } from '../../src/transport/PinBridgeClient';

type PinBridgeContext = IExecuteFunctions | ILoadOptionsFunctions;

interface PinBridgeCredentials {
	baseUrl: string;
	apiKey: string;
}

async function getPinBridgeCredentials(this: PinBridgeContext): Promise<PinBridgeCredentials> {
	const rawCredentials = await this.getCredentials('pinBridgeApi');
	const baseUrl = String(rawCredentials.baseUrl ?? '').trim();
	const apiKey = String(rawCredentials.apiKey ?? '').trim();

	if (!baseUrl) {
		throw new NodeOperationError(this.getNode(), 'PinBridge base URL is required in credentials.');
	}

	if (!apiKey) {
		throw new NodeOperationError(this.getNode(), 'PinBridge API key is required in credentials.');
	}

	return {
		baseUrl,
		apiKey,
	};
}

function buildNodeApiError(context: PinBridgeContext, error: PinBridgeApiError): NodeApiError {
	const errorDetails: string[] = [];

	if (error.statusCode !== undefined) {
		errorDetails.push(`HTTP ${error.statusCode}`);
	}
	if (error.requestId) {
		errorDetails.push(`request_id: ${error.requestId}`);
	}

	let description = `PinBridge request failed for ${error.method} ${error.path}`;
	if (errorDetails.length > 0) {
		description = `${description} (${errorDetails.join(', ')})`;
	}

	return new NodeApiError(
		context.getNode(),
		{
			message: error.message,
			detail: error.detail as JsonObject,
		} as JsonObject,
		{
			message: error.message,
			description,
		},
	);
}

export async function getPinBridgeClient(this: PinBridgeContext): Promise<PinBridgeClient> {
	const credentials = await getPinBridgeCredentials.call(this);

	return new PinBridgeClient({
		baseUrl: credentials.baseUrl,
		apiKey: credentials.apiKey,
		executor: async <TResponse = unknown>(request: PinBridgeHttpRequest): Promise<TResponse> => {
			const requestOptions: IHttpRequestOptions = {
				method: request.method,
				url: request.url,
				headers: request.headers,
			};

			if (request.body !== undefined) {
				requestOptions.body = request.body as IDataObject;
			}

			return (await this.helpers.httpRequest.call(this, requestOptions)) as TResponse;
		},
	});
}

export async function pinBridgeApiRequest<TResponse = IDataObject>(
	this: PinBridgeContext,
	method: PinBridgeMethod,
	path: string,
	query?: PinBridgeQuery,
	body?: IDataObject,
): Promise<TResponse> {
	const client = await getPinBridgeClient.call(this);

	try {
		return await client.request<TResponse>({
			method,
			path,
			query,
			body,
		});
	} catch (error) {
		if (error instanceof PinBridgeApiError) {
			throw buildNodeApiError(this, error);
		}

		throw new NodeApiError(this.getNode(), error as JsonObject, {
			description: `Unexpected PinBridge request error for ${method} ${path}`,
		});
	}
}
