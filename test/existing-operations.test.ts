/**
 * Characterization tests for the operations shipped up to 1.2.x.
 *
 * Saved workflows keep only the parameters that differ from their defaults, so the
 * requests these operations send (and the output keys they emit) must not change.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	ACCOUNT_ID,
	ASSET_ID,
	BOARD_ID,
	IMPORT_ID,
	PIN_ID,
	SCHEDULE_ID,
	WEBHOOK_ID,
	accountRecord,
	assetRecord,
	importJobRecord,
	pinRecord,
	scheduleRecord,
	webhookRecord,
} from './fixtures';
import { assertIncludes, binaryItem, runLoadOptions, runNode } from './harness';

describe('boards', () => {
	it('list sends account_id and maps boards', async () => {
		const { output, requests } = await runNode({
			params: { resource: 'boards', operation: 'list', accountId: ACCOUNT_ID },
			respond: () => [
				{ id: BOARD_ID, name: 'Soups', description: null, privacy: 'PUBLIC' },
				{ id: '2', name: 'Salads' },
			],
		});
		assert.equal(requests.length, 1);
		assertIncludes(requests[0], {
			method: 'GET',
			path: '/v1/pinterest/boards',
			query: { account_id: ACCOUNT_ID },
		});
		assert.equal(output.length, 2);
		assertIncludes(output[0].json, {
			id: BOARD_ID,
			name: 'Soups',
			description: null,
			privacy: 'PUBLIC',
		});
		assert.deepEqual(output[0].pairedItem, { item: 0 });
	});

	it('list honours returnAll=false and limit', async () => {
		const { output } = await runNode({
			params: {
				resource: 'boards',
				operation: 'list',
				accountId: ACCOUNT_ID,
				returnAll: false,
				limit: 1,
			},
			respond: () => [
				{ id: '1', name: 'A' },
				{ id: '2', name: 'B' },
			],
		});
		assert.equal(output.length, 1);
	});

	it('create posts name, description and privacy', async () => {
		const { requests } = await runNode({
			params: {
				resource: 'boards',
				operation: 'create',
				accountId: ACCOUNT_ID,
				boardName: 'Soups',
				boardDescription: 'Warm things',
				boardPrivacy: 'SECRET',
			},
			respond: () => ({ status: 201, body: { id: BOARD_ID, name: 'Soups' } }),
		});
		assertIncludes(requests[0], {
			method: 'POST',
			path: '/v1/pinterest/boards',
			body: {
				account_id: ACCOUNT_ID,
				name: 'Soups',
				description: 'Warm things',
				privacy: 'SECRET',
			},
		});
	});

	it('delete sends account_id and reports the deletion', async () => {
		const { output, requests } = await runNode({
			params: { resource: 'boards', operation: 'delete', accountId: ACCOUNT_ID, boardId: BOARD_ID },
			respond: () => ({ status: 204 }),
		});
		assertIncludes(requests[0], {
			method: 'DELETE',
			path: `/v1/pinterest/boards/${BOARD_ID}`,
			query: { account_id: ACCOUNT_ID },
		});
		assertIncludes(output[0].json, { id: BOARD_ID, resource: 'board', deleted: true });
	});
});

describe('terms', () => {
	it('listRelated emits one item per term group', async () => {
		const { output, requests } = await runNode({
			params: {
				resource: 'terms',
				operation: 'listRelated',
				accountId: ACCOUNT_ID,
				termsInput: 'soup,salad',
			},
			respond: () => ({
				id: 'soup',
				related_term_count: 3,
				exact_match: false,
				related_terms_list: [
					{ term: 'soup', related_terms: ['stew', 'broth'] },
					{ term: 'salad', related_terms: ['greens'] },
				],
			}),
		});
		assertIncludes(requests[0], {
			method: 'GET',
			path: '/v1/pinterest/terms/related',
			query: { account_id: ACCOUNT_ID, terms: 'soup,salad', exact_match: 'false' },
		});
		assert.equal(output.length, 2);
		assertIncludes(output[0].json, {
			requestId: 'soup',
			term: 'soup',
			relatedTerms: ['stew', 'broth'],
			relatedTermCount: 2,
			totalRelatedTermCount: 3,
			exactMatch: false,
		});
	});
});

describe('connections', () => {
	it('list maps accounts', async () => {
		const { output, requests } = await runNode({
			params: { resource: 'connections', operation: 'list' },
			respond: () => [accountRecord()],
		});
		assertIncludes(requests[0], { method: 'GET', path: '/v1/pinterest/accounts' });
		assertIncludes(output[0].json, {
			id: ACCOUNT_ID,
			name: 'Soup Studio',
			scopes: 'boards:read,pins:write',
			pinterestUserId: 'pinuser',
		});
	});

	it('startOAuth returns the authorization URL', async () => {
		const { output, requests } = await runNode({
			params: { resource: 'connections', operation: 'startOAuth' },
			respond: () => ({ authorization_url: 'https://pinterest.com/oauth?x=1' }),
		});
		assertIncludes(requests[0], { method: 'GET', path: '/v1/pinterest/oauth/start' });
		assertIncludes(output[0].json, { authorizationUrl: 'https://pinterest.com/oauth?x=1' });
	});

	it('completeOAuth forwards code and state', async () => {
		const { output, requests } = await runNode({
			params: {
				resource: 'connections',
				operation: 'completeOAuth',
				oauthCode: 'code-1',
				oauthState: 'state-1',
			},
			respond: () => ({ status: 'success', message: 'Connected', account_id: ACCOUNT_ID }),
		});
		assertIncludes(requests[0], {
			method: 'GET',
			path: '/v1/pinterest/oauth/callback',
			query: { code: 'code-1', state: 'state-1' },
		});
		assertIncludes(output[0].json, { status: 'success', message: 'Connected', accountId: ACCOUNT_ID });
	});

	it('revoke deletes the account', async () => {
		const { output, requests } = await runNode({
			params: { resource: 'connections', operation: 'revoke', connectionId: ACCOUNT_ID },
			respond: () => ({ status: 204 }),
		});
		assertIncludes(requests[0], { method: 'DELETE', path: `/v1/pinterest/accounts/${ACCOUNT_ID}` });
		assertIncludes(output[0].json, { id: ACCOUNT_ID, resource: 'connection', deleted: true });
	});
});

describe('assets', () => {
	it('uploadImage posts the binary as multipart', async () => {
		const { output, requests } = await runNode({
			params: { resource: 'assets', operation: 'uploadImage' },
			items: [binaryItem('soup.png', 'image/png')],
			respond: () => ({ status: 201, body: assetRecord() }),
		});
		assertIncludes(requests[0], { method: 'POST', path: '/v1/assets/images' });
		assert.deepEqual(requests[0].files, [
			{ field: 'file', filename: 'soup.png', type: 'image/png', size: 12 },
		]);
		assertIncludes(output[0].json, {
			id: ASSET_ID,
			assetType: 'image',
			originalFilename: 'soup.png',
			contentType: 'image/png',
			fileSizeBytes: 1024,
			publicUrl: 'https://cdn.example.com/abc.png',
		});
	});

	it('uploadVideo posts to the video endpoint', async () => {
		const { requests } = await runNode({
			params: { resource: 'assets', operation: 'uploadVideo' },
			items: [binaryItem('clip.mp4', 'video/mp4')],
			respond: () => ({ status: 201, body: assetRecord({ asset_type: 'video' }) }),
		});
		assertIncludes(requests[0], { method: 'POST', path: '/v1/assets/videos' });
		assert.equal(requests[0].files[0].type, 'video/mp4');
	});

	it('get fetches one asset', async () => {
		const { requests } = await runNode({
			params: { resource: 'assets', operation: 'get', assetLookupId: ASSET_ID },
			respond: () => assetRecord(),
		});
		assertIncludes(requests[0], { method: 'GET', path: `/v1/assets/${ASSET_ID}` });
	});
});

describe('pins', () => {
	it('publish sends the pin payload', async () => {
		const { output, requests } = await runNode({
			params: {
				resource: 'pins',
				operation: 'publish',
				accountId: ACCOUNT_ID,
				boardId: BOARD_ID,
				imageSource: 'url',
				imageUrl: 'https://cdn.example.com/soup.png',
				title: 'Autumn recipes',
				description: 'Five soups',
				linkUrl: 'https://example.com/soups',
				altText: 'A bowl of soup',
				relatedTerms: 'soup, stew',
				dominantColor: '#6E7874',
				idempotencyKey: 'run-1-0',
			},
			respond: () => ({ status: 201, body: pinRecord() }),
		});
		assertIncludes(requests[0], {
			method: 'POST',
			path: '/v1/pins',
			body: {
				account_id: ACCOUNT_ID,
				board_id: BOARD_ID,
				title: 'Autumn recipes',
				idempotency_key: 'run-1-0',
				image_url: 'https://cdn.example.com/soup.png',
				description: 'Five soups',
				link_url: 'https://example.com/soups',
				alt_text: 'A bowl of soup',
				related_terms: ['soup', 'stew'],
				dominant_color: '#6E7874',
			},
		});
		assert.equal((requests[0].body as Record<string, unknown>).asset_id, undefined);
		assertIncludes(output[0].json, {
			id: PIN_ID,
			accountId: ACCOUNT_ID,
			status: 'queued',
			title: 'Autumn recipes',
			boardId: BOARD_ID,
			idempotencyKey: 'run-1-0',
		});
	});

	it('publish with an asset and a video cover asset', async () => {
		const { requests } = await runNode({
			params: {
				resource: 'pins',
				operation: 'publish',
				accountId: ACCOUNT_ID,
				boardId: BOARD_ID,
				imageSource: 'asset',
				assetId: ASSET_ID,
				coverImageSource: 'asset',
				coverImageAssetId: 'cover-asset',
				title: 'Clip',
				idempotencyKey: 'k',
			},
			respond: () => ({ status: 201, body: pinRecord() }),
		});
		assert.deepEqual(requests[0].body, {
			account_id: ACCOUNT_ID,
			board_id: BOARD_ID,
			title: 'Clip',
			idempotency_key: 'k',
			asset_id: ASSET_ID,
			cover_image_asset_id: 'cover-asset',
		});
	});

	it('list pages through every pin when returnAll is on', async () => {
		const { output, requests } = await runNode({
			params: { resource: 'pins', operation: 'list' },
			respond: (request) =>
				request.query.offset === '0'
					? Array.from({ length: 100 }, (_, i) => pinRecord({ id: `p${i}` }))
					: [pinRecord({ id: 'last' })],
		});
		assert.equal(requests.length, 2);
		assertIncludes(requests[0], { path: '/v1/pins', query: { limit: '100', offset: '0' } });
		assertIncludes(requests[1], { path: '/v1/pins', query: { limit: '100', offset: '100' } });
		assert.equal(output.length, 101);
	});

	it('list with a limit asks for that many pins', async () => {
		const { requests } = await runNode({
			params: { resource: 'pins', operation: 'list', returnAll: false, limit: 5 },
			respond: () => [pinRecord()],
		});
		assertIncludes(requests[0], { path: '/v1/pins', query: { limit: '5', offset: '0' } });
	});

	it('listImports forwards the filters', async () => {
		const { output, requests } = await runNode({
			params: {
				resource: 'pins',
				operation: 'listImports',
				importStatus: 'failed',
				importSourceType: 'csv',
				returnAll: false,
				limit: 10,
			},
			respond: () => [importJobRecord()],
		});
		assertIncludes(requests[0], {
			path: '/v1/pins/imports',
			query: { status: 'failed', source_type: 'csv', limit: '10', offset: '0' },
		});
		assertIncludes(output[0].json, { id: IMPORT_ID, sourceType: 'json', totalRows: 1 });
	});

	it('importJson posts every input item as one job', async () => {
		const rows = [
			{ account_id: ACCOUNT_ID, board_id: BOARD_ID, title: 'A', run_at: '2026-10-01T09:00:00Z' },
			{ account_id: ACCOUNT_ID, board_id: BOARD_ID, title: 'B' },
		];
		const { output, requests } = await runNode({
			params: { resource: 'pins', operation: 'importJson' },
			items: rows.map((json) => ({ json })),
			respond: () => ({ status: 202, body: importJobRecord({ total_rows: 2 }) }),
		});
		assert.equal(requests.length, 1);
		assertIncludes(requests[0], { method: 'POST', path: '/v1/pins/imports/json', body: rows });
		assert.equal(output.length, 1);
		assertIncludes(output[0].json, { id: IMPORT_ID, totalRows: 2 });
	});

	it('importJson refuses run_at without an offset', async () => {
		await assert.rejects(
			runNode({
				params: { resource: 'pins', operation: 'importJson' },
				items: [{ json: { title: 'A', run_at: '2026-10-01T09:00:00' } }],
			}),
			/run_at without timezone offset/,
		);
	});

	it('importCsv uploads the CSV file', async () => {
		const { requests } = await runNode({
			params: { resource: 'pins', operation: 'importCsv' },
			items: [binaryItem('pins.csv', 'text/csv')],
			respond: () => ({ status: 202, body: importJobRecord({ source_type: 'csv' }) }),
		});
		assertIncludes(requests[0], { method: 'POST', path: '/v1/pins/imports/csv' });
		assert.equal(requests[0].files[0].filename, 'pins.csv');
	});

	it('get, getImport and getStatus hit their endpoints', async () => {
		const get = await runNode({
			params: { resource: 'pins', operation: 'get', pinId: PIN_ID },
			respond: () => pinRecord(),
		});
		assertIncludes(get.requests[0], { method: 'GET', path: `/v1/pins/${PIN_ID}` });

		const getImport = await runNode({
			params: { resource: 'pins', operation: 'getImport', importJobId: IMPORT_ID },
			respond: () => importJobRecord(),
		});
		assertIncludes(getImport.requests[0], { method: 'GET', path: `/v1/pins/imports/${IMPORT_ID}` });

		const status = await runNode({
			params: { resource: 'pins', operation: 'getStatus', pinId: PIN_ID },
			respond: () => ({
				job_id: PIN_ID,
				pin_id: PIN_ID,
				status: 'published',
				submitted_at: '2026-09-30T10:00:00Z',
				completed_at: '2026-09-30T10:01:00Z',
				pinterest_pin_id: '123',
			}),
		});
		assertIncludes(status.requests[0], { method: 'GET', path: `/v1/jobs/${PIN_ID}` });
		assertIncludes(status.output[0].json, {
			jobId: PIN_ID,
			pinId: PIN_ID,
			status: 'published',
			pinterestPinId: '123',
		});
	});

	it('delete removes the PinBridge record', async () => {
		const { output, requests } = await runNode({
			params: { resource: 'pins', operation: 'delete', pinId: PIN_ID },
			respond: () => ({ status: 204 }),
		});
		assertIncludes(requests[0], { method: 'DELETE', path: `/v1/pins/${PIN_ID}` });
		assert.equal(requests[0].query.delete_from_pinterest, undefined);
		assertIncludes(output[0].json, { id: PIN_ID, resource: 'pin', deleted: true });
	});

	it('processes every input item for per-item operations', async () => {
		const { output, requests } = await runNode({
			params: { resource: 'pins', operation: 'get', pinId: PIN_ID },
			items: [{ json: {} }, { json: {} }, { json: {} }],
			respond: () => pinRecord(),
		});
		assert.equal(requests.length, 3);
		assert.deepEqual(
			output.map((item) => item.pairedItem),
			[{ item: 0 }, { item: 1 }, { item: 2 }],
		);
	});
});

describe('schedules', () => {
	it('create sends the schedule payload', async () => {
		const { output, requests } = await runNode({
			params: {
				resource: 'schedules',
				operation: 'create',
				accountId: ACCOUNT_ID,
				boardId: BOARD_ID,
				runAt: '2026-10-01T09:00:00Z',
				imageSource: 'url',
				imageUrl: 'https://cdn.example.com/soup.png',
				title: 'Autumn recipes',
				linkUrl: 'https://example.com/soups',
				coverImageSource: 'url',
				coverImageUrl: 'https://cdn.example.com/cover.png',
			},
			respond: () => ({ status: 201, body: scheduleRecord() }),
		});
		assert.deepEqual(requests[0].body, {
			account_id: ACCOUNT_ID,
			run_at: '2026-10-01T09:00:00Z',
			board_id: BOARD_ID,
			title: 'Autumn recipes',
			image_url: 'https://cdn.example.com/soup.png',
			link_url: 'https://example.com/soups',
			cover_image_url: 'https://cdn.example.com/cover.png',
		});
		assertIncludes(output[0].json, {
			id: SCHEDULE_ID,
			runAt: '2026-10-01T09:00:00Z',
			status: 'scheduled',
			boardId: BOARD_ID,
			title: 'Autumn recipes',
		});
	});

	it('list, get and cancel hit their endpoints', async () => {
		const list = await runNode({
			params: { resource: 'schedules', operation: 'list' },
			respond: () => [scheduleRecord()],
		});
		assertIncludes(list.requests[0], {
			method: 'GET',
			path: '/v1/schedules',
			query: { limit: '100', offset: '0' },
		});

		const get = await runNode({
			params: { resource: 'schedules', operation: 'get', scheduleId: SCHEDULE_ID },
			respond: () => scheduleRecord(),
		});
		assertIncludes(get.requests[0], { method: 'GET', path: `/v1/schedules/${SCHEDULE_ID}` });

		const cancel = await runNode({
			params: { resource: 'schedules', operation: 'cancel', scheduleId: SCHEDULE_ID },
			respond: () => scheduleRecord({ status: 'canceled' }),
		});
		assertIncludes(cancel.requests[0], {
			method: 'POST',
			path: `/v1/schedules/${SCHEDULE_ID}/cancel`,
		});
		assertIncludes(cancel.output[0].json, { status: 'canceled' });
	});
});

describe('webhooks', () => {
	it('create parses the event list', async () => {
		const { requests } = await runNode({
			params: {
				resource: 'webhooks',
				operation: 'create',
				webhookUrl: 'https://hooks.example.com/pinbridge',
				webhookSecret: 'a-very-long-secret-value',
			},
			respond: () => ({ status: 201, body: webhookRecord() }),
		});
		assert.deepEqual(requests[0].body, {
			url: 'https://hooks.example.com/pinbridge',
			secret: 'a-very-long-secret-value',
			is_enabled: true,
			events: ['pin.published', 'pin.failed'],
		});
	});

	it('update only sends changed fields', async () => {
		const { requests } = await runNode({
			params: {
				resource: 'webhooks',
				operation: 'update',
				webhookId: WEBHOOK_ID,
				webhookEnabledUpdate: 'false',
			},
			respond: () => webhookRecord({ is_enabled: false }),
		});
		assertIncludes(requests[0], { method: 'PATCH', path: `/v1/webhooks/${WEBHOOK_ID}` });
		assert.deepEqual(requests[0].body, { is_enabled: false });
	});

	it('list, get and delete hit their endpoints', async () => {
		const list = await runNode({
			params: { resource: 'webhooks', operation: 'list' },
			respond: () => [webhookRecord()],
		});
		assertIncludes(list.requests[0], { method: 'GET', path: '/v1/webhooks' });
		assertIncludes(list.output[0].json, { id: WEBHOOK_ID, isEnabled: true });

		const get = await runNode({
			params: { resource: 'webhooks', operation: 'get', webhookId: WEBHOOK_ID },
			respond: () => webhookRecord(),
		});
		assertIncludes(get.requests[0], { method: 'GET', path: `/v1/webhooks/${WEBHOOK_ID}` });

		const remove = await runNode({
			params: { resource: 'webhooks', operation: 'delete', webhookId: WEBHOOK_ID },
			respond: () => ({ status: 204 }),
		});
		assertIncludes(remove.requests[0], { method: 'DELETE', path: `/v1/webhooks/${WEBHOOK_ID}` });
		assertIncludes(remove.output[0].json, { id: WEBHOOK_ID, resource: 'webhook', deleted: true });
	});
});

describe('rate meter', () => {
	it('get flattens the buckets', async () => {
		const { output, requests } = await runNode({
			params: { resource: 'rateMeter', operation: 'get', accountId: ACCOUNT_ID },
			respond: () => ({
				account: { account_id: ACCOUNT_ID, tokens_available: 9, capacity: 10, refill_rate: 1 },
				global: { tokens_available: 90, capacity: 100, refill_rate: 5 },
			}),
		});
		assertIncludes(requests[0], {
			method: 'GET',
			path: '/v1/rate-meter',
			query: { account_id: ACCOUNT_ID },
		});
		assertIncludes(output[0].json, {
			accountId: ACCOUNT_ID,
			accountTokensAvailable: 9,
			globalCapacity: 100,
		});
	});
});

describe('continueOnFail', () => {
	it('turns a failed item into an error item and keeps going', async () => {
		const { output } = await runNode({
			params: { resource: 'pins', operation: 'get', pinId: PIN_ID },
			items: [{ json: {} }, { json: {} }],
			continueOnFail: true,
			respond: (() => {
				let call = 0;
				return () => (call++ === 0 ? { status: 404, body: { detail: 'Pin not found' } } : pinRecord());
			})(),
		});
		assert.equal(output.length, 2);
		assert.equal(typeof output[0].json.error, 'string');
		assert.deepEqual(output[0].pairedItem, { item: 0 });
		assertIncludes(output[1].json, { id: PIN_ID });
	});
});

describe('loadOptions', () => {
	it('getAccounts lists accounts sorted by name', async () => {
		const { options } = await runLoadOptions('getAccounts', {}, () => [
			accountRecord({ id: 'b', display_name: 'Zed' }),
			accountRecord({ id: 'a', display_name: 'Amy' }),
		]);
		assert.deepEqual(
			options.map((option) => [option.name, option.value]),
			[
				['Amy', 'a'],
				['Zed', 'b'],
			],
		);
	});

	it('getBoards needs an account and lists its boards', async () => {
		const empty = await runLoadOptions('getBoards', {}, () => []);
		assert.deepEqual(empty.options, []);
		assert.equal(empty.requests.length, 0);

		const { options, requests } = await runLoadOptions('getBoards', { accountId: ACCOUNT_ID }, () => [
			{ id: '2', name: 'Salads', privacy: 'SECRET' },
			{ id: '1', name: 'Apples' },
		]);
		assertIncludes(requests[0], { path: '/v1/pinterest/boards', query: { account_id: ACCOUNT_ID } });
		assert.deepEqual(
			options.map((option) => option.value),
			['1', '2'],
		);
	});
});
