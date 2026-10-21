import { formatInTimeZone } from "@/lib/time";

export type ActivityLogSection = {
  title: string;
  entries: Array<{ label: string; value: string }>;
};

export type ActivityLogDiffRow = {
  label: string;
  before: string;
  after: string;
};

const humanizeKey = (raw: string) => {
  const withSpaces = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
};

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}T/.test(value);

function formatValue(value: unknown, timeZone?: string): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (isIsoDate(value)) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return formatInTimeZone(parsed, "MMM dd, yyyy HH:mm", timeZone);
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "-";
    if (value.every((item) => typeof item !== "object")) {
      return value.map((item) => formatValue(item, timeZone)).join(", ");
    }
    const objectItems = value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) as Record<string, any>[];
    if (objectItems.length === value.length && objectItems.length > 0) {
      const firstKeys = Object.keys(objectItems[0].attributes ?? {});
      if (firstKeys.length === 1) {
        const key = firstKeys[0];
        const isUniform = objectItems.every((item) => {
          const keys = Object.keys(item.attributes ?? {});
          return keys.length === 1 && keys[0] === key;
        });
        if (isUniform) {
          const formattedValues = objectItems
            .map((item) => formatValue(item.attributes?.[key], timeZone))
            .filter((val) => val !== "-");
          if (formattedValues.length) {
            return `${humanizeKey(key)}: ${formattedValues.join(", ")}`;
          }
        }
      }
    }
    return value.map((item) => formatObjectSummary(item as Record<string, any>, timeZone)).join(", ");
  }
  return "Details available";
}

function formatObjectSummary(value: Record<string, any>, timeZone?: string): string {
  if (!value || typeof value !== "object") return formatValue(value, timeZone);
  if (typeof value.name === "string" && value.name.trim()) return value.name;
  if (typeof value.title === "string" && value.title.trim()) return value.title;

  const attrs = value.attributes && typeof value.attributes === "object" ? value.attributes : null;
  const attrValues = attrs
    ? Object.entries(attrs)
        .map(([key, val]) => {
          const formatted = formatValue(val, timeZone);
          return formatted === "-" ? "" : `${humanizeKey(key)}: ${formatted}`;
        })
        .filter(Boolean)
    : [];

  const labelParts: string[] = [];
  if (attrValues.length) {
    labelParts.push(attrValues.join(" / "));
  }
  if (typeof value.sku === "string" && value.sku.trim()) {
    labelParts.push(`SKU: ${value.sku}`);
  }
  if (labelParts.length) return labelParts.join(" - ");

  const commonParts: string[] = [];
  if (value.method) {
    const methodLabel = formatValue(value.method, timeZone);
    if (methodLabel !== "-") commonParts.push(`Method: ${methodLabel}`);
  }
  if (value.amount !== undefined) {
    const amountLabel = formatValue(value.amount, timeZone);
    if (amountLabel !== "-") commonParts.push(`Amount: ${amountLabel}`);
  }
  if (value.quantity !== undefined) {
    const qtyLabel = formatValue(value.quantity, timeZone);
    if (qtyLabel !== "-") commonParts.push(`Qty: ${qtyLabel}`);
  }
  if (value.rate !== undefined) {
    const rateLabel = formatValue(value.rate, timeZone);
    if (rateLabel !== "-") commonParts.push(`Rate: ${rateLabel}`);
  }
  if (value.sale_price !== undefined && value.sale_price !== null) {
    const salePriceLabel = formatValue(value.sale_price, timeZone);
    if (salePriceLabel !== "-") commonParts.push(`Sale: ${salePriceLabel}`);
  }
  if (value.total !== undefined) {
    const totalLabel = formatValue(value.total, timeZone);
    if (totalLabel !== "-") commonParts.push(`Total: ${totalLabel}`);
  }
  if (commonParts.length) return commonParts.join(", ");

  if (value.id) return String(value.id);

  return "Item";
}

const flattenObject = (
  input: Record<string, any>,
  prefix = "",
  limit = 200,
  timeZone?: string,
) => {
  const entries: Array<{ label: string; value: string }> = [];
  const stack: Array<{ key: string; value: any }> = Object.entries(input).map(([key, value]) => ({
    key,
    value,
  }));

  while (stack.length && entries.length < limit) {
    const { key, value } = stack.shift() as { key: string; value: any };
    const label = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.entries(value).forEach(([childKey, childValue]) => {
        stack.push({ key: `${key}.${childKey}`, value: childValue });
      });
    } else {
      entries.push({ label: humanizeKey(label), value: formatValue(value, timeZone) });
    }
  }

  return entries;
};

export const buildActivitySections = (
  details: Record<string, any> | null,
  timeZone?: string,
): ActivityLogSection[] => {
  if (!details) return [];

  const sections: ActivityLogSection[] = [];
  const { new: newData, old: oldData, ...rest } = details as any;

  const hasBefore = oldData && typeof oldData === "object";
  const hasAfter = newData && typeof newData === "object";

  if (hasBefore && hasAfter) {
    const beforeEntries = flattenObject(oldData, "", 200, timeZone);
    const afterEntries = flattenObject(newData, "", 200, timeZone);
    const beforeMap = new Map(beforeEntries.map((entry) => [entry.label, entry.value]));
    const afterMap = new Map(afterEntries.map((entry) => [entry.label, entry.value]));

    const changedLabels = new Set<string>();
    beforeMap.forEach((value, label) => {
      if (afterMap.get(label) !== value) {
        changedLabels.add(label);
      }
    });
    afterMap.forEach((value, label) => {
      if (beforeMap.get(label) !== value) {
        changedLabels.add(label);
      }
    });

    const filteredBefore = beforeEntries.filter((entry) => changedLabels.has(entry.label));
    const filteredAfter = afterEntries.filter((entry) => changedLabels.has(entry.label));

    if (filteredAfter.length) {
      sections.push({ title: "After", entries: filteredAfter });
    }

    if (filteredBefore.length) {
      sections.push({ title: "Before", entries: filteredBefore });
    }
  } else {
    if (hasAfter) {
      sections.push({
        title: "After",
        entries: flattenObject(newData, "", 200, timeZone),
      });
    }

    if (hasBefore) {
      sections.push({
        title: "Before",
        entries: flattenObject(oldData, "", 200, timeZone),
      });
    }
  }

  const restEntries = flattenObject(rest, "", 200, timeZone);
  if (!sections.length && restEntries.length) {
    sections.push({ title: "Details", entries: restEntries });
  } else if (restEntries.length) {
    sections.push({ title: "Extra Details", entries: restEntries });
  }

  return sections;
};

export const buildActivityDiffRows = (
  details: Record<string, any> | null,
  timeZone?: string,
): ActivityLogDiffRow[] => {
  if (!details) return [];

  const { new: newData, old: oldData } = details as any;
  const hasBefore = oldData && typeof oldData === "object";
  const hasAfter = newData && typeof newData === "object";

  if (!hasBefore && !hasAfter) return [];

  const beforeEntries = hasBefore ? flattenObject(oldData, "", 200, timeZone) : [];
  const afterEntries = hasAfter ? flattenObject(newData, "", 200, timeZone) : [];
  const beforeMap = new Map(beforeEntries.map((entry) => [entry.label, entry.value]));
  const afterMap = new Map(afterEntries.map((entry) => [entry.label, entry.value]));

  const allLabels = new Set<string>([
    ...beforeEntries.map((entry) => entry.label),
    ...afterEntries.map((entry) => entry.label),
  ]);

  const rows: ActivityLogDiffRow[] = [];
  allLabels.forEach((label) => {
    const before = beforeMap.get(label) ?? "-";
    const after = afterMap.get(label) ?? "-";
    if (before !== after) {
      rows.push({ label, before, after });
    }
  });

  return rows.sort((a, b) => a.label.localeCompare(b.label));
};
