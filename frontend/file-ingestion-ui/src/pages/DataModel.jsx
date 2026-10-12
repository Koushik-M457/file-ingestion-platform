import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";
import "./DataModel.css";


const API_BASE = "http://127.0.0.1:8000";
const API = `${API_BASE}/api/data-model`;

const CARDINALITIES = ["1:N", "N:1", "1:1", "N:N"];

const EMPTY_FORM = {
  sourceTable: "",
  sourceColumn: "",
  targetTable: "",
  targetColumn: "",
  cardinality: "1:N",
};


export default function DataModel({
  uploadedTables = [],
  derivedTables = [],
}) {

  const [allTables, setAllTables] = useState([]);
  const [allRelationships, setAllRelationships] = useState([]);
  const [candidates, setCandidates] = useState([]);

  const [form, setForm] = useState(EMPTY_FORM);

  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null); // { type, text }



  // -----------------------------------------
  // ONLY SHOW TABLES FROM THE FILES UPLOADED
  // (plus tables created by the SQL transformer)
  //
  //   uploaded BKPF -> BKPF_MAPPED if it exists, otherwise BKPF
  //   transformer output tables -> shown as they are
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


  const visibleNames = useMemo(
    () => new Set(tables.map((t) => t.name)),
    [tables]
  );


  const relationships = useMemo(
    () =>
      allRelationships.filter(
        (r) =>
          visibleNames.has(r.source_table) &&
          visibleNames.has(r.target_table)
      ),
    [allRelationships, visibleNames]
  );


  const visibleCandidates = useMemo(
    () =>
      candidates.filter(
        (c) =>
          visibleNames.has(c.source_table) &&
          visibleNames.has(c.target_table)
      ),
    [candidates, visibleNames]
  );


  // -----------------------------------------
  // LOAD TABLES + APPROVED RELATIONSHIPS
  // -----------------------------------------

  const loadDataModel = useCallback(async () => {

    try {

      setError("");

      const [tablesResponse, relationshipsResponse] =
        await Promise.all([
          fetch(`${API}/tables`),
          fetch(`${API}/relationships/approved`),
        ]);

      if (!tablesResponse.ok) {
        throw new Error("Failed to load model tables.");
      }

      if (!relationshipsResponse.ok) {
        throw new Error("Failed to load approved relationships.");
      }

      const tablesData = await tablesResponse.json();
      const relationshipsData = await relationshipsResponse.json();

      setAllTables(tablesData.tables || []);
      setAllRelationships(relationshipsData.relationships || []);

    } catch (err) {

      console.error("Data model loading error:", err);
      setError(err.message || "Failed to load data model.");

    } finally {

      setLoading(false);

    }

  }, []);


  // Make sure every uploaded file exists in the model schema
  // (unmapped files are exposed as views), then load the model.
  const uploadedKey = uploadedTables.join(",");

  useEffect(() => {

    async function start() {

      try {

        if (uploadedTables.length > 0) {

          await fetch(`${API}/tables/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tables: uploadedTables }),
          });

        }

      } catch (err) {

        console.error("Table sync failed:", err);

      }

      await loadDataModel();

    }

    start();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDataModel, uploadedKey]);


  // -----------------------------------------
  // HELPERS
  // -----------------------------------------

  const columnsOf = useCallback(
    (tableName) =>
      (tables.find((t) => t.name === tableName)?.columns || [])
        .map((c) => c.name),
    [tables]
  );


  // pick `preferred` if the table has it, otherwise the first column
  const pickColumn = useCallback(
    (tableName, preferred) => {

      const columns = columnsOf(tableName);

      const match = columns.find(
        (c) => c.toLowerCase() === (preferred || "").toLowerCase()
      );

      return match || columns[0] || "";

    },
    [columnsOf]
  );


  // default the form to the first two tables once they load
  useEffect(() => {

    if (tables.length === 0 || form.sourceTable) {
      return;
    }

    const first = tables[0].name;
    const second = (tables[1] || tables[0]).name;

    const sourceColumn = pickColumn(first, "");

    setForm({
      sourceTable: first,
      sourceColumn,
      targetTable: second,
      targetColumn: pickColumn(second, sourceColumn),
      cardinality: "1:N",
    });

  }, [tables, form.sourceTable, pickColumn]);


  function changeSourceTable(tableName) {

    const sourceColumn = pickColumn(tableName, "");

    setForm((prev) => ({
      ...prev,
      sourceTable: tableName,
      sourceColumn,
      targetColumn: pickColumn(prev.targetTable, sourceColumn),
    }));

  }


  function changeSourceColumn(columnName) {

    setForm((prev) => ({
      ...prev,
      sourceColumn: columnName,
      targetColumn: pickColumn(prev.targetTable, columnName),
    }));

  }


  function changeTargetTable(tableName) {

    setForm((prev) => ({
      ...prev,
      targetTable: tableName,
      targetColumn: pickColumn(tableName, prev.sourceColumn),
    }));

  }


  function swapDirection() {

    setForm((prev) => ({
      ...prev,
      sourceTable: prev.targetTable,
      sourceColumn: prev.targetColumn,
      targetTable: prev.sourceTable,
      targetColumn: prev.sourceColumn,
    }));

  }


  // -----------------------------------------
  // SAVE (APPROVE / REJECT)
  // -----------------------------------------

  async function saveRelationship(rel, action) {

    setSaving(true);
    setNotice(null);

    try {

      const response = await fetch(`${API}/relationships/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_table: rel.source_table,
          source_column: rel.source_column,
          target_table: rel.target_table,
          target_column: rel.target_column,
          cardinality: rel.cardinality,
          confidence: rel.confidence || "HIGH",
          action,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to save relationship.");
      }

      // remove it from the suggestion list
      setCandidates((prev) =>
        prev.filter(
          (c) =>
            !(
              c.source_table === rel.source_table &&
              c.source_column === rel.source_column &&
              c.target_table === rel.target_table &&
              c.target_column === rel.target_column
            )
        )
      );

      setNotice({
        type: "success",
        text:
          action === "APPROVE"
            ? `Connected ${rel.source_table}.${rel.source_column} → ${rel.target_table}.${rel.target_column}`
            : "Suggestion rejected.",
      });

      await loadDataModel();

    } catch (err) {

      setNotice({ type: "error", text: err.message });

    } finally {

      setSaving(false);

    }

  }


  function connectSelected() {

    if (!form.sourceTable || !form.targetTable) {
      setNotice({ type: "error", text: "Select both tables." });
      return;
    }

    if (form.sourceTable === form.targetTable) {
      setNotice({
        type: "error",
        text: "Source and target must be different tables.",
      });
      return;
    }

    saveRelationship(
      {
        source_table: form.sourceTable,
        source_column: form.sourceColumn,
        target_table: form.targetTable,
        target_column: form.targetColumn,
        cardinality: form.cardinality,
        confidence: "HIGH",
      },
      "APPROVE"
    );

  }


  // -----------------------------------------
  // DISCOVER SUGGESTIONS
  // -----------------------------------------

  async function discover() {

    setDiscovering(true);
    setNotice(null);

    try {

      const response = await fetch(`${API}/relationships/discover`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Discovery failed.");
      }

      setCandidates(data.relationships || []);

      if ((data.relationships || []).length === 0) {
        setNotice({
          type: "info",
          text: "No new suggestions found. Pick tables manually above.",
        });
      }

    } catch (err) {

      setNotice({ type: "error", text: err.message });

    } finally {

      setDiscovering(false);

    }

  }


  function useCandidate(candidate) {

    setForm({
      sourceTable: candidate.source_table,
      sourceColumn: candidate.source_column,
      targetTable: candidate.target_table,
      targetColumn: candidate.target_column,
      cardinality: candidate.cardinality,
    });

  }


  // -----------------------------------------
  // DELETE
  // -----------------------------------------

  async function deleteRelationship(id) {

    setNotice(null);

    try {

      const response = await fetch(`${API}/relationships/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to delete relationship.");
      }

      await loadDataModel();

    } catch (err) {

      setNotice({ type: "error", text: err.message });

    }

  }


  // -----------------------------------------
  // DIAGRAM NODES + EDGES
  // -----------------------------------------

  const nodes = useMemo(() => {

    return tables.map((table, index) => {

      const isSource = table.name === form.sourceTable;
      const isTarget = table.name === form.targetTable;

      const highlight = isSource
        ? " is-source"
        : isTarget
          ? " is-target"
          : "";

      return {

        id: table.name,

        position: {
          x: (index % 3) * 380,
          y: Math.floor(index / 3) * 360,
        },

        data: {

          label: (

            <div className={`table-node${highlight}`}>

              <div className="table-node-header">
                <span>{table.name}</span>
                <small>{table.row_count} rows</small>
              </div>

              <div className="table-node-body">

                {(table.columns || []).map((column) => {

                  const used =
                    (isSource && column.name === form.sourceColumn) ||
                    (isTarget && column.name === form.targetColumn);

                  return (
                    <div
                      className={
                        used
                          ? "data-model-column is-key"
                          : "data-model-column"
                      }
                      key={column.name}
                    >
                      <span className="column-name">{column.name}</span>
                      <span className="column-type">{column.type}</span>
                    </div>
                  );

                })}

              </div>

            </div>

          ),

        },

        style: {
          padding: 0,
          border: "none",
          background: "transparent",
          width: 300,
        },

      };

    });

  }, [tables, form]);


  const edges = useMemo(() => {

    return relationships.map((relationship) => ({

      id: `relationship-${relationship.id}`,
      source: relationship.source_table,
      target: relationship.target_table,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
      label: `${relationship.source_column} → ${relationship.target_column} (${relationship.cardinality})`,
      labelStyle: { fontSize: 11, fontWeight: 600 },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 4,

    }));

  }, [relationships]);


  // -----------------------------------------
  // RENDER
  // -----------------------------------------

  if (loading) {

    return (
      <section className="data-model-page">
        <div className="data-model-header">
          <div>
            <h1>Data Model</h1>
            <p>Loading tables...</p>
          </div>
        </div>
      </section>
    );

  }



  if (uploadedTables.length === 0) {

    return (
      <section className="data-model-page">
        <div className="data-model-header">
          <div>
            <h1>Data Model</h1>
            <p>Upload a file to build the data model.</p>
          </div>
        </div>
      </section>
    );

  }

  return (

    <section className="data-model-page">

      <div className="data-model-header">

        <div>
          <h1>Data Model</h1>
          <p>
            Pick two tables, choose the columns that link them,
            and connect them.
          </p>
        </div>

        <div className="data-model-stats">

          <div className="model-stat">
            <strong>{tables.length}</strong>
            <span>Tables</span>
          </div>

          <div className="model-stat">
            <strong>{relationships.length}</strong>
            <span>Relationships</span>
          </div>

        </div>

      </div>


      {error && <div className="data-model-error">{error}</div>}


      <div className="data-model-body">

        <aside className="data-model-sidebar">

          {/* ---------- CREATE RELATIONSHIP ---------- */}

          <div className="rel-panel">

            <h3>Connect tables</h3>

            {tables.length < 2 ? (

              <p className="rel-hint">
                You need at least two tables in the model schema.
              </p>

            ) : (

              <>
                <label className="rel-label">From table (one side)</label>

                <select
                  value={form.sourceTable}
                  onChange={(e) => changeSourceTable(e.target.value)}
                >
                  {tables.map((t) => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>

                <select
                  value={form.sourceColumn}
                  onChange={(e) => changeSourceColumn(e.target.value)}
                >
                  {columnsOf(form.sourceTable).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <button
                  type="button"
                  className="rel-swap"
                  onClick={swapDirection}
                  title="Swap source and target"
                >
                  ⇅ Swap
                </button>

                <label className="rel-label">To table (many side)</label>

                <select
                  value={form.targetTable}
                  onChange={(e) => changeTargetTable(e.target.value)}
                >
                  {tables.map((t) => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>

                <select
                  value={form.targetColumn}
                  onChange={(e) =>
                    setForm({ ...form, targetColumn: e.target.value })
                  }
                >
                  {columnsOf(form.targetTable).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <label className="rel-label">Relationship type</label>

                <select
                  value={form.cardinality}
                  onChange={(e) =>
                    setForm({ ...form, cardinality: e.target.value })
                  }
                >
                  {CARDINALITIES.map((c) => (
                    <option key={c} value={c}>
                      {c === "1:N" ? "1:N (one to many)" : c}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="rel-primary"
                  onClick={connectSelected}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Connect tables"}
                </button>
              </>

            )}

            {notice && (
              <div className={`rel-notice ${notice.type}`}>
                {notice.text}
              </div>
            )}

          </div>


          {/* ---------- SUGGESTIONS ---------- */}

          <div className="rel-panel">

            <h3>Suggested relationships</h3>

            <button
              type="button"
              onClick={discover}
              disabled={discovering}
            >
              {discovering ? "Discovering..." : "Discover relationships"}
            </button>

            {visibleCandidates.map((c, i) => (

              <div className="rel-card" key={i}>

                <div className="rel-card-title">
                  {c.source_table}.{c.source_column}
                  {" → "}
                  {c.target_table}.{c.target_column}
                </div>

                <div className="rel-card-meta">
                  {c.cardinality} · {c.match_percentage}% match ·{" "}
                  {c.confidence}
                </div>

                <div className="rel-card-actions">
                  <button type="button" onClick={() => useCandidate(c)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => saveRelationship(c, "APPROVE")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => saveRelationship(c, "REJECT")}
                  >
                    Reject
                  </button>
                </div>

              </div>

            ))}

          </div>


          {/* ---------- APPROVED LIST ---------- */}

          <div className="rel-panel">

            <h3>Connected ({relationships.length})</h3>

            {relationships.length === 0 && (
              <p className="rel-hint">Nothing connected yet.</p>
            )}

            {relationships.map((r) => (

              <div className="rel-card" key={r.id}>

                <div className="rel-card-title">
                  {r.source_table}.{r.source_column}
                  {" → "}
                  {r.target_table}.{r.target_column}
                </div>

                <div className="rel-card-meta">{r.cardinality}</div>

                <div className="rel-card-actions">
                  <button
                    type="button"
                    onClick={() => deleteRelationship(r.id)}
                  >
                    Remove
                  </button>
                </div>

              </div>

            ))}

          </div>

        </aside>


        <div className="data-model-canvas">

          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            minZoom={0.2}
            maxZoom={2}
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>

        </div>

      </div>

    </section>

  );

}