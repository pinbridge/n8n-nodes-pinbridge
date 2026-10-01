import type {
	IAllExecuteFunctions,
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INode,
	INodeExecutionData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import type {
	PinBridgeHttpRequest,
	PinBridgeHttpResponse,
	PinBridgeMethod,
	PinBridgeQuery,
} from '../../src/transport/PinBridgeClient';
import { PinBridgeApiError, PinBridgeClient } from '../../src/transport/PinBridgeClient';

type PinBridgeContext = IExecuteFunctions | ILoadOptionsFunctions;

interface PinBridgeCredentials {
	baseUrl: string;
}

/** PinBridge error fields (code, remediation, ...) kept for continue-on-fail output. */
const apiErrorDetails = new WeakMap<object, IDataObject>();

async function getPinBridgeCredentials(this: PinBridgeContext): Promise<PinBridgeCredentials> {
	const rawCredentials = await this.getCredentials('pinBridgeApi');
	const baseUrl = String(rawCredentials.baseUrl ?? '').trim();

	if (!baseUrl) {
		throw new NodeOperationError(this.getNode(), 'PinBridge base URL is required in credentials.');
	}

	return {
		baseUrl,
	};
}

function buildNodeApiError(context: PinBridgeContext, error: PinBridgeApiError): NodeApiError {
	const facts: string[] = [];
	if (error.code) {
		facts.push(`code: ${error.code}`);
	}
	if (error.statusCode !== undefined) {
		facts.push(`HTTP ${error.statusCode}`);
	}
	if (error.requestId) {
		facts.push(`request_id: ${error.requestId}`);
	}

	const request = `${error.method} ${error.path}${facts.length > 0 ? ` (${facts.join(', ')})` : ''}`;
	const description = error.remediation ? `${error.remediation}\n${request}` : request;

	const nodeError = new NodeApiError(
		context.getNode(),
		{
			message: error.message,
			code: error.code ?? null,
			remediation: error.remediation ?? null,
			requestId: error.requestId ?? null,
			detail: error.detail as JsonObject,
		} as JsonObject,
		{
			message: error.message,
			description,
			httpCode: error.statusCode !== undefined ? String(error.statusCode) : undefined,
		},
	);

	const details: IDataObject = {};
	if (error.code) {
		details.errorCode = error.code;
	}
	if (error.remediation) {
		details.remediation = error.remediation;
	}
	if (error.statusCode !== undefined) {
		details.statusCode = error.statusCode;
	}
	if (error.requestId) {
		details.requestId = error.requestId;
	}
	apiErrorDetails.set(nodeError, details);
	return nodeError;
}

export async function getPinBridgeClient(this: PinBridgeContext): Promise<PinBridgeClient> {
	const credentials = await getPinBridgeCredentials.call(this);

	return new PinBridgeClient({
		baseUrl: credentials.baseUrl,
		executor: async (request: PinBridgeHttpRequest): Promise<PinBridgeHttpResponse> => {
			const requestOptions: IHttpRequestOptions = {
				method: request.method,
				url: request.url,
				headers: request.headers,
				// Read 4xx/5xx bodies ourselves so the API's error envelope reaches the user.
				ignoreHttpStatusErrors: true,
				returnFullResponse: true,
			};

			if (request.body !== undefined) {
				requestOptions.body = request.body as IDataObject | IDataObject[];
			}
			if (request.formData !== undefined) {
				requestOptions.body = request.formData;
			}

			const response = (await this.helpers.httpRequestWithAuthentication.call(
				this as IAllExecuteFunctions,
				'pinBridgeApi',
				requestOptions,
			)) as { statusCode: number; headers?: Record<string, unknown>; body?: unknown };

			return {
				statusCode: response.statusCode,
				headers: response.headers ?? {},
				body: response.body,
			};
		},
	});
}

async function sendRequest<TResponse>(
	context: PinBridgeContext,
	method: PinBridgeMethod,
	path: string,
	options: { query?: PinBridgeQuery; body?: unknown; formData?: FormData },
): Promise<TResponse> {
	const client = await getPinBridgeClient.call(context);

	try {
		return await client.request<TResponse>({ method, path, ...options });
	} catch (error) {
		if (error instanceof PinBridgeApiError) {
			throw buildNodeApiError(context, error);
		}

		throw new NodeApiError(context.getNode(), error as JsonObject, {
			description: `Unexpected PinBridge request error for ${method} ${path}`,
		});
	}
}

export async function pinBridgeApiRequest<TResponse = IDataObject>(
	this: PinBridgeContext,
	method: PinBridgeMethod,
	path: string,
	query?: PinBridgeQuery,
	body?: IDataObject | IDataObject[],
): Promise<TResponse> {
	return await sendRequest<TResponse>(this, method, path, { query, body });
}

export async function pinBridgeMultipartRequest<TResponse = IDataObject>(
	this: PinBridgeContext,
	method: PinBridgeMethod,
	path: string,
	formData: FormData,
	query?: PinBridgeQuery,
): Promise<TResponse> {
	return await sendRequest<TResponse>(this, method, path, { query, formData });
}

export interface PaginationOptions<TRecord> {
	returnAll: boolean;
	limit: number;
	/** Largest `limit` the endpoint accepts. */
	maxPageSize: number;
	/** Page size used when returning everything. */
	pageSize?: number;
	/** Pull the records out of a page; defaults to the page itself (a JSON array). */
	extract?: (page: unknown) => TRecord[];
}

/** Page through a `limit`/`offset` list endpoint. */
export async function pinBridgeApiRequestAllItems<TRecord>(
	this: IExecuteFunctions,
	path: string,
	query: PinBridgeQuery,
	options: PaginationOptions<TRecord>,
): Promise<TRecord[]> {
	const extract = options.extract ?? ((page: unknown) => page as TRecord[]);
	const pageSize = Math.min(options.pageSize ?? 100, options.maxPageSize);
	const results: TRecord[] = [];
	let offset = 0;

	for (;;) {
		const remaining = options.limit - results.length;
		if (!options.returnAll && remaining <= 0) {
			break;
		}

		const pageLimit = options.returnAll ? pageSize : Math.min(remaining, options.maxPageSize);
		const page = extract(
			await pinBridgeApiRequest.call(this, 'GET', path, { ...query, limit: pageLimit, offset }),
		);

		results.push(...page);
		if (page.length < pageLimit) {
			break;
		}
		offset += page.length;
	}

	return results;
}

/** Read the standard Return All / Limit pair. */
export function getListLimits(
	this: IExecuteFunctions,
	itemIndex: number,
): { returnAll: boolean; limit: number } {
	return {
		returnAll: this.getNodeParameter('returnAll', itemIndex) as boolean,
		limit: this.getNodeParameter('limit', itemIndex, 50) as number,
	};
}

export function parseCsvList(value: string): string[] {
	return value
		.split(',')
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);
}

export function hasExplicitTimezoneOffset(value: string): boolean {
	return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
}

function timeZoneOffsetMs(utcMs: number, timeZone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).formatToParts(new Date(utcMs));
	const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
	const wallClockAsUtc = Date.UTC(
		part('year'),
		part('month') - 1,
		part('day'),
		part('hour'),
		part('minute'),
		part('second'),
	);
	return wallClockAsUtc - (utcMs - (((utcMs % 1000) + 1000) % 1000));
}

/**
 * Text of a date or date-time parameter. Expressions can hand over a JS Date or a Luxon
 * DateTime instead of a string; a Date becomes ISO 8601, a DateTime stringifies to ISO.
 */
export function dateParameterText(value: unknown): string {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? '' : value.toISOString();
	}
	return value === undefined || value === null ? '' : String(value).trim();
}

/**
 * Give a timestamp an explicit offset. n8n's date picker produces wall-clock values
 * without one ("2026-10-01T09:00:00"); those are read in `timeZone` (the workflow's
 * time zone). Values that already carry an offset are returned unchanged.
 */
export function toTimestampWithOffset(value: string, timeZone: string): string {
	const trimmed = value.trim();
	if (hasExplicitTimezoneOffset(trimmed)) {
		return trimmed;
	}

	const match =
		/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?$/.exec(trimmed);
	if (!match) {
		return trimmed;
	}

	const [, year, month, day, hour = '0', minute = '0', second = '0', millis = '0'] = match;
	const wallClockAsUtc = Date.UTC(
		Number(year),
		Number(month) - 1,
		Number(day),
		Number(hour),
		Number(minute),
		Number(second),
		Number(millis.padEnd(3, '0')),
	);
	// Two passes so a wall-clock time next to a DST switch lands on the right offset.
	const firstGuess = wallClockAsUtc - timeZoneOffsetMs(wallClockAsUtc, timeZone);
	const utcMs = wallClockAsUtc - timeZoneOffsetMs(firstGuess, timeZone);
	return new Date(utcMs).toISOString();
}

/** Reduce a date or date-time parameter to the YYYY-MM-DD the analytics endpoints take. */
export function toDateOnly(
	this: IExecuteFunctions,
	value: unknown,
	parameterLabel: string,
	itemIndex: number,
): string | undefined {
	const trimmed = dateParameterText(value);
	if (!trimmed) {
		return undefined;
	}
	const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
	if (!match) {
		throw new NodeOperationError(
			this.getNode(),
			`${parameterLabel} must be a date such as 2026-09-01 (got "${trimmed}")`,
			{ itemIndex },
		);
	}
	return match[1];
}

/** Read a required ID parameter and fail with a clear message when it is empty. */
export function getRequiredId(
	this: IExecuteFunctions,
	parameterName: string,
	label: string,
	itemIndex: number,
): string {
	const value = String(this.getNodeParameter(parameterName, itemIndex) ?? '').trim();
	if (!value) {
		throw new NodeOperationError(this.getNode(), `${label} is required`, { itemIndex });
	}
	return value;
}

/** Build the multipart body for an upload from an incoming binary property. */
export async function getBinaryFormData(
	this: IExecuteFunctions,
	itemIndex: number,
	fallbackFilename: string,
	fallbackMimeType: string,
): Promise<FormData> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
	const binaryData = this.getInputData()[itemIndex]?.binary?.[binaryPropertyName];
	if (!binaryData) {
		throw new NodeOperationError(
			this.getNode(),
			`Binary property '${binaryPropertyName}' is required`,
			{ itemIndex },
		);
	}

	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const formData = new FormData();
	formData.append(
		'file',
		new Blob([buffer], { type: binaryData.mimeType || fallbackMimeType }),
		binaryData.fileName || fallbackFilename,
	);
	return formData;
}

/**
 * How an operation consumes its input items.
 *
 * - `perItem`: once per input item; outputs pair with that item.
 * - `once`: a single call with the first item's parameters (list operations).
 * - `allItems`: one call that receives every item and pairs its own output.
 */
type ItemRun = (this: IExecuteFunctions, itemIndex: number) => Promise<IDataObject | IDataObject[]>;
type AllItemsRun = (
	this: IExecuteFunctions,
	items: INodeExecutionData[],
) => Promise<INodeExecutionData[]>;

export type PinBridgeOperation =
	| { mode: 'perItem' | 'once'; run: ItemRun }
	| { mode: 'allItems'; run: AllItemsRun };

export type ResourceOperations = Record<string, PinBridgeOperation>;

export function perItem(run: ItemRun): PinBridgeOperation {
	return { mode: 'perItem', run };
}

export function once(run: ItemRun): PinBridgeOperation {
	return { mode: 'once', run };
}

export function allItems(run: AllItemsRun): PinBridgeOperation {
	return { mode: 'allItems', run };
}

/** Return a NodeApiError/NodeOperationError for any thrown value, tagged with the item index. */
export function toNodeError(
	node: INode,
	error: unknown,
	itemIndex?: number,
): NodeApiError | NodeOperationError {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) {
		if (itemIndex !== undefined && error.context.itemIndex === undefined) {
			error.context.itemIndex = itemIndex;
		}
		return error;
	}
	return new NodeOperationError(node, error as Error, { itemIndex });
}

/** JSON for a continue-on-fail error item: the message plus PinBridge's error code and hints. */
export function errorItemJson(error: unknown, itemIndex: number): IDataObject {
	const message = error instanceof Error ? error.message : String(error);
	const details = error instanceof Object ? apiErrorDetails.get(error) : undefined;
	return { error: message, itemIndex, ...details };
}
