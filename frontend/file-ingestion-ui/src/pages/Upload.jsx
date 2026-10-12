import { useState } from "react";

import FileUpload from "../components/FileUpload/FileUpload";
import ColumnMapping from "../components/ColumnMapping/ColumnMapping";
import "./Ingest.css";


export default function Upload({
  onTablesChange,
  onGoToTransform,
  onGoToModel,
}) {

  // =========================================================
  // UPLOADED FILES
  // =========================================================

  const [uploadedFiles, setUploadedFiles] = useState([]);

  const [mappedCount, setMappedCount] = useState(0);


  // =========================================================
  // UPLOAD COMPLETE
  // =========================================================

  function handleUploadComplete(result) {

    let uploaded = [];

    // multi file response
    if (result && Array.isArray(result.files)) {

      uploaded = result.files;

    }

    // single file response
    else if (result && result.table_name) {

      uploaded = [result];

    }

    setUploadedFiles(uploaded);

    setMappedCount(0);

    const tableNames = uploaded
      .map((file) => file?.table_name || file?.tableName)
      .filter(Boolean);

    // share the table list with the SQL Transformer page
    if (onTablesChange) {

      onTablesChange(tableNames);

    }

  }


  // =========================================================
  // MAPPING COMPLETE
  //
  // Mapping is stored in model.<table>, so the Data Model
  // page can already use it.
  // =========================================================

  function handleMappingComplete(result) {

    console.log("COLUMN MAPPING COMPLETE", result);

    setMappedCount((count) => count + 1);

  }


  // =========================================================
  // RENDER
  // =========================================================

  return (

    <main className="ingest-page">

      <div className="ingest-header">

        <h1>Upload &amp; Mapping</h1>

        <p>
          Upload CSV or Excel files, review the tables,
          change column types, and apply the mapping.
        </p>

      </div>


      <FileUpload onUploadComplete={handleUploadComplete} />


      {uploadedFiles.length > 0 && (

        <section className="uploaded-files-section">

          <h3>Uploaded Files</h3>

          <div className="uploaded-files-list">

            {uploadedFiles.map((file, index) => {

              const tableName =
                file?.table_name || file?.tableName || "Unknown";

              return (

                <div
                  className="uploaded-file-item"
                  key={`${tableName}-${index}`}
                >

                  <div>

                    <strong>{file?.filename || tableName}</strong>

                    <div>
                      {file?.rows || 0}
                      {" rows · "}
                      {file?.columns || 0}
                      {" columns"}
                    </div>

                  </div>

                  <span className="table-name-badge">{tableName}</span>

                </div>

              );

            })}

          </div>

        </section>

      )}


      {uploadedFiles.length > 0 && (

        <ColumnMapping
          tables={uploadedFiles}
          onMappingComplete={handleMappingComplete}
        />

      )}


      {/* ---------- NEXT STEP ---------- */}

      {uploadedFiles.length > 0 && (

        <section className="uploaded-files-section">

          <h3>Next step</h3>

          <p>
            {mappedCount > 0
              ? `${mappedCount} table(s) mapped and available in the data model.`
              : "Apply mapping on a table to send it to the data model."}
          </p>

          <div style={{ display: "flex", gap: 8 }}>

            <button type="button" onClick={onGoToTransform}>
              Transform with SQL →
            </button>

            <button
              type="button"
              onClick={onGoToModel}
              disabled={mappedCount === 0}
            >
              Open Data Model →
            </button>

          </div>

        </section>

      )}

    </main>

  );

}