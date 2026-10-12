import { useState } from "react";

import FileUpload from "../components/FileUpload/FileUpload";
import SQLEditor from "../components/SQLEditor/SQLEditor";
import DataPreview from "../components/DataPreview/DataPreview";
import ColumnMapping from "../components/ColumnMapping/ColumnMapping";
import "./Ingest.css";


export default function Ingest() {

  // =========================================================
  // UPLOADED FILES
  // =========================================================

  const [uploadedFiles, setUploadedFiles] = useState([]);


  // =========================================================
  // AVAILABLE TABLES
  // =========================================================

  const [tables, setTables] = useState([]);


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
  // UPLOAD COMPLETE
  // =========================================================

  function handleUploadComplete(result) {

    console.log(
      "========================================"
    );

    console.log(
      "UPLOAD RESULT"
    );

    console.log(result);

    console.log(
      "========================================"
    );


    let uploaded = [];


    // ---------------------------------------------------------
    // MULTI FILE RESPONSE
    // ---------------------------------------------------------

    if (
      result &&
      Array.isArray(result.files)
    ) {

      uploaded = result.files;

    }


    // ---------------------------------------------------------
    // SINGLE FILE RESPONSE
    // ---------------------------------------------------------

    else if (
      result &&
      result.table_name
    ) {

      uploaded = [
        result
      ];

    }


    console.log(
      "NORMALIZED FILES:",
      uploaded
    );


    setUploadedFiles(
      uploaded
    );


    // ---------------------------------------------------------
    // BUILD TABLE LIST
    // ---------------------------------------------------------

    const tableNames = uploaded
      .map(
        (file) =>
          file?.table_name ||
          file?.tableName
      )
      .filter(Boolean);


    console.log(
      "TABLES:",
      tableNames
    );


    setTables(
      tableNames
    );


    // ---------------------------------------------------------
    // CLEAR OLD PREVIEW
    // ---------------------------------------------------------

    setPreview({

      data: [],

      columns: [],

      rowCount: 0,

      tableName: "",

      loading: false,

    });

  }


  // =========================================================
  // MAPPING COMPLETE
  // =========================================================

  function handleMappingComplete(result) {

    console.log(
      "========================================"
    );

    console.log(
      "COLUMN MAPPING COMPLETE"
    );

    console.log(result);

    console.log(
      "========================================"
    );


    // ---------------------------------------------------------
    // IMPORTANT
    //
    // Mapping is already stored in model.<table>
    //
    // Refresh the SQL table list so the SQL editor knows
    // that the table has been mapped.
    // ---------------------------------------------------------

    setTables(
      (currentTables) => [
        ...currentTables
      ]
    );

  }


  // =========================================================
  // TRANSFORMATION COMPLETE
  // =========================================================

  function handleTransformComplete(result) {

    console.log(
      "========================================"
    );

    console.log(
      "TRANSFORMATION COMPLETE"
    );

    console.log(
      "RESULT RECEIVED BY INGEST:"
    );

    console.log(result);

    console.log(
      "DATA:",
      result?.data
    );

    console.log(
      "COLUMNS:",
      result?.columns
    );

    console.log(
      "ROW COUNT:",
      result?.rowCount
    );

    console.log(
      "TABLE:",
      result?.tableName
    );

    console.log(
      "========================================"
    );


    // ---------------------------------------------------------
    // IMPORTANT
    //
    // Always create a new object.
    // ---------------------------------------------------------

    setPreview({

      data:
        Array.isArray(result?.data)
          ? result.data
          : [],

      columns:
        Array.isArray(result?.columns)
          ? result.columns
          : [],

      rowCount:
        Number(result?.rowCount || 0),

      tableName:
        result?.tableName || "",

      loading:
        false,

    });

  }


  // =========================================================
  // RENDER
  // =========================================================

  return (

    <main className="ingest-page">


      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="ingest-header">

        <h1>
          Ingest Data
        </h1>

        <p>
          Upload CSV or Excel files,
          define column types,
          and transform your data with SQL.
        </p>

      </div>


      {/* =====================================================
          FILE UPLOAD
      ===================================================== */}

      <FileUpload
        onUploadComplete={
          handleUploadComplete
        }
      />


      {/* =====================================================
          UPLOADED FILES
      ===================================================== */}

      {uploadedFiles.length > 0 && (

        <section className="uploaded-files-section">

          <h3>
            Uploaded Files
          </h3>


          <div className="uploaded-files-list">

            {uploadedFiles.map(
              (file, index) => {

                const tableName =
                  file?.table_name ||
                  file?.tableName ||
                  "Unknown";


                return (

                  <div
                    className="uploaded-file-item"
                    key={`${tableName}-${index}`}
                  >

                    <div>

                      <strong>

                        {file?.filename ||
                          tableName}

                      </strong>


                      <div>

                        {file?.rows || 0}
                        {" rows · "}
                        {file?.columns || 0}
                        {" columns"}

                      </div>

                    </div>


                    <span
                      className="table-name-badge"
                    >

                      {tableName}

                    </span>

                  </div>

                );

              }
            )}

          </div>

        </section>

      )}


      {/* =====================================================
          COLUMN MAPPING
      ===================================================== */}

      {uploadedFiles.length > 0 && (

        <ColumnMapping

          tables={
            uploadedFiles
          }

          onMappingComplete={
            handleMappingComplete
          }

        />

      )}


      {/* =====================================================
          SQL EDITOR
      ===================================================== */}

      {tables.length > 0 && (

        <SQLEditor

          tables={
            tables
          }

          onTransformComplete={
            handleTransformComplete
          }

        />

      )}


      {/* =====================================================
          DATA PREVIEW
      ===================================================== */}

      <DataPreview

        data={
          preview.data
        }

        columns={
          preview.columns
        }

        rowCount={
          preview.rowCount
        }

        tableName={
          preview.tableName
        }

        loading={
          preview.loading
        }

      />

    </main>

  );

}