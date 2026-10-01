import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { IDataObject } from 'n8n-workflow';

import {
	ACCOUNT_ID,
	ASSET_ID,
	BOARD_ID,
	PIN_ID,
	SCHEDULE_ID,
	accountRecord,
	assetRecord,
	pinRecord,
	scheduleRecord,
} from './fixtures';
import { assertIncludes, runNode } from './harness';

const publishParams = {
	resource: 'pins',
	accountId: ACCOUNT_ID,
	boardId: BOARD_ID,
	imageSource: 'url',
	imageUrl: 'https://cdn.example.com/soup.png',
	title: 'Autumn recipes',
	idempotencyKey: 'key-0',
};

describe('pins', () => {
	it('update sends only the added fields and clears emptied text fields', async () => {
		const { requests, output } = await runNode({
			params: {
				resource: 'pins',
				operation: 'update',
				pinId: PIN_ID,
				pinUpdateFields: { title: 'New title', description: '', boardId: '42' },
			},
			respond: () => pinRecord({ title: 'New title' }),
		});
		assertIncludes(requests[0], { method: 'PATCH', path: `/v1/pins/${PIN_ID}` });
		assert.deepEqual(requests[0].body, { title: 'New title', board_id: '42', description: null });
		assertIncludes(output[0].json, { title: 'New title' });
	});

	it('update without fields fails before calling the API', async () => {
		const { requests, output } = await runNode({
			params: { resource: 'pins', operation: 'update', pinId: PIN_ID },
			continueOnFail: true,
		});
		assert.equal(requests.length, 0);
		assert.match(String(output[0].json.error), /at least one pin field/);
	});

	it('retry posts overrides only when given', async () => {
		const plain = await runNode({
			params: { resource: 'pins', operation: 'retry', pinId: PIN_ID },
			respond: () => pinRecord(),
		});
		assertIncludes(plain.requests[0], { method: 'POST', path: `/v1/pins/${PIN_ID}/retry` });
		assert.equal(plain.requests[0].body, undefined);

		const moved = await runNode({
			params: {
				resource: 'pins',
				operation: 'retry',
				pinId: PIN_ID,
				retryOptions: { boardId: '42', accountId: ACCOUNT_ID },
			},
			respond: () => pinRecord(),
		});
		assert.deepEqual(moved.requests[0].body, { board_id: '42', account_id: ACCOUNT_ID });
	});

	it('delete can remove the pin on Pinterest too', async () => {
		const { requests, output } = await runNode({
			params: { resource: 'pins', operation: 'delete', pinId: PIN_ID, deleteFromPinterest: true },
			respond: () => ({
				id: PIN_ID,
				deleted: true,
				removed_from_pinterest: true,
				pinterest_pin_id: '123',
				reason: null,
			}),
		});
		assertIncludes(requests[0], {
			method: 'DELETE',
			query: { delete_from_pinterest: 'true' },
		});
		assertIncludes(output[0].json, {
			id: PIN_ID,
			deleted: true,
			removedFromPinterest: true,
			pinterestPinId: '123',
		});
	});

	it('validate runs the dry run and lists failed checks', async () => {
		const { requests, output } = await runNode({
			params: { ...publishParams, operation: 'validate' },
			respond: () => ({
				valid: false,
				dry_run: true,
				checks: [
					{ name: 'account', status: 'passed', message: 'ok' },
					{
						name: 'board_access',
						status: 'failed',
						code: 'board_not_owned',
						message: 'Board belongs to someone else',
						remediation: 'Pick one of your boards',
					},
				],
			}),
		});
		assertIncludes(requests[0], {
			method: 'POST',
			path: '/v1/pins/validate',
			body: { account_id: ACCOUNT_ID, title: 'Autumn recipes', idempotency_key: 'key-0' },
		});
		assertIncludes(output[0].json, {
			valid: false,
			failedChecks: [
				{
					name: 'board_access',
					code: 'board_not_owned',
					message: 'Board belongs to someone else',
					remediation: 'Pick one of your boards',
				},
			],
		});
	});

	it('publishBatch sends items in chunks of 100 and pairs every result', async () => {
		const items = Array.from({ length: 150 }, () => ({ json: {} }));
		const itemParams = Object.fromEntries(
			items.map((_, index) => [index, { title: `Pin ${index}`, idempotencyKey: `key-${index}` }]),
		);
		const { requests, output } = await runNode({
			params: { ...publishParams, operation: 'publishBatch' },
			items,
			itemParams,
			respond: (request) => {
				const pins = (request.body as { pins: IDataObject[] }).pins;
				return {
					created_count: pins.length,
					existing_count: 0,
					failed_count: 0,
					results: pins.map((pin, index) =>
						index === 1
							? {
									index,
									idempotency_key: pin.idempotency_key,
									status: 'failed',
									error: { code: 'invalid_image', message: 'Broken image', remediation: 'Fix it' },
								}
							: {
									index,
									idempotency_key: pin.idempotency_key,
									status: 'created',
									pin: pinRecord({ title: pin.title, idempotency_key: pin.idempotency_key }),
								},
					),
				};
			},
		});

		assert.equal(requests.length, 2);
		assert.equal((requests[0].body as { pins: unknown[] }).pins.length, 100);
		assert.equal((requests[1].body as { pins: unknown[] }).pins.length, 50);
		assert.equal(output.length, 150);
		output.forEach((item, index) => assert.deepEqual(item.pairedItem, { item: index }));
		assertIncludes(output[0].json, { batchStatus: 'created', title: 'Pin 0', idempotencyKey: 'key-0' });
		assertIncludes(output[1].json, {
			batchStatus: 'failed',
			errorCode: 'invalid_image',
			errorMessage: 'Broken image',
			remediation: 'Fix it',
		});
		assertIncludes(output[101].json, { batchStatus: 'failed', idempotencyKey: 'key-101' });
	});

	it('publishBatch with continueOnFail reports a refused chunk on every item', async () => {
		const { output } = await runNode({
			params: { ...publishParams, operation: 'publishBatch' },
			items: [{ json: {} }, { json: {} }],
			continueOnFail: true,
			respond: () => ({
				status: 402,
				body: {
					detail: 'Bulk publishing needs a paid plan',
					error: {
						code: 'feature_not_available',
						message: 'Bulk publishing needs a paid plan',
						remediation: 'Upgrade the plan',
					},
				},
			}),
		});
		assert.equal(output.length, 2);
		assertIncludes(output[1].json, {
			error: 'Bulk publishing needs a paid plan',
			errorCode: 'feature_not_available',
			itemIndex: 1,
		});
		assert.deepEqual(output[1].pairedItem, { item: 1 });
	});

	it('list forwards filters and pages past the 200-row API limit', async () => {
		const { requests, output } = await runNode({
			params: {
				resource: 'pins',
				operation: 'list',
				returnAll: false,
				limit: 250,
				pinFilters: {
					accountId: ACCOUNT_ID,
					status: 'failed',
					errorCode: 'board_access_denied',
					removed: false,
					search: 'soup',
					sort: 'published_at_desc',
					since: '2026-09-01T00:00:00Z',
				},
			},
			respond: (request) =>
				Array.from({ length: Number(request.query.limit) }, (_, i) =>
					pinRecord({ id: `${request.query.offset}-${i}` }),
				),
		});
		assert.equal(requests.length, 2);
		assertIncludes(requests[0].query, {
			limit: '200',
			offset: '0',
			account_id: ACCOUNT_ID,
			status: 'failed',
			error_code: 'board_access_denied',
			removed: 'false',
			q: 'soup',
			sort: 'published_at_desc',
			since: '2026-09-01T00:00:00Z',
		});
		assertIncludes(requests[1].query, { limit: '50', offset: '200' });
		assert.equal(output.length, 250);
	});

	it('maps the removal and failure timestamps', async () => {
		const { output } = await runNode({
			params: { resource: 'pins', operation: 'get', pinId: PIN_ID },
			respond: () =>
				pinRecord({
					status: 'published',
					removed_from_pinterest_at: '2026-09-29T00:00:00Z',
					failed_at: null,
				}),
		});
		assertIncludes(output[0].json, {
			removedFromPinterestAt: '2026-09-29T00:00:00Z',
			failedAt: null,
		});
	});
});

describe('schedules', () => {
	it('create reads an offset-less run time in the workflow time zone', async () => {
		const { requests } = await runNode({
			params: {
				resource: 'schedules',
				operation: 'create',
				accountId: ACCOUNT_ID,
				boardId: BOARD_ID,
				runAt: '2026-10-01T09:00:00',
				imageSource: 'asset',
				assetId: ASSET_ID,
				title: 'Autumn recipes',
			},
			timezone: 'Europe/Paris',
			respond: () => ({ status: 201, body: scheduleRecord() }),
		});
		assertIncludes(requests[0].body, { run_at: '2026-10-01T07:00:00.000Z', asset_id: ASSET_ID });
	});

	it('update converts the run time and clears emptied text fields', async () => {
		const { requests } = await runNode({
			params: {
				resource: 'schedules',
				operation: 'update',
				scheduleId: SCHEDULE_ID,
				scheduleUpdateFields: {
					runAt: '2026-12-01T09:30:00',
					title: 'Winter recipes',
					linkUrl: '',
					assetId: ASSET_ID,
				},
			},
			timezone: 'America/New_York',
			respond: () => scheduleRecord(),
		});
		assertIncludes(requests[0], { method: 'PATCH', path: `/v1/schedules/${SCHEDULE_ID}` });
		assert.deepEqual(requests[0].body, {
			run_at: '2026-12-01T14:30:00.000Z',
			title: 'Winter recipes',
			asset_id: ASSET_ID,
			link_url: null,
		});
	});

	it('validate, retry and delete hit their endpoints', async () => {
		const validate = await runNode({
			params: {
				resource: 'schedules',
				operation: 'validate',
				accountId: ACCOUNT_ID,
				boardId: BOARD_ID,
				runAt: '2026-10-01T09:00:00Z',
				imageSource: 'url',
				imageUrl: 'https://cdn.example.com/soup.png',
				title: 'Soup',
			},
			respond: () => ({ valid: true, checks: [] }),
		});
		assertIncludes(validate.requests[0], { method: 'POST', path: '/v1/schedules/validate' });
		assertIncludes(validate.output[0].json, { valid: true, failedChecks: [] });

		const retry = await runNode({
			params: { resource: 'schedules', operation: 'retry', scheduleId: SCHEDULE_ID },
			respond: () => scheduleRecord({ status: 'queued' }),
		});
		assertIncludes(retry.requests[0], {
			method: 'POST',
			path: `/v1/schedules/${SCHEDULE_ID}/retry`,
		});

		const remove = await runNode({
			params: { resource: 'schedules', operation: 'delete', scheduleId: SCHEDULE_ID },
			respond: () => ({ status: 204 }),
		});
		assertIncludes(remove.requests[0], { method: 'DELETE', path: `/v1/schedules/${SCHEDULE_ID}` });
		assertIncludes(remove.output[0].json, { id: SCHEDULE_ID, resource: 'schedule', deleted: true });
	});

	it('list forwards the filters', async () => {
		const { requests } = await runNode({
			params: {
				resource: 'schedules',
				operation: 'list',
				scheduleFilters: { status: 'scheduled', sort: 'run_at_asc', boardId: BOARD_ID },
			},
			respond: () => [scheduleRecord()],
		});
		assertIncludes(requests[0].query, {
			status: 'scheduled',
			sort: 'run_at_asc',
			board_id: BOARD_ID,
			limit: '100',
			offset: '0',
		});
	});
});

describe('boards', () => {
	it('update sends the owning account and the changed fields', async () => {
		const { requests } = await runNode({
			params: {
				resource: 'boards',
				operation: 'update',
				accountId: ACCOUNT_ID,
				boardId: BOARD_ID,
				boardUpdateFields: { name: 'Soups & stews', privacy: 'SECRET' },
			},
			respond: () => ({ id: BOARD_ID, name: 'Soups & stews', privacy: 'SECRET' }),
		});
		assertIncludes(requests[0], { method: 'PATCH', path: `/v1/pinterest/boards/${BOARD_ID}` });
		assert.deepEqual(requests[0].body, {
			account_id: ACCOUNT_ID,
			name: 'Soups & stews',
			privacy: 'SECRET',
		});
	});

	it('checkAccess reports the verdict', async () => {
		const { requests, output } = await runNode({
			params: {
				resource: 'boards',
				operation: 'checkAccess',
				accountId: ACCOUNT_ID,
				boardId: BOARD_ID,
				bypassCache: true,
			},
			respond: () => ({
				account_id: ACCOUNT_ID,
				board_id: BOARD_ID,
				publishable: false,
				status: 'failed',
				code: 'scope_missing',
				message: 'Missing scope',
				remediation: 'Reconnect the account',
				checked_at: '2026-09-30T10:00:00Z',
				source: 'pinterest',
			}),
		});
		assertIncludes(requests[0], {
			method: 'GET',
			path: `/v1/pinterest/boards/${BOARD_ID}/access`,
			query: { account_id: ACCOUNT_ID, fresh: 'true' },
		});
		assertIncludes(output[0].json, {
			publishable: false,
			code: 'scope_missing',
			remediation: 'Reconnect the account',
		});
	});
});

describe('assets', () => {
	it('list reads the assets page and forwards filters', async () => {
		const { requests, output } = await runNode({
			params: {
				resource: 'assets',
				operation: 'list',
				assetFilters: { assetType: 'video', inUse: false, sort: 'size_desc' },
			},
			respond: () => ({
				assets: [assetRecord({ asset_type: 'video' })],
				total: 1,
				storage_used_bytes: 1024,
				storage_quota_bytes: 1048576,
				storage_used_percent: 0,
			}),
		});
		assertIncludes(requests[0], {
			path: '/v1/assets',
			query: { asset_type: 'video', in_use: 'false', sort: 'size_desc', limit: '100', offset: '0' },
		});
		assertIncludes(output[0].json, { id: ASSET_ID, assetType: 'video', referencedByPinCount: 0 });
	});

	it('delete reports when an in-use asset needs confirmation', async () => {
		const { requests, output } = await runNode({
			params: { resource: 'assets', operation: 'delete', assetLookupId: ASSET_ID },
			respond: () => ({
				deleted: false,
				requires_confirmation: true,
				referenced_pin_count: 2,
				freed_bytes: 0,
			}),
		});
		assertIncludes(requests[0], { method: 'DELETE', path: `/v1/assets/${ASSET_ID}` });
		assert.equal(requests[0].query.confirm, undefined);
		assertIncludes(output[0].json, {
			id: ASSET_ID,
			deleted: false,
			requiresConfirmation: true,
			referencedPinCount: 2,
		});

		const confirmed = await runNode({
			params: {
				resource: 'assets',
				operation: 'delete',
				assetLookupId: ASSET_ID,
				deleteIfInUse: true,
			},
			respond: () => ({
				deleted: true,
				requires_confirmation: false,
				referenced_pin_count: 2,
				freed_bytes: 1024,
			}),
		});
		assertIncludes(confirmed.requests[0].query, { confirm: 'true' });
	});
});

describe('analytics', () => {
	it('getPin sends the date range and metric options', async () => {
		const { requests, output } = await runNode({
			params: {
				resource: 'analytics',
				operation: 'getPin',
				pinId: PIN_ID,
				startDate: '2026-09-01T00:00:00',
				endDate: '2026-09-30',
				metricOptions: { includeDaily: false, source: 'stored', metrics: 'IMPRESSION,SAVE' },
			},
			respond: () => ({
				pin_id: PIN_ID,
				pinterest_pin_id: '123',
				account_id: ACCOUNT_ID,
				start_date: '2026-09-01',
				end_date: '2026-09-30',
				provider_mode: 'pinterest',
				source: 'stored',
				totals: { impression: 120, save: 4 },
				daily: [],
			}),
		});
		assertIncludes(requests[0], {
			path: `/v1/pins/${PIN_ID}/analytics`,
			query: {
				start_date: '2026-09-01',
				end_date: '2026-09-30',
				include_daily: 'false',
				source: 'stored',
				metrics: 'IMPRESSION,SAVE',
			},
		});
		assertIncludes(output[0].json, {
			pinId: PIN_ID,
			source: 'stored',
			totals: { impression: 120, save: 4 },
		});
	});

	it('getAccount and getOverview hit their endpoints', async () => {
		const account = await runNode({
			params: { resource: 'analytics', operation: 'getAccount', accountId: ACCOUNT_ID },
			respond: () => ({
				account_id: ACCOUNT_ID,
				start_date: '2026-09-01',
				end_date: '2026-09-30',
				provider_mode: 'pinterest',
				totals: {},
				daily: [],
			}),
		});
		assertIncludes(account.requests[0], {
			path: `/v1/pinterest/accounts/${ACCOUNT_ID}/analytics`,
			query: {},
		});
		assert.equal(account.output[0].json.pinId, undefined);

		const overview = await runNode({
			params: {
				resource: 'analytics',
				operation: 'getOverview',
				analyticsFilters: { accountId: ACCOUNT_ID },
			},
			respond: () => ({
				start_date: '2026-09-01',
				end_date: '2026-09-30',
				previous_start_date: '2026-08-02',
				previous_end_date: '2026-08-31',
				metrics: ['impression'],
				totals: { impression: 10 },
				daily: [],
				accounts: [{ account_id: ACCOUNT_ID, status: 'collecting', message: 'ok' }],
			}),
		});
		assertIncludes(overview.requests[0], {
			path: '/v1/analytics/overview',
			query: { account_id: ACCOUNT_ID },
		});
		assertIncludes(overview.output[0].json, { totals: { impression: 10 } });
	});

	it('listTopPins ranks pins and pages by 100', async () => {
		const { requests, output } = await runNode({
			params: {
				resource: 'analytics',
				operation: 'listTopPins',
				sortBy: 'save',
				limit: 150,
			},
			respond: (request) => ({
				items: Array.from({ length: Number(request.query.limit) }, (_, i) => ({
					pin_id: `pin-${Number(request.query.offset) + i}`,
					account_id: ACCOUNT_ID,
					title: 'Soup',
					media_type: 'image',
					totals: { save: 1 },
				})),
				total: 400,
			}),
		});
		assert.equal(requests.length, 2);
		assertIncludes(requests[0].query, { sort_by: 'save', limit: '100', offset: '0' });
		assertIncludes(requests[1].query, { limit: '50', offset: '100' });
		assert.equal(output.length, 150);
		assertIncludes(output[149].json, { rank: 150, pinId: 'pin-149' });
	});

	it('getPublishingSummary defaults the time zone to the workflow one', async () => {
		const { requests, output } = await runNode({
			params: {
				resource: 'analytics',
				operation: 'getPublishingSummary',
				rangeStart: '2026-09-01T00:00:00',
			},
			timezone: 'Europe/Paris',
			respond: () => ({
				start: '2026-09-01T00:00:00+02:00',
				end: '2026-09-30T12:00:00+02:00',
				timezone: 'Europe/Paris',
				granularity: 'day',
				previous_start: '2026-08-03T00:00:00+02:00',
				previous_end: '2026-09-01T00:00:00+02:00',
				pins: { total: 3, submitted: 3, by_status: { published: 3 }, success_rate: 1 },
				previous_pins: { total: 0, submitted: 0, by_status: {}, success_rate: null },
				series: [],
				published_by_account: [],
				queue: {},
				schedules: {},
				import_jobs: null,
			}),
		});
		assertIncludes(requests[0], {
			path: '/v1/dashboard/summary',
			query: { start: '2026-09-01T00:00:00', tz: 'Europe/Paris' },
		});
		assert.equal(requests[0].query.end, undefined);
		assertIncludes(output[0].json, { granularity: 'day', pins: { success_rate: 1 } });
	});

	it('collectAccount queues a collection', async () => {
		const { requests, output } = await runNode({
			params: { resource: 'analytics', operation: 'collectAccount', accountId: ACCOUNT_ID },
			respond: () => ({
				status: 202,
				body: { account_id: ACCOUNT_ID, status: 'queued', message: 'Collection queued' },
			}),
		});
		assertIncludes(requests[0], {
			method: 'POST',
			path: `/v1/analytics/accounts/${ACCOUNT_ID}/collect`,
		});
		assertIncludes(output[0].json, { accountId: ACCOUNT_ID, status: 'queued' });
	});

	it('rejects a start date that is not a date', async () => {
		const { output, requests } = await runNode({
			params: { resource: 'analytics', operation: 'getOverview', startDate: 'last week' },
			continueOnFail: true,
		});
		assert.equal(requests.length, 0);
		assert.match(String(output[0].json.error), /Start Date must be a date/);
	});
});

describe('activity logs', () => {
	it('follows the cursor until the limit is reached', async () => {
		const page = (cursor: string | null, ids: string[]) => ({
			items: ids.map((id) => ({
				id,
				actor_type: 'api_key',
				action: 'pin.published',
				category: 'publishing',
				status: 'success',
				message: 'Published',
				metadata: {},
				created_at: '2026-09-30T10:00:00Z',
			})),
			next_cursor: cursor,
			current_retention_days: 30,
			current_retention_label: '30 days',
		});
		const { requests, output } = await runNode({
			params: {
				resource: 'activityLogs',
				operation: 'list',
				returnAll: false,
				limit: 3,
				activityLogFilters: { category: 'publishing', status: 'success' },
			},
			respond: (request) =>
				request.query.cursor ? page(null, ['c']) : page('next-1', ['a', 'b']),
		});
		assert.equal(requests.length, 2);
		assertIncludes(requests[0].query, { limit: '3', category: 'publishing', status: 'success' });
		assertIncludes(requests[1].query, { limit: '1', cursor: 'next-1' });
		assert.deepEqual(
			output.map((item) => item.json.id),
			['a', 'b', 'c'],
		);
		assertIncludes(output[0].json, { action: 'pin.published', actorType: 'api_key' });
	});
});

describe('activity logs (empty page)', () => {
	it('stops when a page is empty even if it carries a cursor', async () => {
		const { requests, output } = await runNode({
			params: { resource: 'activityLogs', operation: 'list' },
			respond: () => ({
				items: [],
				next_cursor: 'same-cursor',
				current_retention_days: 30,
				current_retention_label: '30 days',
			}),
		});
		assert.equal(requests.length, 1);
		assert.equal(output.length, 0);
	});
});

describe('connections', () => {
	it('list exposes account health', async () => {
		const { output } = await runNode({
			params: { resource: 'connections', operation: 'list' },
			respond: () => [
				accountRecord({
					health_status: 'reconnect_required',
					reconnect_required: true,
					missing_scopes: ['boards:write_secret'],
				}),
			],
		});
		assertIncludes(output[0].json, {
			healthStatus: 'reconnect_required',
			reconnectRequired: true,
			missingScopes: ['boards:write_secret'],
		});
	});
});
