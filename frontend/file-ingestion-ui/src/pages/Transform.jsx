import { useEffect, useRef, useState } from "react";

import SQLEditor from "../components/SQLEditor/SQLEditor";
import DataPreview from "../components/DataPreview/DataPreview";
import "./Ingest.css";


const MODEL_API = "http://127.0.0.1:8000/api/data-model";


// "model.EKPO_CLEAN" / '"model"."EKPO_CLEAN"' -> "EKPO_CLEAN"
function cleanTableName(value) {

  return String(value || "")
    .replace(/["`]/g, "")
    .split(".")
    .pop()
    .trim();

}


async function fetchModelTableNames() {

  try {

    const response = await fetch(`${MODEL_API}/tables`);

    if (!response.ok) return null;

    const data = await response.json();

    return (data.tables || []).map((table) => table.name);

  } catch {

    return null;

  }

}


export default function Transform({
  tables = [],
  onTransformed,
  onGoToUpload,
  onGoToModel,
}) {

  // =========================================================
  // PREVIEW
  // =========================================================

  const [preview, setPreview] = useState({
    data: [],
    columns: [],
    rowCount: 0,
    tableName: "",
    loading: false,
  });


  // =========================================================
  // TABLES THAT ALREADY EXIST IN THE MODEL
  //
  // Used to detect which table(s) a SQL run created, whatever
  // the SQL says (CREATE TABLE EKPO_CLEAN AS ..., the output
  // table field, several statements, ...).
  // =========================================================

  const knownTables = useRef(null);

  useEffect(() => {

    fetchModelTableNames().then((names) => {

      if (names && knownTables.current === null) {

        knownTables.current = new Set(names);

      }

    });

  }, []);


  // =========================================================
  // TRANSFORMATION COMPLETE
  // =========================================================

  async function handleTransformComplete(result) {

    console.log("TRANSFORMATION COMPLETE", result);

    // always create a new object
    setPreview({
      data: Array.isArray(result?.data) ? result.data : [],
      columns: Array.isArray(result?.columns) ? result.columns : [],
      rowCount: Number(result?.rowCount || 0),
      tableName: result?.tableName || "",
      loading: false,
    });

    // ----------------------------------------------------
    // Tell the app which table(s) were created so the
    // data model shows them:
    //   1. the table name reported by the backend
    //   2. every table that is new in the model schema
    // ----------------------------------------------------

    const created = new Set();

    const reported = cleanTableName(result?.tableName);

    if (reported) {

      created.add(reported);

    }

    const names = await fetchModelTableNames();

    if (names) {

      const known = knownTables.current || new Set();

      names.forEach((name) => {

        if (!known.has(name)) {

          created.add(name);

        }

      });

      knownTables.current = new Set(names);

    }

    if (onTransformed) {

      created.forEach((name) => onTransformed(name));

    }

  }


  // =========================================================
  // RENDER
  // =========================================================

  return (

    <main className="ingest-page">

      <div className="ingest-header">

        <h1>SQL Transformer</h1>

        <p>
          Write SQL against your uploaded tables and save the
          result as a new table.
        </p>

      </div>


      {tables.length === 0 ? (

        <section className="uploaded-files-section">

          <h3>No tables yet</h3>

          <p>Upload a file first, then come back to transform it.</p>

          <button type="button" onClick={onGoToUpload}>
            ← Go to Upload
          </button>

        </section>

      ) : (

        <SQLEditor
          tables={tables}
          onTransformComplete={handleTransformComplete}
        />

      )}


      <DataPreview
        data={preview.data}
        columns={preview.columns}
        rowCount={preview.rowCount}
        tableName={preview.tableName}
        loading={preview.loading}
      />


      {preview.tableName && (

        <div style={{ marginTop: 12 }}>

          <button type="button" onClick={onGoToModel}>
            Open Data Model →
          </button>

        </div>

      )}

    </main>

  );

}