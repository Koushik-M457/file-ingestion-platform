// Shared settings, helpers and the list of dashboard components.

export const API_BASE = "http://127.0.0.1:8000";
export const API = `${API_BASE}/api/data-model`;


// ---------------------------------------------------------
// Canvas grid
// ---------------------------------------------------------

export const COLS = 12;      // grid columns
export const ROW_H = 84;     // height of one grid row in px


// ---------------------------------------------------------
// Colors (validated chart palette, single hue by default)
// ---------------------------------------------------------

export const COLORS = {
  series: "#2a78d6",
  grid: "#e5e7eb",
  axis: "#52514e",
  surface: "#ffffff",
  other: "#9ca3af",
};

// categorical slots, always used in this order
export const CATEGORICAL = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#6250d6", // violet
  "#e34948", // red
];


// ---------------------------------------------------------
// Number / text helpers
// ---------------------------------------------------------

const compactFormat = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const fullFormat = new Intl.NumberFormat("en", {
  maximumFractionDigits: 2,
});

export const compact = (value) => compactFormat.format(value);

export const full = (value) => fullFormat.format(value);

export function shorten(text, max) {

  const value = String(text ?? "");

  return value.length > max ? value.slice(0, max - 1) + "…" : value;

}

export function isNumericType(type) {
  return /INT|DOUBLE|DECIMAL|FLOAT|REAL|NUMERIC/i.test(type || "");
}

// "2024-01-10 00:00:00" -> "2024-01-10"
export function cleanLabel(label) {
  return String(label ?? "").replace(/ 00:00:00(\.0+)?$/, "");
}


// names that usually hold an amount or a quantity
const MEASURE_NAME =
  /(AMT|AMOUNT|VALUE|WRBTR|DMBTR|NETWR|NETPR|PRICE|COST|TOTAL|NET|GROSS|MENGE|QTY|QUANT|SUM|REVENUE|SALES)/i;

// Pick a sensible default measure column:
//   1. a column named like an amount / quantity
//   2. the last numeric column (keys usually come first)
//   3. any other column
export function pickMeasure(columns, exclude) {

  const candidates = columns.filter((c) => c.name !== exclude);

  const byName = candidates.find((c) => MEASURE_NAME.test(c.name));

  if (byName) return byName.name;

  const numeric = candidates.filter((c) => isNumericType(c.type));

  if (numeric.length > 0) return numeric[numeric.length - 1].name;

  return (candidates[0] || columns[0])?.name || "";

}


// ---------------------------------------------------------
// Options
// ---------------------------------------------------------

export const AGGREGATIONS = [
  { id: "COUNT", label: "Count of rows" },
  { id: "SUM", label: "Sum" },
  { id: "AVG", label: "Average" },
  { id: "MIN", label: "Minimum" },
  { id: "MAX", label: "Maximum" },
  { id: "COUNT_DISTINCT", label: "Count distinct" },
];

export const SORTS = [
  { id: "VALUE_DESC", label: "Highest value first" },
  { id: "VALUE_ASC", label: "Lowest value first" },
  { id: "LABEL_ASC", label: "Label A → Z" },
];

export const LIMITS = [5, 6, 8, 10, 20, 50, 100];

export const ROW_LIMITS = [10, 25, 50, 100, 200];


// ---------------------------------------------------------
// The components in the palette
// ---------------------------------------------------------

function Icon({ children }) {

  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );

}

export const COMPONENT_TYPES = [

  {
    type: "bar",
    label: "Bar chart",
    group: "Charts",
    w: 6, h: 4, minW: 3, minH: 3,
    icon: (
      <Icon>
        <path d="M5 27h22" />
        <rect x="7" y="15" width="4" height="12" rx="1" />
        <rect x="14" y="8" width="4" height="19" rx="1" />
        <rect x="21" y="19" width="4" height="8" rx="1" />
      </Icon>
    ),
  },

  {
    type: "line",
    label: "Line chart",
    group: "Charts",
    w: 6, h: 4, minW: 3, minH: 3,
    icon: (
      <Icon>
        <path d="M5 27h22" />
        <path d="M6 21l6-7 5 4 8-10" />
        <circle cx="12" cy="14" r="1.4" />
        <circle cx="17" cy="18" r="1.4" />
        <circle cx="25" cy="8" r="1.4" />
      </Icon>
    ),
  },

  {
    type: "pie",
    label: "Pie chart",
    group: "Charts",
    w: 5, h: 4, minW: 3, minH: 3,
    icon: (
      <Icon>
        <circle cx="16" cy="16" r="10" />
        <path d="M16 6v10l8.5 5" />
      </Icon>
    ),
  },

  {
    type: "kpi",
    label: "KPI card",
    group: "Figures",
    w: 3, h: 2, minW: 2, minH: 2,
    icon: (
      <Icon>
        <rect x="4" y="7" width="24" height="18" rx="3" />
        <path d="M9 17h8" />
        <path d="M9 21h5" />
        <path d="M21 12l2-2 2 2" />
      </Icon>
    ),
  },

  {
    type: "table",
    label: "Table",
    group: "Figures",
    w: 6, h: 4, minW: 3, minH: 3,
    icon: (
      <Icon>
        <rect x="4" y="6" width="24" height="20" rx="2" />
        <path d="M4 12h24" />
        <path d="M4 18h24" />
        <path d="M13 6v20" />
      </Icon>
    ),
  },

];

export const typeInfo = (type) =>
  COMPONENT_TYPES.find((t) => t.type === type) || COMPONENT_TYPES[0];


// ---------------------------------------------------------
// Component settings
// ---------------------------------------------------------

export function makeDefaultConfig(type, tables) {

  const table = tables[0];

  const config = {
    title: "",
    table: table?.name || "",
    xTable: "",
    // the first column is usually an id - start from the second one
    xColumn: (table?.columns?.[1] || table?.columns?.[0])?.name || "",
    yColumn: "",
    aggregation: "COUNT",
    sort: "VALUE_DESC",
    limit: 10,
    orientation: "vertical",
    area: false,
    columns: [],
    rowLimit: 25,
  };

  if (type === "line") {
    config.sort = "LABEL_ASC";
    config.limit = 30;
  }

  if (type === "pie") {
    config.limit = 6;
  }

  return config;

}


// base table + the tables linked to it by an approved relationship
export function getGroupSources(baseTable, tables, relationships) {

  if (!baseTable) return [];

  const sources = [{ table: baseTable, related: false }];

  const seen = new Set([baseTable.name]);

  relationships.forEach((r) => {

    let otherName = null;

    if (r.source_table === baseTable.name) otherName = r.target_table;
    if (r.target_table === baseTable.name) otherName = r.source_table;

    if (otherName && !seen.has(otherName)) {

      const other = tables.find((t) => t.name === otherName);

      if (other) {
        seen.add(otherName);
        sources.push({ table: other, related: true });
      }

    }

  });

  return sources;

}


export function measureLabelOf(config) {

  if (config.aggregation === "COUNT") return "Rows";

  const name =
    AGGREGATIONS.find((a) => a.id === config.aggregation)?.label || "";

  return `${name} of ${config.yColumn}`;

}

export function groupLabelOf(config) {

  return config.xTable
    ? `${config.xTable}.${config.xColumn}`
    : config.xColumn;

}

export function autoTitle(type, config) {

  if (type === "table") return config.table || "Table";

  if (type === "kpi") return measureLabelOf(config);

  return `${measureLabelOf(config)} by ${groupLabelOf(config)}`;

}


// is the component fully set up so it can ask for data?
export function isReady(type, config) {

  if (!config.table) return false;

  if (type === "table") return true;

  if (config.aggregation !== "COUNT" && !config.yColumn) return false;

  if (type !== "kpi" && !config.xColumn) return false;

  return true;

}


// request body for /chart-query
export function chartBody(type, config) {

  return {
    table: config.table,
    x_table: type === "kpi" ? null : config.xTable || null,
    x_column: type === "kpi" ? null : config.xColumn,
    y_column: config.aggregation === "COUNT" ? null : config.yColumn,
    aggregation: config.aggregation,
    sort: config.sort,
    limit: type === "pie" ? Math.min(config.limit, 8) : config.limit,
  };

}


// ---------------------------------------------------------
// Grid geometry
// ---------------------------------------------------------

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function overlaps(a, b) {

  return (
    a.col < b.col + b.w &&
    a.col + a.w > b.col &&
    a.row < b.row + b.h &&
    a.row + a.h > b.row
  );

}

export function collides(rect, items, ignoreId) {

  return items.some(
    (item) => item.id !== ignoreId && overlaps(rect, item)
  );

}

// first free spot for a w x h block, searching from (startCol, startRow)
export function findFreeSpot(items, w, h, startCol = 0, startRow = 0) {

  for (let row = startRow; row < startRow + 500; row++) {

    const from = row === startRow ? startCol : 0;

    for (let col = from; col <= COLS - w; col++) {

      if (!collides({ col, row, w, h }, items)) {
        return { col, row };
      }

    }

  }

  return { col: 0, row: startRow };

}