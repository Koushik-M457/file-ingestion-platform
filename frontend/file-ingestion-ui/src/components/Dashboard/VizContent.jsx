import { useMemo } from "react";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from "recharts";

import useApi from "./Useapi.js";

import {
  COLORS,
  CATEGORICAL,
  chartBody,
  cleanLabel,
  compact,
  full,
  isReady,
  measureLabelOf,
  shorten,
} from "./Dashboardconfig";


// ---------------------------------------------------------
// Tooltip
// ---------------------------------------------------------

function VizTooltip({ active, payload, measureLabel }) {

  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0].payload;

  return (
    <div className="viz-tooltip">

      <div className="viz-tooltip-label">{point.label}</div>

      <div className="viz-tooltip-row">
        <span
          className="viz-tooltip-key"
          style={point.color ? { background: point.color } : undefined}
        />
        <span>{measureLabel}</span>
        <strong>{full(point.value)}</strong>
        {point.percent !== undefined && (
          <span className="viz-tooltip-percent">
            {point.percent.toFixed(1)}%
          </span>
        )}
      </div>

    </div>
  );

}


// ---------------------------------------------------------
// Bar / Line / Area
// ---------------------------------------------------------

function BarOrLine({ type, config, rows }) {

  const measureLabel = measureLabelOf(config);

  const showLabels = rows.length <= 12;

  const wholeNumbers = rows.every((row) => Number.isInteger(row.value));

  const axisTick = { fill: COLORS.axis, fontSize: 12 };

  const tooltip = (
    <Tooltip
      content={<VizTooltip measureLabel={measureLabel} />}
      cursor={{ fill: "rgba(42, 120, 214, 0.06)" }}
    />
  );

  // ---------- horizontal bars ----------

  if (type === "bar" && config.orientation === "horizontal") {

    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 44, left: 4, bottom: 4 }}
        >
          <CartesianGrid horizontal={false} stroke={COLORS.grid} />
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
            width={110}
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: COLORS.grid }}
            interval={0}
            tickFormatter={(value) => shorten(value, 16)}
          />
          {tooltip}
          <Bar
            dataKey="value"
            fill={COLORS.series}
            maxBarSize={24}
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
          >
            {showLabels && (
              <LabelList
                dataKey="value"
                position="right"
                formatter={compact}
                fill={COLORS.axis}
                fontSize={12}
              />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );

  }

  // ---------- vertical charts ----------

  const margin = { top: 16, right: 12, left: 0, bottom: 0 };

  const tilt = rows.length > 6;

  const xAxis = (
    <XAxis
      dataKey="label"
      tick={axisTick}
      tickLine={false}
      axisLine={{ stroke: COLORS.grid }}
      interval={rows.length <= 24 ? 0 : "preserveStartEnd"}
      angle={tilt ? -35 : 0}
      textAnchor={tilt ? "end" : "middle"}
      height={tilt ? 64 : 28}
      tickFormatter={(value) => shorten(value, 12)}
    />
  );

  const yAxis = (
    <YAxis
      allowDecimals={!wholeNumbers}
      tick={axisTick}
      tickLine={false}
      axisLine={false}
      width={48}
      tickFormatter={compact}
    />
  );

  const grid = <CartesianGrid vertical={false} stroke={COLORS.grid} />;

  const dot =
    rows.length <= 40
      ? { r: 4, fill: COLORS.series, stroke: COLORS.surface, strokeWidth: 2 }
      : false;

  const activeDot = {
    r: 6,
    fill: COLORS.series,
    stroke: COLORS.surface,
    strokeWidth: 2,
  };

  if (type === "line" && config.area) {

    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={margin}>
          {grid}{xAxis}{yAxis}{tooltip}
          <Area
            type="monotone"
            dataKey="value"
            stroke={COLORS.series}
            strokeWidth={2}
            fill={COLORS.series}
            fillOpacity={0.1}
            dot={dot}
            activeDot={activeDot}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    );

  }

  if (type === "line") {

    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={margin}>
          {grid}{xAxis}{yAxis}{tooltip}
          <Line
            type="monotone"
            dataKey="value"
            stroke={COLORS.series}
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

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={margin}>
        {grid}{xAxis}{yAxis}{tooltip}
        <Bar
          dataKey="value"
          fill={COLORS.series}
          maxBarSize={24}
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        >
          {showLabels && (
            <LabelList
              dataKey="value"
              position="top"
              formatter={compact}
              fill={COLORS.axis}
              fontSize={12}
            />
          )}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

}


// ---------------------------------------------------------
// Pie (donut)
// ---------------------------------------------------------

function PieViz({ config, data }) {

  const measureLabel = measureLabelOf(config);

  const slices = useMemo(() => {

    const rows = (data.rows || []).map((row) => ({
      label: cleanLabel(row.label),
      value: row.value,
    }));

    // everything that did not make the top N becomes "Other"
    if (data.total != null && data.truncated) {

      const shown = rows.reduce((sum, row) => sum + row.value, 0);

      const rest = data.total - shown;

      if (rest > 0.0001) {
        rows.push({ label: "Other", value: rest, other: true });
      }

    }

    const sum = rows.reduce((total, row) => total + row.value, 0) || 1;

    return rows.map((row, index) => ({
      ...row,
      percent: (row.value / sum) * 100,
      color: row.other
        ? COLORS.other
        : CATEGORICAL[index % CATEGORICAL.length],
    }));

  }, [data]);

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  const totalMakesSense =
    config.aggregation === "SUM" || config.aggregation === "COUNT";

  return (
    <div className="dash-pie">

      <div className="dash-pie-chart">

        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              content={<VizTooltip measureLabel={measureLabel} />}
            />
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="58%"
              outerRadius="92%"
              startAngle={90}
              endAngle={-270}
              stroke={COLORS.surface}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((slice) => (
                <Cell key={slice.label} fill={slice.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {totalMakesSense && (
          <div className="dash-pie-center">
            <strong>{compact(total)}</strong>
            <span>Total</span>
          </div>
        )}

      </div>

      <ul className="dash-legend">
        {slices.map((slice) => (
          <li key={slice.label}>
            <span
              className="dash-legend-key"
              style={{ background: slice.color }}
            />
            <span className="dash-legend-label" title={slice.label}>
              {slice.label}
            </span>
            <span className="dash-legend-value">
              {compact(slice.value)}
              <small>{slice.percent.toFixed(0)}%</small>
            </span>
          </li>
        ))}
      </ul>

    </div>
  );

}


// ---------------------------------------------------------
// KPI card
// ---------------------------------------------------------

function KpiViz({ config, data }) {

  const row = data.rows?.[0];

  if (!row) {
    return <div className="dash-empty">No value</div>;
  }

  const shown = Math.abs(row.value) >= 100000 ? compact(row.value) : full(row.value);

  return (
    <div className="dash-kpi">
      <div className="dash-kpi-value" title={full(row.value)}>
        {shown}
      </div>
      <div className="dash-kpi-label">{measureLabelOf(config)}</div>
    </div>
  );

}


// ---------------------------------------------------------
// Table
// ---------------------------------------------------------

function TableViz({ data }) {

  return (
    <div className="dash-table-wrap">

      <table className="viz-table">
        <thead>
          <tr>
            {data.columns.map((column) => (
              <th
                key={column.name}
                className={/INT|DOUBLE|DECIMAL|FLOAT|REAL/i.test(column.type) ? "num" : ""}
              >
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((value, columnIndex) => (
                <td
                  key={columnIndex}
                  className={/INT|DOUBLE|DECIMAL|FLOAT|REAL/i.test(data.columns[columnIndex].type) ? "num" : ""}
                >
                  {value === null ? "" : String(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {data.truncated && (
        <div className="dash-table-note">
          Showing {data.rows.length} of {full(data.row_count)} rows
        </div>
      )}

    </div>
  );

}


// ---------------------------------------------------------
// One component: asks for its own data and draws it
// ---------------------------------------------------------

export default function VizContent({ type, config }) {

  const ready = isReady(type, config);

  const isTable = type === "table";

  const body = useMemo(
    () =>
      isTable
        ? {
            table: config.table,
            columns: config.columns,
            limit: config.rowLimit,
          }
        : chartBody(type, config),
    [type, config, isTable]
  );

  const { data, loading, error } = useApi(
    isTable ? "table-rows" : "chart-query",
    body,
    ready
  );

  if (!ready) {
    return <div className="dash-empty">Choose the data in Settings.</div>;
  }

  if (error) {
    return <div className="dash-empty error">{error}</div>;
  }

  if (!data) {
    return <div className="dash-empty">{loading ? "Loading..." : ""}</div>;
  }

  let content;

  if (isTable) {

    content = <TableViz data={data} />;

  } else if (type === "kpi") {

    content = <KpiViz config={config} data={data} />;

  } else if (!data.rows || data.rows.length === 0) {

    content = (
      <div className="dash-empty">
        {data.warning || "No data for this selection."}
      </div>
    );

  } else if (type === "pie") {

    content = <PieViz config={config} data={data} />;

  } else {

    const rows = data.rows.map((row) => ({
      ...row,
      label: cleanLabel(row.label),
    }));

    content = <BarOrLine type={type} config={config} rows={rows} />;

  }

  return (
    <div className={loading ? "dash-viz busy" : "dash-viz"}>

      {content}

      {data.warning && data.rows?.length > 0 && (
        <div className="dash-warning" title={data.warning}>
          ⚠ {data.warning}
        </div>
      )}

    </div>
  );

}