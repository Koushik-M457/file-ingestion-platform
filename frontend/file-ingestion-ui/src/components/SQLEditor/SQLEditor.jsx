import { useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";

import "./SQLEditor.css";


export default function SQLEditor({
  tables = [],
  onTransformComplete,
}) {

  const [query, setQuery] = useState("");

  const [outputTable, setOutputTable] =
    useState("transformed_data");

  const [running, setRunning] =
    useState(false);

  const [status, setStatus] =
    useState("");


  // =========================================================
  // DEFAULT QUERY
  // =========================================================

  useEffect(() => {

    if (
      Array.isArray(tables) &&
      tables.length > 0 &&
      !query.trim()
    ) {

      setQuery(
        `SELECT *\nFROM ${tables[0]}`
      );

    }

  }, [tables]);


  // =========================================================
  // RUN TRANSFORMATION
  // =========================================================

  async function handleRunTransform() {

    if (!query.trim()) {

      setStatus(
        "Please enter a SQL query."
      );

      return;
    }


    setRunning(true);

    setStatus(
      "Running transformation..."
    );


    try {

      console.log(
        "========================================"
      );

      console.log(
        "SQL TRANSFORMATION"
      );

      console.log(
        "SQL:",
        query
      );

      console.log(
        "Output table:",
        outputTable
      );

      console.log(
        "========================================"
      );


      // =====================================================
      // CALL FASTAPI
      // =====================================================

      const response =
        await fetch(
          "http://127.0.0.1:8000/api/transform",
          {

            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({

              sql:
                query,

              output_table:
                outputTable,

            }),

          }
        );


      // =====================================================
      // READ RESPONSE
      // =====================================================

      const result =
        await response.json();


      console.log(
        "========================================"
      );

      console.log(
        "TRANSFORM RESPONSE"
      );

      console.log(result);

      console.log(
        "========================================"
      );


      // =====================================================
      // ERROR
      // =====================================================

      if (!response.ok) {

        throw new Error(
          result?.detail ||
          "Transformation failed."
        );

      }


      // =====================================================
      // IMPORTANT
      //
      // Backend returns:
      //
      // {
      //    status: "success",
      //    table: "model.transformed_data",
      //    rows: 1835,
      //    columns: [...],
      //    preview: [...]
      // }
      //
      // DataPreview needs:
      //
      // data     <- result.preview
      // columns  <- result.columns
      // rowCount <- result.rows
      // =====================================================

      const previewData =
        Array.isArray(result?.preview)
          ? result.preview
          : [];


      const previewColumns =
        Array.isArray(result?.columns)
          ? result.columns
          : [];


      const rowCount =
        Number(
          result?.rows || 0
        );


      console.log(
        "========================================"
      );

      console.log(
        "DATA SENT TO PREVIEW"
      );

      console.log(
        "Rows:",
        rowCount
      );

      console.log(
        "Columns:",
        previewColumns.length
      );

      console.log(
        "Preview rows:",
        previewData.length
      );

      console.log(
        "First row:",
        previewData[0]
      );

      console.log(
        "========================================"
      );


      // =====================================================
      // SEND CORRECT FORMAT TO INGEST.JSX
      // =====================================================

      if (
        typeof onTransformComplete ===
        "function"
      ) {

        onTransformComplete({

          data:
            previewData,

          columns:
            previewColumns,

          rowCount:
            rowCount,

          tableName:
            result?.table ||
            `model.${outputTable}`,

          loading:
            false,

        });

      }


      setStatus(
        "Transformation completed"
      );


    } catch (error) {

      console.error(
        "Transformation error:",
        error
      );


      setStatus(
        error.message ||
        "Transformation failed."
      );


      // Clear preview on error
      if (
        typeof onTransformComplete ===
        "function"
      ) {

        onTransformComplete({

          data: [],

          columns: [],

          rowCount: 0,

          tableName: "",

          loading: false,

        });

      }


    } finally {

      setRunning(false);

    }

  }


  // =========================================================
  // RENDER
  // =========================================================

  return (

    <section className="sql-editor-section">


      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="sql-editor-header">

        <div>

          <h3>
            SQL Transformation
          </h3>

          <p>
            Write SQL to transform your uploaded data.
          </p>

        </div>


        {/* ===================================================
            OUTPUT TABLE
        =================================================== */}

        <div className="output-table-control">

          <label>
            Output table
          </label>

          <input
            type="text"
            value={outputTable}
            onChange={(event) =>
              setOutputTable(
                event.target.value
              )
            }
            placeholder="transformed_data"
          />

        </div>

      </div>


      {/* =====================================================
          TABLE SHORTCUTS
      ===================================================== */}

      {Array.isArray(tables) &&
        tables.length > 0 && (

          <div className="sql-table-list">

            <span>
              Tables:
            </span>


            {tables.map(
              (tableName) => (

                <button
                  type="button"
                  key={tableName}
                  onClick={() => {

                    setQuery(
                      `SELECT *\nFROM ${tableName}`
                    );

                  }}
                >

                  {tableName}

                </button>

              )
            )}

          </div>

        )}


      {/* =====================================================
          CODE EDITOR
      ===================================================== */}

      <div className="sql-editor-container">

        <CodeMirror

          value={
            query
          }

          height="280px"

          extensions={[
            sql(),
          ]}

          theme={
            oneDark
          }

          onChange={(
            value
          ) => {

            setQuery(
              value
            );

          }}

        />

      </div>


      {/* =====================================================
          FOOTER
      ===================================================== */}

      <div className="sql-editor-footer">


        <div className="sql-status">

          <span>
            ●
          </span>

          {" "}

          {status ||
            "Ready"}

        </div>


        <button
          type="button"
          onClick={
            handleRunTransform
          }
          disabled={
            running ||
            !query.trim()
          }
        >

          {running
            ? "Running..."
            : "Run transform ↗"}

        </button>

      </div>


    </section>

  );

}