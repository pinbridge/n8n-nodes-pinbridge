import assert from 'node:assert/strict';

import type {
	IDataObject,
	IHttpRequestOptions,
	INode,
	INodeExecutionData,
	INodeParameters,
	INodePropertyOptions,
} from 'n8n-workflow';
import { NodeHelpers } from 'n8n-workflow';

import { PinBridge } from '../nodes/PinBridge/PinBridge.node';

export interface RecordedFile {
	field: string;
	filename: string;
	type: string;
	size: number;
}

export interface RecordedRequest {
	method: string;
	path: string;
	query: Record<string, string>;
	body: unknown;
	files: RecordedFile[];
	options: IHttpRequestOptions;
}

export interface MockResponse {
	status?: number;
	body?: unknown;
	headers?: Record<string, string>;
}

/** Returns the response for a request: a MockResponse, or a bare body (status 200). */
export type Responder = (request: RecordedRequest) => MockResponse | unknown;

export interface RunOptions {
	/** Node parameters shared by every item (resource, operation, ...). */
	params: INodeParameters;
	/** Per-item parameter overrides, keyed by item index. */
	itemParams?: Record<number, INodeParameters>;
	items?: INodeExecutionData[];
	respond?: Responder;
	continueOnFail?: boolean;
	timezone?: string;
}

export interface RunResult {
	output: INodeExecutionData[];
	requests: RecordedRequest[];
}

const BASE_URL = 'https://api.test.pinbridge.io';
const nodeType = new PinBridge();

function isMockResponse(value: unknown): value is MockResponse {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		('status' in value || 'headers' in value) &&
		Object.keys(value).every((key) => ['status', 'body', 'headers'].includes(key))
	);
}

function resolveParameters(params: INodeParameters): INodeParameters {
	const resolved = NodeHelpers.getNodeParameters(
		nodeType.description.properties,
		params,
		true,
		false,
		{ typeVersion: 1 },
		nodeType.description,
	);
	assert.ok(resolved, 'n8n could not resolve the node parameters');
	return resolved;
}

function makeNode(parameters: INodeParameters): INode {
	return {
		id: 'node-1',
		name: 'PinBridge',
		type: 'n8n-nodes-pinbridge.pinBridge',
		typeVersion: 1,
		position: [0, 0],
		parameters,
	};
}

function recordFiles(formData: FormData): RecordedFile[] {
	const files: RecordedFile[] = [];
	formData.forEach((value, field) => {
		if (typeof value !== 'string') {
			const file = value as File;
			files.push({ field, filename: file.name, type: file.type, size: file.size });
		}
	});
	return files;
}

function makeHttpMock(requests: RecordedRequest[], respond: Responder) {
	return async (_credentialType: string, options: IHttpRequestOptions): Promise<unknown> => {
		const url = new URL(String(options.url));
		assert.equal(url.origin, BASE_URL, 'requests must go to the credential base URL');
		const isMultipart = options.body instanceof FormData;
		const request: RecordedRequest = {
			method: String(options.method ?? 'GET'),
			path: url.pathname,
			query: Object.fromEntries(url.searchParams.entries()),
			body: isMultipart ? undefined : options.body,
			files: isMultipart ? recordFiles(options.body as FormData) : [],
			options,
		};
		requests.push(request);

		const raw = respond(request);
		const response: MockResponse = isMockResponse(raw) ? raw : { body: raw };
		const status = response.status ?? 200;
		const body = response.body ?? (status === 204 ? '' : {});

		if (options.returnFullResponse) {
			if (status >= 400 && !options.ignoreHttpStatusErrors) {
				throw Object.assign(new Error(`Request failed with status code ${status}`), {
					httpCode: String(status),
				});
			}
			return { statusCode: status, headers: response.headers ?? {}, body };
		}
		if (status >= 400) {
			throw Object.assign(new Error(`Request failed with status code ${status}`), {
				httpCode: String(status),
			});
		}
		return body;
	};
}

/** Execute the PinBridge node the way n8n would, recording every HTTP request. */
export async function runNode(options: RunOptions): Promise<RunResult> {
	const items: INodeExecutionData[] = options.items ?? [{ json: {} }];
	const requests: RecordedRequest[] = [];
	const respond = options.respond ?? (() => ({}));
	const sharedParameters = resolveParameters(options.params);
	const node = makeNode(sharedParameters);

	const parametersFor = (itemIndex: number): INodeParameters => {
		const overrides = options.itemParams?.[itemIndex];
		return overrides ? resolveParameters({ ...options.params, ...overrides }) : sharedParameters;
	};

	const context = {
		getInputData: () => items,
		getNode: () => node,
		getTimezone: () => options.timezone ?? 'UTC',
		continueOnFail: () => options.continueOnFail ?? false,
		getCredentials: async () => ({ baseUrl: `${BASE_URL}/`, apiKey: 'pb_test_key' }),
		getNodeParameter: (name: string, itemIndex: number, fallbackValue?: unknown) => {
			const value = parametersFor(itemIndex)[name];
			if (value === undefined) {
				if (fallbackValue !== undefined) {
					return fallbackValue;
				}
				throw new Error(`Could not get parameter "${name}"`);
			}
			if (typeof value === 'string' && value.startsWith('=')) {
				throw new Error(`Parameter "${name}" is an unevaluated expression; set it in the test`);
			}
			return value;
		},
		helpers: {
			httpRequestWithAuthentication: makeHttpMock(requests, respond),
			getBinaryDataBuffer: async (itemIndex: number, propertyName: string) => {
				const binary = items[itemIndex].binary?.[propertyName];
				assert.ok(binary, `missing binary property ${propertyName}`);
				return Buffer.from(binary.data, 'base64');
			},
		},
	};

	const [output] = await nodeType.execute.call(context as never);
	return { output, requests };
}

/** Run a loadOptions method with the given current node parameters. */
export async function runLoadOptions(
	method: string,
	currentParameters: INodeParameters,
	respond: Responder,
): Promise<{ options: INodePropertyOptions[]; requests: RecordedRequest[] }> {
	const requests: RecordedRequest[] = [];
	const context = {
		getNode: () => makeNode(currentParameters),
		getCredentials: async () => ({ baseUrl: BASE_URL, apiKey: 'pb_test_key' }),
		getCurrentNodeParameter: (name: string) => currentParameters[name],
		helpers: { httpRequestWithAuthentication: makeHttpMock(requests, respond) },
	};
	const loader = nodeType.methods.loadOptions[method as keyof typeof nodeType.methods.loadOptions];
	assert.ok(loader, `unknown loadOptions method ${method}`);
	const options = await loader.call(context as never);
	return { options, requests };
}

/** Assert that `actual` contains every key/value of `expected` (recursively, arrays exact). */
export function assertIncludes(actual: unknown, expected: unknown, path = '$'): void {
	if (expected === null || typeof expected !== 'object' || Array.isArray(expected)) {
		assert.deepEqual(actual, expected, `mismatch at ${path}`);
		return;
	}
	assert.ok(
		actual !== null && typeof actual === 'object' && !Array.isArray(actual),
		`expected an object at ${path}`,
	);
	for (const [key, value] of Object.entries(expected as IDataObject)) {
		assertIncludes((actual as IDataObject)[key], value, `${path}.${key}`);
	}
}

export function binaryItem(
	fileName: string,
	mimeType: string,
	content = 'file-content',
): INodeExecutionData {
	return {
		json: {},
		binary: {
			data: { data: Buffer.from(content).toString('base64'), mimeType, fileName },
		},
	};
}
