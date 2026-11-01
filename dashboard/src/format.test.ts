import { expect, it } from "vitest";
import { date, dateTime, humanize, money } from "./format";

it("formats money as US dollars", () => {
  expect(money(1250)).toBe("$1,250.00");
  expect(money(0)).toBe("$0.00");
});

it("formats dates without shifting the day", () => {
  expect(date("2026-06-24")).toBe("Jun 24, 2026");
  expect(dateTime("2026-11-01T13:59:51+00:00")).toMatch(/^Nov 1, 2026/);
});

it("turns codes into labels", () => {
  expect(humanize("trip_delay")).toBe("Trip delay");
  expect(humanize("carrier_report")).toBe("Carrier report");
});
