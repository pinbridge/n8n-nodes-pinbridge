export type PinBridgeMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface PinBridgeQuery {
	[key: string]: string | number | boolean | null | undefined;
}

export interface PinBridgeRequestOptions {
	method: PinBridgeMethod;
	path: string;
	query?: PinBridgeQuery;
	body?: unknown;
	formData?: FormData;
	headers?: Record<string, string>;
}

export interface PinBridgeHttpRequest {
	method: PinBridgeMethod;
	url: string;
	headers: Record<string, string>;
	body?: unknown;
	formData?: FormData;
}

/** Raw HTTP response. Executors must resolve for every status code, including 4xx/5xx. */
export interface PinBridgeHttpResponse {
	statusCode: number;
	headers: Record<string, unknown>;
	body: unknown;
}

export type PinBridgeRequestExecutor = (
	request: PinBridgeHttpRequest,
) => Promise<PinBridgeHttpResponse>;

export interface PinBridgeClientConfig {
	baseUrl: string;
	executor: PinBridgeRequestExecutor;
}

interface PinBridgeApiErrorContext {
	method: PinBridgeMethod;
	path: string;
	statusCode?: number;
	code?: string;
	remediation?: string;
	requestId?: string;
	detail?: unknown;
}

/**
 * A failed PinBridge call. `code`, `remediation` and `requestId` come from the API's
 * documented error envelope (`{"error": {"code", "message", "remediation", "request_id"}}`).
 */
export class PinBridgeApiError extends Error {
	readonly method: PinBridgeMethod;
	readonly path: string;
	readonly statusCode?: number;
	readonly code?: string;
	readonly remediation?: string;
	readonly requestId?: string;
	readonly detail?: unknown;

	constructor(message: string, context: PinBridgeApiErrorContext) {
		super(message);
		this.name = 'PinBridgeApiError';
		this.method = context.method;
		this.path = context.path;
		this.statusCode = context.statusCode;
		this.code = context.code;
		this.remediation = context.remediation;
		this.requestId = context.requestId;
		this.detail = context.detail;
	}
}

function normalizeBaseUrl(baseUrl: string): string {
	return baseUrl.replace(/\/+$/, '');
}

function appendQuery(url: URL, query: PinBridgeQuery): void {
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === null || value === '') {
			continue;
		}
		url.searchParams.set(key, String(value));
	}
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value : undefined;
}

/** Message from a legacy FastAPI `detail`: a string, a validation list, or a nested object. */
function extractLegacyMessage(detail: unknown): string | undefined {
	if (typeof detail === 'string') {
		return asString(detail);
	}

	if (Array.isArray(detail) && detail.length > 0) {
		const first = asRecord(detail[0]);
		return first ? asString(first.msg) : undefined;
	}

	const detailRecord = asRecord(detail);
	if (!detailRecord) {
		return undefined;
	}

	const nestedError = asRecord(detailRecord.error);
	return (nestedError && asString(nestedError.message)) ?? asString(detailRecord.message);
}

function headerValue(headers: Record<string, unknown>, name: string): string | undefined {
	const match = Object.keys(headers).find((key) => key.toLowerCase() === name);
	const value = match ? headers[match] : undefined;
	return asString(Array.isArray(value) ? value[0] : value);
}

function errorFromResponse(
	response: PinBridgeHttpResponse,
	method: PinBridgeMethod,
	path: string,
): PinBridgeApiError {
	const body = asRecord(response.body);
	const envelope = asRecord(body?.error);
	const message =
		(envelope && asString(envelope.message)) ??
		extractLegacyMessage(body?.detail) ??
		extractLegacyMessage(body) ??
		`PinBridge returned HTTP ${response.statusCode} for ${method} ${path}`;

	return new PinBridgeApiError(message, {
		method,
		path,
		statusCode: response.statusCode,
		code: envelope ? asString(envelope.code) : undefined,
		remediation: envelope ? asString(envelope.remediation) : undefined,
		requestId:
			(envelope && asString(envelope.request_id)) ??
			headerValue(response.headers, 'x-request-id'),
		detail: response.body,
	});
}

/** Wrap a transport failure (network error, timeout, ...) that produced no HTTP response. */
function errorFromUnknown(error: unknown, method: PinBridgeMethod, path: string): PinBridgeApiError {
	const errorRecord = asRecord(error);
	const message =
		asString(errorRecord?.message) ??
		asString(errorRecord?.name) ??
		`PinBridge request failed (${method} ${path})`;

	return new PinBridgeApiError(message, { method, path, detail: errorRecord?.cause });
}

export class PinBridgeClient {
	private readonly baseUrl: string;

	constructor(private readonly config: PinBridgeClientConfig) {
		this.baseUrl = normalizeBaseUrl(config.baseUrl);
	}

	async request<TResponse = unknown>(options: PinBridgeRequestOptions): Promise<TResponse> {
		const url = new URL(`${this.baseUrl}${options.path}`);
		if (options.query) {
			appendQuery(url, options.query);
		}

		const headers: Record<string, string> = {
			Accept: 'application/json',
			...options.headers,
		};

		if (options.body !== undefined) {
			headers['Content-Type'] = 'application/json';
		}

		let response: PinBridgeHttpResponse;
		try {
			response = await this.config.executor({
				method: options.method,
				url: url.toString(),
				headers,
				body: options.body,
				formData: options.formData,
			});
		} catch (error) {
			throw errorFromUnknown(error, options.method, options.path);
		}

		if (response.statusCode >= 400) {
			throw errorFromResponse(response, options.method, options.path);
		}
		return response.body as TResponse;
	}
}
