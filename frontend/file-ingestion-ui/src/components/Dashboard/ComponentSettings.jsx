import {
  AGGREGATIONS,
  LIMITS,
  ROW_LIMITS,
  SORTS,
  autoTitle,
  getGroupSources,
  isNumericType,
  pickMeasure,
  typeInfo,
} from "./Dashboardconfig.jsx";


export default function ComponentSettings({
  item,
  tables,
  relationships,
  onChange,
  onDelete,
}) {

  const { type, config } = item;

  const info = typeInfo(type);

  const baseTable = tables.find((t) => t.name === config.table);

  const baseColumns = baseTable?.columns || [];

  const groupSources = getGroupSources(baseTable, tables, relationships);

  const numericColumns = baseColumns.filter((c) => isNumericType(c.type));
  const otherColumns = baseColumns.filter((c) => !isNumericType(c.type));

  const isChart = type === "bar" || type === "line" || type === "pie";


  function changeTable(name) {

    const table = tables.find((t) => t.name === name);

    onChange({
      table: name,
      xTable: "",
      xColumn: table?.columns?.[0]?.name || "",
      yColumn: "",
      columns: [],
    });

  }


  function changeGroupBy(encoded) {

    const [tableName, ...rest] = encoded.split("::");

    onChange({
      xTable: tableName === config.table ? "" : tableName,
      xColumn: rest.join("::"),
    });

  }


  function changeAggregation(aggregation) {

    const patch = { aggregation };

    if (aggregation !== "COUNT" && !config.yColumn) {

      patch.yColumn = pickMeasure(
        baseColumns,
        config.xTable ? "" : config.xColumn
      );

    }

    onChange(patch);

  }


  function toggleColumn(name) {

    const current = config.columns || [];

    onChange({
      columns: current.includes(name)
        ? current.filter((c) => c !== name)
        : [...current, name],
    });

  }


  return (
    <div className="dash-settings">

      <div className="dash-settings-head">
        <span className="dash-settings-icon">{info.icon}</span>
        <div>
          <strong>{info.label}</strong>
          <small>Settings</small>
        </div>
      </div>


      <label className="viz-label">Title</label>

      <input
        type="text"
        value={config.title}
        placeholder={autoTitle(type, config)}
        onChange={(e) => onChange({ title: e.target.value })}
      />


      <label className="viz-label">Table</label>

      <select
        value={config.table}
        onChange={(e) => changeTable(e.target.value)}
      >
        {tables.map((t) => (
          <option key={t.name} value={t.name}>{t.name}</option>
        ))}
      </select>


      {/* ---------- X axis ---------- */}

      {isChart && (
        <>
          <label className="viz-label">
            {type === "pie" ? "Slices (category)" : "X axis (group by)"}
          </label>

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
              Connect this table to others in the Data Model to group by
              their columns too.
            </div>
          )}
        </>
      )}


      {/* ---------- Y axis ---------- */}

      {type !== "table" && (
        <>
          <label className="viz-label">
            {type === "kpi" ? "Calculate" : "Y axis (calculate)"}
          </label>

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
              <label className="viz-label">Measure column</label>

              <select
                value={config.yColumn}
                onChange={(e) => onChange({ yColumn: e.target.value })}
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
        </>
      )}


      {/* ---------- type specific ---------- */}

      {type === "bar" && (
        <>
          <label className="viz-label">Direction</label>

          <div className="viz-segmented" role="group" aria-label="Direction">
            {["vertical", "horizontal"].map((o) => (
              <button
                key={o}
                type="button"
                className={config.orientation === o ? "active" : ""}
                onClick={() => onChange({ orientation: o })}
              >
                {o === "vertical" ? "Vertical" : "Horizontal"}
              </button>
            ))}
          </div>
        </>
      )}

      {type === "line" && (
        <label className="viz-check">
          <input
            type="checkbox"
            checked={config.area}
            onChange={(e) => onChange({ area: e.target.checked })}
          />
          Fill the area under the line
        </label>
      )}

      {isChart && (
        <>
          <label className="viz-label">Sort</label>

          <select
            value={config.sort}
            onChange={(e) => onChange({ sort: e.target.value })}
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>

          <label className="viz-label">
            {type === "pie" ? "Slices (the rest becomes “Other”)" : "Show up to"}
          </label>

          <select
            value={config.limit}
            onChange={(e) => onChange({ limit: Number(e.target.value) })}
          >
            {(type === "pie" ? LIMITS.filter((n) => n <= 8) : LIMITS).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </>
      )}

      {type === "table" && (
        <>
          <label className="viz-label">Columns</label>

          <div className="dash-column-list">
            {baseColumns.map((c) => (
              <label key={c.name} className="viz-check">
                <input
                  type="checkbox"
                  checked={(config.columns || []).includes(c.name)}
                  onChange={() => toggleColumn(c.name)}
                />
                {c.name}
              </label>
            ))}
          </div>

          <div className="viz-hint">
            {(config.columns || []).length === 0
              ? "No column ticked: the first 12 columns are shown."
              : `${config.columns.length} columns selected.`}
          </div>

          <label className="viz-label">Rows</label>

          <select
            value={config.rowLimit}
            onChange={(e) => onChange({ rowLimit: Number(e.target.value) })}
          >
            {ROW_LIMITS.map((n) => (
              <option key={n} value={n}>{n} rows</option>
            ))}
          </select>
        </>
      )}


      <button type="button" className="dash-danger" onClick={onDelete}>
        Remove component
      </button>

    </div>
  );

}