import { useEffect, useMemo, useState } from "react";

import DashboardCanvas from "../components/Dashboard/DashboardCanvas";
import ComponentSettings from "../components/Dashboard/ComponentSettings";
import VizContent from "../components/Dashboard/VizContent";

import {
  API,
  COMPONENT_TYPES,
  autoTitle,
  findFreeSpot,
  makeDefaultConfig,
  typeInfo,
  uid,
} from "../components/Dashboard/dashboardConfig";

import "./Visualization.css";


const STORAGE_KEY = "vizDashboard.v1";


function newSheet(name) {
  return { id: uid(), name, items: [] };
}


// the dashboard (sheets + components) is kept in this browser
function loadDashboard() {

  try {

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");

    if (saved && Array.isArray(saved.sheets) && saved.sheets.length > 0) {

      return {
        sheets: saved.sheets,
        activeId: saved.sheets.some((s) => s.id === saved.activeId)
          ? saved.activeId
          : saved.sheets[0].id,
      };

    }

  } catch {
    // ignore a broken or unavailable storage
  }

  const sheet = newSheet("Sheet 1");

  return { sheets: [sheet], activeId: sheet.id };

}


export default function Visualization({
  uploadedTables = [],
  derivedTables = [],
}) {

  // -----------------------------------------
  // DATA MODEL
  // -----------------------------------------

  const [allTables, setAllTables] = useState([]);
  const [allRelationships, setAllRelationships] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");


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


  // only the tables that belong to this data model
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


  // -----------------------------------------
  // DASHBOARD: sheets + components
  // -----------------------------------------

  const [dash, setDash] = useState(loadDashboard);

  const [selectedId, setSelectedId] = useState(null);

  const [panelTab, setPanelTab] = useState("components");

  const [search, setSearch] = useState("");

  const [dragType, setDragType] = useState(null);

  const [renamingId, setRenamingId] = useState(null);


  useEffect(() => {

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dash));
    } catch {
      // storage unavailable - the dashboard just won't survive a refresh
    }

  }, [dash]);


  const sheet = dash.sheets.find((s) => s.id === dash.activeId) || dash.sheets[0];

  const items = sheet.items;

  const selected = items.find((i) => i.id === selectedId) || null;


  function updateSheet(change) {

    setDash((previous) => ({
      ...previous,
      sheets: previous.sheets.map((s) =>
        s.id === previous.activeId ? { ...s, ...change(s) } : s
      ),
    }));

  }

  function setItems(nextItems) {
    updateSheet(() => ({ items: nextItems }));
  }


  // ---------- components ----------

  function addComponent(type, spot) {

    const info = typeInfo(type);

    const position =
      spot || findFreeSpot(items, info.w, info.h);

    const item = {
      id: uid(),
      type,
      col: position.col,
      row: position.row,
      w: info.w,
      h: info.h,
      config: makeDefaultConfig(type, tables),
    };

    setItems([...items, item]);

    selectItem(item.id);

  }

  function updateConfig(id, patch) {

    setItems(
      items.map((i) =>
        i.id === id ? { ...i, config: { ...i.config, ...patch } } : i
      )
    );

  }

  function deleteItem(id) {

    setItems(items.filter((i) => i.id !== id));

    if (selectedId === id) {
      setSelectedId(null);
      setPanelTab("components");
    }

  }

  function duplicateItem(id) {

    const original = items.find((i) => i.id === id);

    if (!original) return;

    const spot = findFreeSpot(items, original.w, original.h, original.col, original.row);

    const copy = {
      ...original,
      id: uid(),
      col: spot.col,
      row: spot.row,
      config: { ...original.config },
    };

    setItems([...items, copy]);

    selectItem(copy.id);

  }

  function selectItem(id) {

    setSelectedId(id);

    if (id) setPanelTab("settings");

  }


  // ---------- sheets (tabs) ----------

  function addSheet() {

    const created = newSheet(`Sheet ${dash.sheets.length + 1}`);

    setDash({
      sheets: [...dash.sheets, created],
      activeId: created.id,
    });

    setSelectedId(null);
    setPanelTab("components");

  }

  function openSheet(id) {

    setDash({ ...dash, activeId: id });
    setSelectedId(null);
    setPanelTab("components");

  }

  function renameSheet(id, name) {

    setDash({
      ...dash,
      sheets: dash.sheets.map((s) =>
        s.id === id ? { ...s, name: name.trim() || s.name } : s
      ),
    });

  }

  function deleteSheet(id) {

    if (dash.sheets.length === 1) return;

    if (!window.confirm("Delete this sheet and all its components?")) return;

    const remaining = dash.sheets.filter((s) => s.id !== id);

    setDash({
      sheets: remaining,
      activeId: dash.activeId === id ? remaining[0].id : dash.activeId,
    });

    setSelectedId(null);

  }


  // -----------------------------------------
  // RENDER
  // -----------------------------------------

  if (loading) {

    return (
      <section className="viz-page">
        <div className="viz-empty-page">Loading the data model...</div>
      </section>
    );

  }

  if (uploadedTables.length === 0 || tables.length === 0) {

    return (
      <section className="viz-page">
        <div className="viz-empty-page">
          {error ||
            "Upload a file first. Components are built from the data model."}
        </div>
      </section>
    );

  }


  const visibleTypes = COMPONENT_TYPES.filter((t) =>
    t.label.toLowerCase().includes(search.trim().toLowerCase())
  );

  const groups = [...new Set(visibleTypes.map((t) => t.group))];


  return (

    <section className="viz-page">

      {/* ---------------- sheet tabs ---------------- */}

      <div className="dash-tabs">

        <button
          type="button"
          className="dash-tab-add"
          title="Add sheet"
          aria-label="Add sheet"
          onClick={addSheet}
        >
          +
        </button>

        {dash.sheets.map((s) => (

          <div
            key={s.id}
            className={s.id === sheet.id ? "dash-tab active" : "dash-tab"}
            onClick={() => openSheet(s.id)}
            onDoubleClick={() => setRenamingId(s.id)}
          >

            {renamingId === s.id ? (

              <input
                autoFocus
                defaultValue={s.name}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  renameSheet(s.id, e.target.value);
                  setRenamingId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.target.blur();
                  if (e.key === "Escape") setRenamingId(null);
                }}
              />

            ) : (

              <span title="Double-click to rename">{s.name}</span>

            )}

            {s.id === sheet.id && dash.sheets.length > 1 && (
              <button
                type="button"
                className="dash-tab-close"
                title="Delete sheet"
                aria-label="Delete sheet"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSheet(s.id);
                }}
              >
                ×
              </button>
            )}

          </div>

        ))}

      </div>


      <div className="dash-body">

        {/* ---------------- canvas ---------------- */}

        <DashboardCanvas
          items={items}
          selectedId={selectedId}
          dragType={dragType}
          getTitle={(item) =>
            item.config.title || autoTitle(item.type, item.config)
          }
          renderBody={(item) => (
            <VizContent type={item.type} config={item.config} />
          )}
          onSelect={selectItem}
          onItemsChange={setItems}
          onDropType={(type, spot) => {
            setDragType(null);
            addComponent(type, spot);
          }}
          onDelete={deleteItem}
          onDuplicate={duplicateItem}
        />


        {/* ---------------- right panel ---------------- */}

        <aside className="dash-panel">

          <div className="dash-panel-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={panelTab === "components"}
              className={panelTab === "components" ? "active" : ""}
              onClick={() => setPanelTab("components")}
            >
              Components
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panelTab === "settings"}
              className={panelTab === "settings" ? "active" : ""}
              onClick={() => setPanelTab("settings")}
            >
              Settings
            </button>
          </div>


          {panelTab === "components" && (
            <div className="dash-panel-body">

              <input
                type="search"
                className="dash-search"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {groups.map((group) => (

                <div key={group}>

                  <div className="dash-group-title">{group}</div>

                  <div className="dash-palette">

                    {visibleTypes
                      .filter((t) => t.group === group)
                      .map((t) => (

                        <div
                          key={t.type}
                          className="dash-palette-item"
                          role="button"
                          tabIndex={0}
                          draggable
                          title="Drag onto the canvas, or click to add"
                          data-type={t.type}
                          onDragStart={(e) => {
                            e.dataTransfer.setData(
                              "application/x-viz-component",
                              t.type
                            );
                            e.dataTransfer.effectAllowed = "copy";
                            setDragType(t.type);
                          }}
                          onDragEnd={() => setDragType(null)}
                          onClick={() => addComponent(t.type)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addComponent(t.type);
                          }}
                        >
                          {t.icon}
                          <span>{t.label}</span>
                        </div>

                      ))}

                  </div>

                </div>

              ))}

              {visibleTypes.length === 0 && (
                <div className="viz-hint">No component matches “{search}”.</div>
              )}

            </div>
          )}


          {panelTab === "settings" && (
            <div className="dash-panel-body">

              {selected ? (

                <ComponentSettings
                  item={selected}
                  tables={tables}
                  relationships={relationships}
                  onChange={(patch) => updateConfig(selected.id, patch)}
                  onDelete={() => deleteItem(selected.id)}
                />

              ) : (

                <div className="viz-hint">
                  Select a component on the canvas to change its settings.
                </div>

              )}

            </div>
          )}

        </aside>

      </div>

    </section>

  );

}