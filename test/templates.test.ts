import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	ACCOUNT_ID,
	ASSET_ID,
	BOARD_ID,
	PIN_ID,
	SCHEDULE_ID,
	TEMPLATE_ID,
	pinRecord,
	scheduleRecord,
	templateRecord,
} from './fixtures';
import { assertIncludes, runLoadOptions, runNode } from './harness';

const drawParams = {
	resource: 'templates',
	templateId: TEMPLATE_ID,
	templateInputs: '{"title": "Pineapple Salsa", "photo_top": "https://cdn.example.com/top.jpg"}',
	accountId: ACCOUNT_ID,
	boardId: BOARD_ID,
	title: 'Pineapple Salsa',
	idempotencyKey: 'key-0',
};

describe('templates', () => {
	it('publish pin sends the template, its inputs and the pin fields to POST /v1/pins', async () => {
		const { requests, output } = await runNode({
			params: {
				...drawParams,
				operation: 'publishPin',
				description: 'Fresh and quick',
				linkUrl: 'https://example.com/salsa',
				templateOptions: { version: 3 },
			},
			respond: () =>
				pinRecord({ asset_id: ASSET_ID, template_id: TEMPLATE_ID, template_version: 3 }),
		});
		assert.equal(requests.length, 1);
		assert.deepEqual(requests[0].body, {
			account_id: ACCOUNT_ID,
			board_id: BOARD_ID,
			title: 'Pineapple Salsa',
			template_id: TEMPLATE_ID,
			template_inputs: { title: 'Pineapple Salsa', photo_top: 'https://cdn.example.com/top.jpg' },
			template_version: 3,
			description: 'Fresh and quick',
			link_url: 'https://example.com/salsa',
			idempotency_key: 'key-0',
		});
		assertIncludes(requests[0], { method: 'POST', path: '/v1/pins' });
		assertIncludes(output[0].json, {
			id: PIN_ID,
			assetId: ASSET_ID,
			templateId: TEMPLATE_ID,
			templateVersion: 3,
		});
	});

	it('publish pin never sends a size, and leaves the version out when it is not set', async () => {
		// A workflow saved before 1.4.1 may still carry the old Size option.
		const { requests } = await runNode({
			params: { ...drawParams, operation: 'publishPin', templateOptions: { size: 'pin_1x2' } },
			respond: () => pinRecord(),
		});
		const body = requests[0].body as Record<string, unknown>;
		assert.ok(!('template_size' in body));
		assert.ok(!('template_version' in body));
	});

	it('takes the inputs as an object too, as an expression gives them', async () => {
		const { requests } = await runNode({
			params: { ...drawParams, operation: 'publishPin', templateInputs: { title: 'From an expression' } },
			respond: () => pinRecord(),
		});
		assert.deepEqual((requests[0].body as Record<string, unknown>).template_inputs, {
			title: 'From an expression',
		});
	});

	it('refuses inputs that are not a JSON object, before calling the API', async () => {
		for (const templateInputs of ['{"title": ', '["a"]']) {
			const { requests, output } = await runNode({
				params: { ...drawParams, operation: 'publishPin', templateInputs },
				continueOnFail: true,
			});
			assert.equal(requests.length, 0);
			assert.match(String(output[0].json.error), /Template Inputs must be/);
		}
	});

	it('create schedule sends run_at with the template to POST /v1/schedules', async () => {
		const { requests, output } = await runNode({
			params: { ...drawParams, operation: 'createSchedule', runAt: '2026-12-01T09:00:00' },
			timezone: 'Europe/Paris',
			respond: () => scheduleRecord({ template_id: TEMPLATE_ID, template_version: 1 }),
		});
		assertIncludes(requests[0], {
			method: 'POST',
			path: '/v1/schedules',
			body: {
				run_at: '2026-12-01T08:00:00.000Z',
				template_id: TEMPLATE_ID,
				template_inputs: { title: 'Pineapple Salsa', photo_top: 'https://cdn.example.com/top.jpg' },
			},
		});
		assert.ok(!('idempotency_key' in (requests[0].body as Record<string, unknown>)));
		assertIncludes(output[0].json, { id: SCHEDULE_ID, templateId: TEMPLATE_ID, templateVersion: 1 });
	});

	it('get returns the inputs with their limits and the sample inputs', async () => {
		const { requests, output } = await runNode({
			params: { resource: 'templates', operation: 'get', templateId: TEMPLATE_ID },
			respond: () =>
				templateRecord({
					definition: {
						inputs: {
							title: { type: 'text', label: 'Title', required: true, max_length: 35 },
							photo_top: { type: 'image', label: 'Top photo', required: true },
						},
					},
					sample_inputs: { title: 'Pineapple Salsa' },
				}),
		});
		assertIncludes(requests[0], { method: 'GET', path: `/v1/templates/${TEMPLATE_ID}` });
		assertIncludes(output[0].json, {
			id: TEMPLATE_ID,
			name: 'Ruled band',
			source: 'gallery',
			pinsCount: 5,
			sampleInputs: { title: 'Pineapple Salsa' },
		});
		assert.deepEqual(output[0].json.inputs, [
			{ name: 'title', type: 'text', label: 'Title', required: true, minLength: null, maxLength: 35, min: null, max: null },
			{ name: 'photo_top', type: 'image', label: 'Top photo', required: true, minLength: null, maxLength: null, min: null, max: null },
		]);
	});

	it('list pages through the templates with the source and search filters', async () => {
		const { requests, output } = await runNode({
			params: {
				resource: 'templates',
				operation: 'list',
				templateSource: 'workspace',
				templateSearch: 'salsa',
				returnAll: false,
				limit: 2,
			},
			respond: () => [templateRecord(), templateRecord({ id: 'second', source: 'workspace' })],
		});
		assertIncludes(requests[0], {
			method: 'GET',
			path: '/v1/templates',
			query: { source: 'workspace', q: 'salsa', sort: 'name', limit: '2', offset: '0' },
		});
		assert.equal(output.length, 2);
		assert.ok(!('inputs' in output[0].json));
	});

	it('lists templates to pick from, marking gallery ones', async () => {
		const { options, requests } = await runLoadOptions('getTemplates', {}, () => [
			templateRecord(),
			templateRecord({ id: 'mine', name: 'My card', source: 'workspace', description: null }),
		]);
		assertIncludes(requests[0], { path: '/v1/templates', query: { sort: 'name', limit: '200' } });
		assert.deepEqual(options, [
			{ name: 'Ruled band (gallery)', value: TEMPLATE_ID, description: 'Two photos and a title band' },
			{ name: 'My card', value: 'mine', description: undefined },
		]);
	});
});
