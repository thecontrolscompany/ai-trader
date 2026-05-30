import { strict as assert } from "node:assert";
import test from "node:test";
import {
  getEasternTime,
  isMarketHours,
  isWithinRunWindow,
} from "./autoTradeSchedule";

test("converts UTC timestamps to Eastern time across DST", () => {
  const winter = getEasternTime(new Date("2026-01-05T14:30:00Z"));
  assert.deepEqual(winter, { day: 1, hour: 9, minute: 30 });

  const summer = getEasternTime(new Date("2026-06-01T13:30:00Z"));
  assert.deepEqual(summer, { day: 1, hour: 9, minute: 30 });
});

test("matches the configured scan windows", () => {
  assert.equal(isWithinRunWindow("1x", { day: 1, hour: 9, minute: 30 }), true);
  assert.equal(isWithinRunWindow("1x", { day: 1, hour: 11, minute: 30 }), false);

  assert.equal(isWithinRunWindow("2x", { day: 1, hour: 13, minute: 30 }), true);
  assert.equal(isWithinRunWindow("2x", { day: 1, hour: 15, minute: 0 }), false);

  assert.equal(isWithinRunWindow("4x", { day: 1, hour: 15, minute: 0 }), true);
  assert.equal(isWithinRunWindow("4x", { day: 1, hour: 10, minute: 0 }), false);
});

test("only treats weekdays during market hours as open", () => {
  assert.equal(isMarketHours({ day: 1, hour: 9, minute: 30 }), true);
  assert.equal(isMarketHours({ day: 1, hour: 16, minute: 0 }), true);
  assert.equal(isMarketHours({ day: 1, hour: 16, minute: 1 }), false);
  assert.equal(isMarketHours({ day: 0, hour: 10, minute: 0 }), false);
});
