import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dateParameterText, toTimestampWithOffset } from '../nodes/PinBridge/GenericFunctions';

describe('toTimestampWithOffset', () => {
	it('keeps values that already carry an offset', () => {
		assert.equal(toTimestampWithOffset('2026-10-01T09:00:00Z', 'Europe/Paris'), '2026-10-01T09:00:00Z');
		assert.equal(
			toTimestampWithOffset('2026-10-01T09:00:00+05:30', 'Europe/Paris'),
			'2026-10-01T09:00:00+05:30',
		);
		assert.equal(
			toTimestampWithOffset('2026-10-01T09:00:00.000-0400', 'UTC'),
			'2026-10-01T09:00:00.000-0400',
		);
	});

	it('reads wall-clock values in the given time zone', () => {
		assert.equal(toTimestampWithOffset('2026-10-01T09:00:00', 'UTC'), '2026-10-01T09:00:00.000Z');
		// Summer time in Paris (UTC+2), winter time in New York (UTC-5).
		assert.equal(
			toTimestampWithOffset('2026-07-01T09:00:00', 'Europe/Paris'),
			'2026-07-01T07:00:00.000Z',
		);
		assert.equal(
			toTimestampWithOffset('2026-12-01T09:00:00.250', 'America/New_York'),
			'2026-12-01T14:00:00.250Z',
		);
		assert.equal(toTimestampWithOffset('2026-12-01 18:45', 'Asia/Tokyo'), '2026-12-01T09:45:00.000Z');
		assert.equal(toTimestampWithOffset('2026-12-01', 'Europe/Paris'), '2026-11-30T23:00:00.000Z');
	});

	it('picks the right offset on both sides of a DST switch', () => {
		// Paris leaves summer time on 2026-10-25 at 03:00 local (01:00 UTC).
		assert.equal(
			toTimestampWithOffset('2026-10-24T12:00:00', 'Europe/Paris'),
			'2026-10-24T10:00:00.000Z',
		);
		assert.equal(
			toTimestampWithOffset('2026-10-25T12:00:00', 'Europe/Paris'),
			'2026-10-25T11:00:00.000Z',
		);
		// New York enters summer time on 2026-03-08 at 02:00 local.
		assert.equal(
			toTimestampWithOffset('2026-03-08T01:30:00', 'America/New_York'),
			'2026-03-08T06:30:00.000Z',
		);
		assert.equal(
			toTimestampWithOffset('2026-03-08T03:30:00', 'America/New_York'),
			'2026-03-08T07:30:00.000Z',
		);
	});

	it('leaves unrecognised text for the API to reject', () => {
		assert.equal(toTimestampWithOffset('tomorrow', 'UTC'), 'tomorrow');
	});
});

describe('dateParameterText', () => {
	it('turns expression results into ISO text', () => {
		assert.equal(dateParameterText(new Date('2026-10-01T09:00:00Z')), '2026-10-01T09:00:00.000Z');
		assert.equal(dateParameterText(new Date('not a date')), '');
		// Luxon DateTime and similar objects stringify to ISO 8601.
		assert.equal(
			dateParameterText({ toString: () => '2026-10-01T09:00:00.000+02:00' }),
			'2026-10-01T09:00:00.000+02:00',
		);
		assert.equal(dateParameterText(' 2026-10-01 '), '2026-10-01');
		assert.equal(dateParameterText(undefined), '');
		assert.equal(dateParameterText(null), '');
	});
});
