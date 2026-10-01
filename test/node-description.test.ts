import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { NodeHelpers } from 'n8n-workflow';

import { PinBridge, operationsByResource } from '../nodes/PinBridge/PinBridge.node';

const node = new PinBridge();
const { properties } = node.description;

function optionValues(property: INodeProperties): string[] {
	return ((property.options ?? []) as INodePropertyOptions[]).map((option) => String(option.value));
}

function operationsFor(resource: string): string[] {
	const selector = properties.find(
		(property) =>
			property.name === 'operation' &&
			(property.displayOptions?.show?.resource as string[] | undefined)?.includes(resource),
	);
	assert.ok(selector, `no operation selector for resource ${resource}`);
	return optionValues(selector);
}

const resources = optionValues(properties.find((property) => property.name === 'resource')!);

describe('node description', () => {
	it('has a handler for every operation option and an option for every handler', () => {
		assert.deepEqual([...resources].sort(), Object.keys(operationsByResource).sort());
		for (const resource of resources) {
			assert.deepEqual(
				operationsFor(resource).sort(),
				Object.keys(operationsByResource[resource]).sort(),
				`operations of ${resource}`,
			);
		}
	});

	it('never shows two parameters with the same name for one operation', () => {
		for (const resource of resources) {
			for (const operation of operationsFor(resource)) {
				const values = { resource, operation };
				const shown = properties
					.filter((property) => property.name !== 'resource' && property.name !== 'operation')
					.filter((property) =>
						NodeHelpers.displayParameter(values, property, { typeVersion: 1 }, node.description),
					)
					.map((property) => property.name);
				const duplicates = shown.filter((name, index) => shown.indexOf(name) !== index);
				assert.deepEqual(duplicates, [], `${resource}.${operation} shows duplicates`);
			}
		}
	});

	it('keeps the 1.2.x parameter defaults that saved workflows rely on', () => {
		const defaults = new Map<string, unknown>();
		for (const property of properties) {
			defaults.set(property.name, property.default);
		}
		assert.equal(defaults.get('resource'), 'pins');
		assert.equal(defaults.get('imageSource'), 'asset');
		assert.equal(defaults.get('coverImageSource'), 'none');
		assert.equal(defaults.get('assetId'), '={{$json["id"]}}');
		assert.equal(defaults.get('idempotencyKey'), '={{$execution.id + "-" + $itemIndex}}');
		assert.equal(defaults.get('binaryPropertyName'), 'data');
		assert.equal(defaults.get('webhookEvents'), 'pin.published,pin.failed');
		assert.equal(defaults.get('webhookEnabled'), true);
		assert.equal(defaults.get('exactMatch'), false);

		const listReturnAll = properties.filter(
			(property) =>
				property.name === 'returnAll' &&
				!(property.displayOptions?.show?.resource as string[]).includes('analytics'),
		);
		assert.ok(listReturnAll.length > 0);
		for (const property of listReturnAll) {
			assert.equal(property.default, true);
		}

		const operationDefaults = Object.fromEntries(
			properties
				.filter((property) => property.name === 'operation')
				.map((property) => [
					(property.displayOptions?.show?.resource as string[])[0],
					property.default,
				]),
		);
		assert.deepEqual(operationDefaults, {
			activityLogs: 'list',
			analytics: 'getOverview',
			assets: 'uploadImage',
			boards: 'list',
			connections: 'list',
			pins: 'publish',
			rateMeter: 'get',
			schedules: 'create',
			terms: 'listRelated',
			webhooks: 'list',
		});
	});

	it('is usable as an AI agent tool', () => {
		assert.equal(node.description.usableAsTool, true);
	});
});
