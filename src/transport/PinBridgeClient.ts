import type FormData from 'form-data';

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

export type PinBridgeRequestExecutor = <TResponse = unknown>(
	request: PinBridgeHttpRequest,
) => Promise<TResponse>;

export interface PinBridgeClientConfig {
	baseUrl: string;
	apiKey: string;
	executor: PinBridgeRequestExecutor;
}

interface PinBridgeApiErrorContext {
	method: PinBridgeMethod;
	path: string;
	statusCode?: number;
	detail?: unknown;
	requestId?: string;
}

export class PinBridgeApiError extends Error {
	readonly method: PinBridgeMethod;
	readonly path: string;
	readonly statusCode?: number;
	readonly detail?: unknown;
	readonly requestId?: string;

	constructor(message: string, context: PinBridgeApiErrorContext) {
		super(message);
		this.name = 'PinBridgeApiError';
		this.method = context.method;
		this.path = context.path;
		this.statusCode = context.statusCode;
		this.detail = context.detail;
		this.requestId = context.requestId;
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
	return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	if (typeof value === 'number') {
		return value;
	}
	if (typeof value === 'string') {
		const parsed = Number(value);
		return Number.isNaN(parsed) ? undefined : parsed;
	}
	return undefined;
}

function extractMessage(detail: unknown): string | undefined {
	if (typeof detail === 'string' && detail.trim()) {
		return detail;
	}

	if (Array.isArray(detail) && detail.length > 0) {
		const first = asRecord(detail[0]);
		const message = first ? asString(first.msg) : undefined;
		if (message) {
			return message;
		}
	}

	const detailRecord = asRecord(detail);
	if (!detailRecord) {
		return undefined;
	}

	const nestedError = asRecord(detailRecord.error);
	const nestedMessage = nestedError ? asString(nestedError.message) : undefined;
	if (nestedMessage) {
		return nestedMessage;
	}

	const directMessage = asString(detailRecord.message);
	if (directMessage) {
		return directMessage;
	}

	return undefined;
}

function extractRequestId(response: Record<string, unknown> | undefined): string | undefined {
	const headers = asRecord(response?.headers);
	if (!headers) {
		return undefined;
	}

	const requestId = headers['x-request-id'] ?? headers['X-Request-ID'];
	if (Array.isArray(requestId)) {
		return asString(requestId[0]);
	}
	return asString(requestId);
}

function errorFromUnknown(error: unknown, method: PinBridgeMethod, path: string): PinBridgeApiError {
	const fallbackMessage = `PinBridge request failed (${method} ${path})`;
	const errorRecord = asRecord(error);
	const response = asRecord(errorRecord?.response);
	const detail = response?.body ?? errorRecord?.body ?? errorRecord?.error;
	const statusCode =
		asNumber(errorRecord?.statusCode) ?? asNumber(response?.statusCode) ?? undefined;
	const message =
		extractMessage(detail) ??
		asString(errorRecord?.message) ??
		asString(errorRecord?.name) ??
		fallbackMessage;
	const requestId = extractRequestId(response);

	return new PinBridgeApiError(message, {
		method,
		path,
		statusCode,
		detail,
		requestId,
	});
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
			'X-API-Key': this.config.apiKey,
			...options.headers,
		};

		if (options.body !== undefined) {
			headers['Content-Type'] = 'application/json';
		}

		try {
			return await this.config.executor<TResponse>({
				method: options.method,
				url: url.toString(),
				headers,
				body: options.body,
				formData: options.formData,
			});
		} catch (error) {
			throw errorFromUnknown(error, options.method, options.path);
		}
	}
}
