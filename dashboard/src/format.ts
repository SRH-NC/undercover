import type { DecisionKind, Status } from "./api";

export const STATUSES: Status[] = [
  "waiting",
  "in_progress",
  "awaiting_sign_off",
  "decided",
];

export const STATUS_LABELS: Record<Status, string> = {
  waiting: "Waiting",
  in_progress: "In progress",
  awaiting_sign_off: "Waiting for sign-off",
  decided: "Decided",
};

export const DECISION_LABELS: Record<DecisionKind, string> = {
  approve: "Approved",
  decline: "Declined",
  refer: "Referred",
};

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const day = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const moment = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function money(amount: number): string {
  return dollars.format(amount);
}

export function date(isoDate: string): string {
  return day.format(new Date(`${isoDate}T00:00:00Z`));
}

export function dateTime(isoTimestamp: string): string {
  return moment.format(new Date(isoTimestamp));
}

export function humanize(code: string): string {
  const words = code.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
