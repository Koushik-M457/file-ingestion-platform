import { useEffect, useState } from "react";

import Upload from "./pages/Upload";
import Transform from "./pages/Transform";
import DataModel from "./pages/DataModel";

import "./App.css";


const PAGES = [
  { id: "upload", label: "1. Upload & Mapping" },
  { id: "transform", label: "2. SQL Transformer" },
  { id: "data-model", label: "3. Data Model" },
];


// remember the lists across a browser refresh
function loadStored(key) {

  try {

    const value = JSON.parse(localStorage.getItem(key) || "[]");

    return Array.isArray(value) ? value : [];

  } catch {

    return [];

  }

}


function saveStored(key, value) {

  try {

    localStorage.setItem(key, JSON.stringify(value));

  } catch {
    // storage unavailable - the lists just won't survive a refresh
  }

}


function App() {

  const [page, setPage] = useState("upload");

  // tables created by the files uploaded on page 1
  const [tables, setTables] = useState(() => loadStored("uploadedTables"));

  // tables created by the SQL transformer on page 2
  const [derivedTables, setDerivedTables] = useState(
    () => loadStored("derivedTables")
  );


  useEffect(() => saveStored("uploadedTables", tables), [tables]);
  useEffect(() => saveStored("derivedTables", derivedTables), [derivedTables]);


  // a new upload starts a new data model
  function handleTablesChange(names) {

    setTables(names);
    setDerivedTables([]);

  }


  function handleTransformed(rawName) {

    // "model.EKPO_CLEAN" -> "EKPO_CLEAN"
    const tableName = String(rawName || "")
      .replace(/["`]/g, "")
      .split(".")
      .pop()
      .trim()
      .toUpperCase();

    if (!tableName) return;

    setDerivedTables((current) =>
      current.includes(tableName) ? current : [...current, tableName]
    );

  }


  // no file uploaded -> no data model
  const modelLocked = tables.length === 0;


  return (
    <div className="app">

      <nav className="app-nav">

        {PAGES.map((item) => {

          const disabled =
            item.id === "data-model" && modelLocked;

          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              title={
                disabled
                  ? "Upload a file first"
                  : undefined
              }
              onClick={() => setPage(item.id)}
              className={
                page === item.id
                  ? "nav-button active"
                  : "nav-button"
              }
            >
              {item.label}
            </button>
          );

        })}

      </nav>


      {/*
        Upload and Transform stay mounted (just hidden) so uploaded
        tables, SQL text and previews are not lost when switching tabs.
      */}
      <div hidden={page !== "upload"}>
        <Upload
          onTablesChange={handleTablesChange}
          onGoToTransform={() => setPage("transform")}
          onGoToModel={() => setPage("data-model")}
        />
      </div>

      <div hidden={page !== "transform"}>
        <Transform
          tables={tables}
          onTransformed={handleTransformed}
          onGoToUpload={() => setPage("upload")}
          onGoToModel={() => setPage("data-model")}
        />
      </div>

      {/* Data Model mounts fresh each visit so it always loads the latest tables */}
      {page === "data-model" && (
        <DataModel
          uploadedTables={tables}
          derivedTables={derivedTables}
        />
      )}

    </div>
  );
}


export default App;