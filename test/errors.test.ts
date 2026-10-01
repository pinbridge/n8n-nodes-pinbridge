import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NodeApiError } from 'n8n-workflow';

import { PIN_ID } from './fixtures';
import { runNode } from './harness';

const conflict = {
	status: 409,
	headers: { 'x-request-id': 'req-header' },
	body: {
		detail: { message: 'legacy', code: 'pin_already_published' },
		error: {
			code: 'pin_already_published',
			message: 'This pin is already published on Pinterest and cannot be edited.',
			remediation: 'Delete the pin and publish a corrected one.',
			request_id: 'req-123',
		},
	},
};

const updateParams = {
	resource: 'pins',
	operation: 'update',
	pinId: PIN_ID,
	pinUpdateFields: { title: 'x' },
};

describe('API errors', () => {
	it('surface the error envelope message, remediation and code', async () => {
		const error = await runNode({ params: updateParams, respond: () => conflict }).then(
			() => assert.fail('expected the node to throw'),
			(thrown: unknown) => thrown,
		);
		assert.ok(error instanceof NodeApiError);
		assert.equal(error.message, 'This pin is already published on Pinterest and cannot be edited.');
		assert.equal(error.httpCode, '409');
		assert.match(String(error.description), /^Delete the pin and publish a corrected one\./);
		assert.match(String(error.description), /code: pin_already_published/);
		assert.match(String(error.description), /request_id: req-123/);
		assert.equal(error.context.itemIndex, 0);
	});

	it('add the code and hints to continue-on-fail items', async () => {
		const { output } = await runNode({
			params: updateParams,
			continueOnFail: true,
			respond: () => conflict,
		});
		assert.deepEqual(output[0].json, {
			error: 'This pin is already published on Pinterest and cannot be edited.',
			itemIndex: 0,
			errorCode: 'pin_already_published',
			remediation: 'Delete the pin and publish a corrected one.',
			statusCode: 409,
			requestId: 'req-123',
		});
	});

	it('fall back to a legacy string detail and the request id header', async () => {
		const { output } = await runNode({
			params: { resource: 'pins', operation: 'get', pinId: PIN_ID },
			continueOnFail: true,
			respond: () => ({
				status: 404,
				headers: { 'X-Request-ID': 'req-header' },
				body: { detail: 'Pin not found' },
			}),
		});
		assert.deepEqual(output[0].json, {
			error: 'Pin not found',
			itemIndex: 0,
			statusCode: 404,
			requestId: 'req-header',
		});
	});

	it('read validation errors from a FastAPI detail list', async () => {
		const { output } = await runNode({
			params: { resource: 'pins', operation: 'get', pinId: PIN_ID },
			continueOnFail: true,
			respond: () => ({
				status: 422,
				body: { detail: [{ loc: ['path', 'pin_id'], msg: 'Input should be a valid UUID' }] },
			}),
		});
		assert.equal(output[0].json.error, 'Input should be a valid UUID');
	});

	it('describe non-JSON error bodies with the status code', async () => {
		const { output } = await runNode({
			params: { resource: 'pins', operation: 'get', pinId: PIN_ID },
			continueOnFail: true,
			respond: () => ({ status: 502, body: 'error code: 502' }),
		});
		assert.equal(output[0].json.error, `PinBridge returned HTTP 502 for GET /v1/pins/${PIN_ID}`);
		assert.equal(output[0].json.statusCode, 502);
	});

	it('wrap transport failures', async () => {
		const { output } = await runNode({
			params: { resource: 'pins', operation: 'get', pinId: PIN_ID },
			continueOnFail: true,
			respond: () => {
				throw new Error('getaddrinfo ENOTFOUND api.test.pinbridge.io');
			},
		});
		assert.equal(typeof output[0].json.error, 'string');
		assert.equal(output[0].json.itemIndex, 0);
	});

	it('stop the workflow on the failing item when continue-on-fail is off', async () => {
		let calls = 0;
		const error = await runNode({
			params: { resource: 'pins', operation: 'get', pinId: PIN_ID },
			items: [{ json: {} }, { json: {} }, { json: {} }],
			respond: () => (++calls === 2 ? { status: 404, body: { detail: 'gone' } } : {}),
		}).then(
			() => assert.fail('expected the node to throw'),
			(thrown: unknown) => thrown,
		);
		assert.ok(error instanceof NodeApiError);
		assert.equal(error.context.itemIndex, 1);
		assert.equal(calls, 2);
	});
});
