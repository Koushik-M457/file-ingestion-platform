import { useEffect, useMemo, useState } from "react";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from "recharts";

import "./Visualization.css";


const API_BASE = "http://127.0.0.1:8000";
const API = `${API_BASE}/api/data-model`;


// chart colors (one hue: the default for a single series)
const SERIES = "#2a78d6";
const GRID = "#e5e7eb";
const AXIS_TEXT = "#52514e";
const SURFACE = "#ffffff";


const CHART_TYPES = [
  { id: "bar", label: "Bar" },
  { id: "hbar", label: "Horizontal" },
  { id: "line", label: "Line" },
  { id: "area", label: "Area" },
];

const AGGREGATIONS = [
  { id: "COUNT", label: "Count of rows" },
  { id: "SUM", label: "Sum" },
  { id: "AVG", label: "Average" },
  { id: "MIN", label: "Minimum" },
  { id: "MAX", label: "Maximum" },
  { id: "COUNT_DISTINCT", label: "Count distinct" },
];

const SORTS = [
  { id: "VALUE_DESC", label: "Highest value first" },
  { id: "VALUE_ASC", label: "Lowest value first" },
  { id: "LABEL_ASC", label: "Label A → Z" },
];

const LIMITS = [5, 10, 20, 50, 100];


const compactFormat = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const fullFormat = new Intl.NumberFormat("en", {
  maximumFractionDigits: 2,
});


function compact(value) {
  return compactFormat.format(value);
}

function full(value) {
  return fullFormat.format(value);
}

function shorten(text, max) {

  const value = String(text ?? "");

  return value.length > max
    ? value.slice(0, max - 1) + "…"
    : value;

}

function isNumericType(type) {
  return /INT|DOUBLE|DECIMAL|FLOAT|REAL|NUMERIC/i.test(type || "");
}


// "2024-01-10 00:00:00" -> "2024-01-10"
function cleanLabel(label) {
  return String(label ?? "").replace(/ 00:00:00(\.0+)?$/, "");
}


// names that usually hold an amount or a quantity
const MEASURE_NAME = /(AMT|AMOUNT|VALUE|WRBTR|DMBTR|NETWR|NETPR|PRICE|COST|TOTAL|NET|GROSS|MENGE|QTY|QUANT|SUM|REVENUE|SALES)/i;


// Choose a measure that makes sense as a default:
//   1. a column named like an amount / quantity
//   2. the last numeric column (keys usually come first)
//   3. any other column
function pickMeasure(columns, exclude) {

  const candidates = columns.filter((c) => c.name !== exclude);

  const byName = candidates.find((c) => MEASURE_NAME.test(c.name));

  if (byName) return byName.name;

  const numeric = candidates.filter((c) => isNumericType(c.type));

  if (numeric.length > 0) return numeric[numeric.length - 1].name;

  return (candidates[0] || columns[0])?.name || "";

}


// ---------------------------------------------------------
// Tooltip
// ---------------------------------------------------------

function VizTooltip({ active, payload, measureLabel }) {

  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const point = payload[0].payload;

  return (
    <div className="viz-tooltip">

      <div className="viz-tooltip-label">{point.label}</div>

      <div className="viz-tooltip-row">
        <span className="viz-tooltip-key" />
        <span>{measureLabel}</span>
        <strong>{full(point.value)}</strong>
      </div>

    </div>
  );

}


// ---------------------------------------------------------
// Page
// ---------------------------------------------------------

export default function Visualization({
  uploadedTables = [],
  derivedTables = [],
}) {

  const [allTables, setAllTables] = useState([]);
  const [allRelationships, setAllRelationships] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [config, setConfig] = useState({
    table: "",
    xTable: "",
    xColumn: "",
    yColumn: "",
    aggregation: "COUNT",
    chartType: "bar",
    sort: "VALUE_DESC",
    limit: 20,
  });

  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");

  const [view, setView] = useState("chart");


  // -----------------------------------------
  // LOAD THE DATA MODEL
  // -----------------------------------------

  useEffect(() => {

    async function load() {

      try {

        setError("");

        // make sure every uploaded file exists in the model
        if (uploadedTables.length > 0) {

          try {

            await fetch(`${API}/tables/sync`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tables: uploadedTables }),
            });

          } catch (err) {

            console.error("Table sync failed:", err);

          }

        }

        const [tablesResponse, relationshipsResponse] =
          await Promise.all([
            fetch(`${API}/tables`),
            fetch(`${API}/relationships/approved`),
          ]);

        if (!tablesResponse.ok) {
          throw new Error("Failed to load model tables.");
        }

        if (!relationshipsResponse.ok) {
          throw new Error("Failed to load relationships.");
        }

        const tablesData = await tablesResponse.json();
        const relationshipsData = await relationshipsResponse.json();

        setAllTables(tablesData.tables || []);
        setAllRelationships(relationshipsData.relationships || []);

      } catch (err) {

        setError(err.message || "Failed to load the data model.");

      } finally {

        setLoading(false);

      }

    }

    load();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedTables.join(",")]);


  // -----------------------------------------
  // WHICH TABLES BELONG TO THIS DATA MODEL
  // (same rule as the Data Model page)
  // -----------------------------------------

  const tables = useMemo(() => {

    const existing = new Set(allTables.map((t) => t.name));
    const keep = new Set();

    uploadedTables.forEach((raw) => {

      const name = String(raw).toUpperCase();

      if (existing.has(`${name}_MAPPED`)) {
        keep.add(`${name}_MAPPED`);
      } else if (existing.has(name)) {
        keep.add(name);
      }

    });

    derivedTables.forEach((raw) => {

      const name = String(raw).toUpperCase();

      if (existing.has(name)) {
        keep.add(name);
      }

    });

    return allTables.filter((t) => keep.has(t.name));

  }, [allTables, uploadedTables, derivedTables]);


  const relationships = useMemo(() => {

    const names = new Set(tables.map((t) => t.name));

    return allRelationships.filter(
      (r) => names.has(r.source_table) && names.has(r.target_table)
    );

  }, [allRelationships, tables]);


  const baseTable = tables.find((t) => t.name === config.table);

  const baseColumns = baseTable?.columns || [];


  // base table + tables linked to it by an approved relationship
  const groupSources = useMemo(() => {

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

  }, [baseTable, relationships, tables]);


  // -----------------------------------------
  // CONFIG HANDLERS
  // -----------------------------------------

  function update(changes) {
    setConfig((previous) => ({ ...previous, ...changes }));
  }


  // pick the first table once the model has loaded
  useEffect(() => {

    if (tables.length === 0) return;

    if (!tables.some((t) => t.name === config.table)) {

      changeTable(tables[0].name);

    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables]);


  function changeTable(name) {

    const table = tables.find((t) => t.name === name);

    setResult(null);

    update({
      table: name,
      xTable: "",
      xColumn: table?.columns?.[0]?.name || "",
      yColumn: "",
      aggregation: "COUNT",
    });

  }


  function changeGroupBy(encoded) {

    const [tableName, ...rest] = encoded.split("::");

    update({
      xTable: tableName === config.table ? "" : tableName,
      xColumn: rest.join("::"),
    });

  }


  function changeAggregation(aggregation) {

    const changes = { aggregation };

    // pick a sensible measure the first time one is needed
    if (aggregation !== "COUNT" && !config.yColumn) {

      changes.yColumn = pickMeasure(
        baseColumns,
        config.xTable ? "" : config.xColumn
      );

    }

    update(changes);

  }


  function changeChartType(chartType) {

    update({
      chartType,
      sort:
        chartType === "line" || chartType === "area"
          ? "LABEL_ASC"
          : "VALUE_DESC",
    });

  }


  // -----------------------------------------
  // RUN THE QUERY WHENEVER A CHOICE CHANGES
  // -----------------------------------------

  useEffect(() => {

    if (!config.table || !config.xColumn) return;

    if (config.aggregation !== "COUNT" && !config.yColumn) return;

    const controller = new AbortController();

    const timer = setTimeout(async () => {

      setRunning(true);
      setRunError("");

      try {

        const response = await fetch(`${API}/chart-query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            table: config.table,
            x_table: config.xTable || null,
            x_column: config.xColumn,
            y_column:
              config.aggregation === "COUNT"
                ? null
                : config.yColumn,
            aggregation: config.aggregation,
            sort: config.sort,
            limit: config.limit,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Could not build the chart.");
        }

        setResult({
          ...data,
          rows: (data.rows || []).map((row) => ({
            ...row,
            label: cleanLabel(row.label),
          })),
        });

      } catch (err) {

        if (err.name !== "AbortError") {

          setResult(null);
          setRunError(err.message);

        }

      } finally {

        if (!controller.signal.aborted) {
          setRunning(false);
        }

      }

    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };

  }, [
    config.table,
    config.xTable,
    config.xColumn,
    config.yColumn,
    config.aggregation,
    config.sort,
    config.limit,
  ]);


  // -----------------------------------------
  // DERIVED VALUES FOR THE UI
  // -----------------------------------------

  const rows = result?.rows || [];

  const aggregationLabel =
    AGGREGATIONS.find((a) => a.id === config.aggregation)?.label || "";

  const groupLabel = config.xTable
    ? `${config.xTable}.${config.xColumn}`
    : config.xColumn;

  const measureLabel =
    config.aggregation === "COUNT"
      ? "Rows"
      : `${aggregationLabel} of ${config.yColumn}`;

  const title = `${measureLabel} by ${groupLabel}`;

  const total = rows.reduce((sum, row) => sum + row.value, 0);

  const totalMakesSense =
    config.aggregation === "SUM" || config.aggregation === "COUNT";

  const top = rows.reduce(
    (best, row) => (best === null || row.value > best.value ? row : best),
    null
  );

  const numericColumns = baseColumns.filter((c) => isNumericType(c.type));
  const otherColumns = baseColumns.filter((c) => !isNumericType(c.type));


  // -----------------------------------------
  // CHART
  // -----------------------------------------

  function renderChart() {

    const showLabels = rows.length <= 12;

    const wholeNumbers = rows.every((row) => Number.isInteger(row.value));

    const axisTick = { fill: AXIS_TEXT, fontSize: 12 };

    const tooltip = (
      <Tooltip
        content={<VizTooltip measureLabel={measureLabel} />}
        cursor={{ fill: "rgba(42, 120, 214, 0.06)" }}
      />
    );

    if (config.chartType === "hbar") {

      const height = Math.max(320, rows.length * 32 + 60);

      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 8, right: 56, left: 8, bottom: 8 }}
          >
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis
              type="number"
              allowDecimals={!wholeNumbers}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={compact}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={150}
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              interval={0}
              tickFormatter={(value) => shorten(value, 22)}
            />
            {tooltip}
            <Bar
              dataKey="value"
              fill={SERIES}
              maxBarSize={24}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
            >
              {showLabels && (
                <LabelList
                  dataKey="value"
                  position="right"
                  formatter={compact}
                  fill={AXIS_TEXT}
                  fontSize={12}
                />
              )}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );

    }

    const commonMargin = { top: 20, right: 16, left: 4, bottom: 4 };

    const xAxis = (
      <XAxis
        dataKey="label"
        tick={axisTick}
        tickLine={false}
        axisLine={{ stroke: GRID }}
        interval={rows.length <= 24 ? 0 : "preserveStartEnd"}
        angle={-35}
        textAnchor="end"
        height={80}
        tickFormatter={(value) => shorten(value, 14)}
      />
    );

    const yAxis = (
      <YAxis
        allowDecimals={!wholeNumbers}
        tick={axisTick}
        tickLine={false}
        axisLine={false}
        width={56}
        tickFormatter={compact}
      />
    );

    const grid = <CartesianGrid vertical={false} stroke={GRID} />;

    const dot =
      rows.length <= 40
        ? {
            r: 4,
            fill: SERIES,
            stroke: SURFACE,
            strokeWidth: 2,
          }
        : false;

    const activeDot = {
      r: 6,
      fill: SERIES,
      stroke: SURFACE,
      strokeWidth: 2,
    };

    if (config.chartType === "line") {

      return (
        <ResponsiveContainer width="100%" height={420}>
          <LineChart data={rows} margin={commonMargin}>
            {grid}{xAxis}{yAxis}{tooltip}
            <Line
              type="monotone"
              dataKey="value"
              stroke={SERIES}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={dot}
              activeDot={activeDot}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      );

    }

    if (config.chartType === "area") {

      return (
        <ResponsiveContainer width="100%" height={420}>
          <AreaChart data={rows} margin={commonMargin}>
            {grid}{xAxis}{yAxis}{tooltip}
            <Area
              type="monotone"
              dataKey="value"
              stroke={SERIES}
              strokeWidth={2}
              fill={SERIES}
              fillOpacity={0.1}
              dot={dot}
              activeDot={activeDot}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      );

    }

    return (
      <ResponsiveContainer width="100%" height={420}>
        <BarChart data={rows} margin={commonMargin}>
          {grid}{xAxis}{yAxis}{tooltip}
          <Bar
            dataKey="value"
            fill={SERIES}
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          >
            {showLabels && (
              <LabelList
                dataKey="value"
                position="top"
                formatter={compact}
                fill={AXIS_TEXT}
                fontSize={12}
              />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );

  }


  // -----------------------------------------
  // RENDER
  // -----------------------------------------

  if (loading) {

    return (
      <section className="viz-page">
        <div className="viz-header">
          <div>
            <h1>Visualization</h1>
            <p>Loading the data model...</p>
          </div>
        </div>
      </section>
    );

  }


  if (uploadedTables.length === 0 || tables.length === 0) {

    return (
      <section className="viz-page">

        <div className="viz-header">
          <div>
            <h1>Visualization</h1>
            <p>
              {error ||
                "Upload a file first. Charts are built from the data model."}
            </p>
          </div>
        </div>

      </section>
    );

  }


  return (

    <section className="viz-page">

      <div className="viz-header">

        <div>
          <h1>Visualization</h1>
          <p>Chart the tables in your data model.</p>
        </div>

        <div className="viz-stats">

          <div className="viz-stat">
            <strong>{rows.length}</strong>
            <span>Groups shown</span>
          </div>

          <div className="viz-stat">
            <strong>{totalMakesSense ? compact(total) : "—"}</strong>
            <span>Total</span>
          </div>

          <div className="viz-stat">
            <strong title={top?.label}>
              {top ? shorten(top.label, 12) : "—"}
            </strong>
            <span>Highest group</span>
          </div>

        </div>

      </div>


      <div className="viz-body">

        {/* ---------------- controls ---------------- */}

        <aside className="viz-sidebar">

          <label className="viz-label">Table</label>

          <select
            value={config.table}
            onChange={(e) => changeTable(e.target.value)}
          >
            {tables.map((t) => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>


          <label className="viz-label">Group by (X axis)</label>

          <select
            value={`${config.xTable || config.table}::${config.xColumn}`}
            onChange={(e) => changeGroupBy(e.target.value)}
          >
            {groupSources.map((source) => (
              <optgroup
                key={source.table.name}
                label={
                  source.related
                    ? `${source.table.name} (related)`
                    : source.table.name
                }
              >
                {source.table.columns.map((c) => (
                  <option
                    key={c.name}
                    value={`${source.table.name}::${c.name}`}
                  >
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {groupSources.length === 1 && (
            <div className="viz-hint">
              Connect this table to others in the Data Model to group
              by their columns too.
            </div>
          )}


          <label className="viz-label">Calculate</label>

          <select
            value={config.aggregation}
            onChange={(e) => changeAggregation(e.target.value)}
          >
            {AGGREGATIONS.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>


          {config.aggregation !== "COUNT" && (

            <>
              <label className="viz-label">Measure (Y axis)</label>

              <select
                value={config.yColumn}
                onChange={(e) => update({ yColumn: e.target.value })}
              >
                {numericColumns.length > 0 && (
                  <optgroup label="Numeric columns">
                    {numericColumns.map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </optgroup>
                )}
                {otherColumns.length > 0 && (
                  <optgroup label="Other columns (read as numbers)">
                    {otherColumns.map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </>

          )}


          <label className="viz-label">Chart type</label>

          <div className="viz-segmented" role="group" aria-label="Chart type">
            {CHART_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={config.chartType === t.id ? "active" : ""}
                onClick={() => changeChartType(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>


          <label className="viz-label">Sort</label>

          <select
            value={config.sort}
            onChange={(e) => update({ sort: e.target.value })}
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>


          <label className="viz-label">Show up to</label>

          <select
            value={config.limit}
            onChange={(e) => update({ limit: Number(e.target.value) })}
          >
            {LIMITS.map((n) => (
              <option key={n} value={n}>{n} groups</option>
            ))}
          </select>

        </aside>


        {/* ---------------- chart ---------------- */}

        <div className="viz-main">

          <div className="viz-card">

            <div className="viz-card-head">

              <div>
                <h2>{title}</h2>
                <p>
                  {config.table}
                  {result?.truncated
                    ? ` · ${config.sort === "LABEL_ASC" ? "first" : "top"} ${config.limit} groups shown, more exist`
                    : ""}
                </p>
              </div>

              <div className="viz-segmented small" role="group" aria-label="View">
                <button
                  type="button"
                  className={view === "chart" ? "active" : ""}
                  onClick={() => setView("chart")}
                >
                  Chart
                </button>
                <button
                  type="button"
                  className={view === "table" ? "active" : ""}
                  onClick={() => setView("table")}
                >
                  Table
                </button>
              </div>

            </div>


            {runError && <div className="viz-notice error">{runError}</div>}

            {result?.warning && (
              <div className="viz-notice warning">{result.warning}</div>
            )}

            {running && rows.length === 0 && !runError && (
              <div className="viz-empty">Building chart...</div>
            )}

            {!running && !runError && rows.length === 0 && result && (
              <div className="viz-empty">
                No data to chart for this selection.
              </div>
            )}

            {rows.length > 0 && view === "chart" && (
              <div className={running ? "viz-chart busy" : "viz-chart"}>
                {renderChart()}
              </div>
            )}

            {rows.length > 0 && view === "table" && (
              <div className="viz-table-wrap">
                <table className="viz-table">
                  <thead>
                    <tr>
                      <th>{groupLabel}</th>
                      <th className="num">{measureLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.label}>
                        <td>{row.label}</td>
                        <td className="num">{full(row.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}


            {result?.sql && (
              <details className="viz-sql">
                <summary>View SQL</summary>
                <pre>{result.sql}</pre>
              </details>
            )}

          </div>

        </div>

      </div>

    </section>

  );

}