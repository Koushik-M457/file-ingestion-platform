import { useRef, useState } from "react";
import "./FileUpload.css";

// Largest file accepted by the browser check, in GB.
// 0 = no limit (any size is accepted). Change this one number.
const MAX_FILE_SIZE_GB = 0;
const MAX_FILE_SIZE = MAX_FILE_SIZE_GB * 1024 * 1024 * 1024;

function FileUpload({
  onUploadComplete
}) {

  const inputRef = useRef(null);

  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");


  // -----------------------------------------
  // Validate file
  // -----------------------------------------

  function validateFile(selectedFile) {

    const allowedExtensions = [
      ".csv",
      ".xlsx",
      ".xls"
    ];

    const extension =
      "." +
      selectedFile.name
        .split(".")
        .pop()
        .toLowerCase();

    if (!allowedExtensions.includes(extension)) {

      setError(
        "Only CSV and Excel files are supported."
      );

      return false;
    }


    if (MAX_FILE_SIZE_GB > 0 && selectedFile.size > MAX_FILE_SIZE) {

      setError(
        `File size must be less than ${MAX_FILE_SIZE_GB} GB.`
      );

      return false;
    }

    return true;
  }


  // -----------------------------------------
  // Handle multiple files
  // -----------------------------------------

  function handleFileSelect(selectedFiles) {

    if (!selectedFiles || selectedFiles.length === 0) {
      return;
    }

    setError("");

    const validFiles = [];

    for (const selectedFile of selectedFiles) {

      if (validateFile(selectedFile)) {

        validFiles.push(selectedFile);

      }

    }

    if (validFiles.length === 0) {
      return;
    }


    // Add files to current selection

    setFiles(prevFiles => {

      const existingNames =
        new Set(
          prevFiles.map(file => file.name)
        );

      const newFiles =
        validFiles.filter(
          file =>
            !existingNames.has(file.name)
        );

      return [
        ...prevFiles,
        ...newFiles
      ];

    });

  }


  // -----------------------------------------
  // Browse
  // -----------------------------------------

  function handleBrowse() {

    inputRef.current?.click();

  }


  // -----------------------------------------
  // Input change
  // -----------------------------------------

  function handleInputChange(event) {

    const selectedFiles =
      Array.from(
        event.target.files || []
      );

    handleFileSelect(selectedFiles);

  }


  // -----------------------------------------
  // Drag events
  // -----------------------------------------

  function handleDragOver(event) {

    event.preventDefault();

    setDragging(true);

  }


  function handleDragLeave(event) {

    event.preventDefault();

    setDragging(false);

  }


  function handleDrop(event) {

    event.preventDefault();

    setDragging(false);

    const droppedFiles =
      Array.from(
        event.dataTransfer.files || []
      );

    handleFileSelect(droppedFiles);

  }


  // -----------------------------------------
  // Upload all files
  // -----------------------------------------

  async function uploadFiles() {

    if (files.length === 0) {

      setError(
        "Please select at least one file."
      );

      return;

    }

    setUploading(true);
    setError("");

    try {

      const formData =
        new FormData();


      // Add every file

      files.forEach(file => {

        formData.append(
          "files",
          file
        );

      });


      const response =
        await fetch(
          "http://127.0.0.1:8000/api/upload",
          {
            method: "POST",
            body: formData,
          }
        );


      const result =
        await response.json();


      if (!response.ok) {

        throw new Error(
          result.detail ||
          "Upload failed."
        );

      }


      console.log(
        "Upload successful:",
        result
      );


      // Send result to Ingest.jsx

      if (onUploadComplete) {

        onUploadComplete(result);

      }


      // Clear selection

      setFiles([]);

      if (inputRef.current) {

        inputRef.current.value = "";

      }

    }

    catch (error) {

      console.error(
        "Upload error:",
        error
      );

      setError(
        error.message
      );

    }

    finally {

      setUploading(false);

    }

  }


  // -----------------------------------------
  // Remove one file
  // -----------------------------------------

  function handleRemove(index) {

    setFiles(prevFiles =>
      prevFiles.filter(
        (_, fileIndex) =>
          fileIndex !== index
      )
    );

    setError("");

  }


  // -----------------------------------------
  // Clear all files
  // -----------------------------------------

  function handleClearAll() {

    setFiles([]);

    setError("");

    if (inputRef.current) {

      inputRef.current.value = "";

    }

  }


  // -----------------------------------------
  // Format file size
  // -----------------------------------------

  function formatFileSize(bytes) {

    if (bytes < 1024 * 1024) {

      return (
        (bytes / 1024).toFixed(1) +
        " KB"
      );

    }

    return (
      (bytes / 1024 / 1024).toFixed(2) +
      " MB"
    );

  }


  // -----------------------------------------
  // Render
  // -----------------------------------------

  return (

    <section className="file-upload-section">


      {/* Upload area */}

      <div
        className={`upload-dropzone ${
          dragging
            ? "dragging"
            : ""
        } ${
          files.length > 0
            ? "has-file"
            : ""
        }`}

        onDragOver={
          handleDragOver
        }

        onDragLeave={
          handleDragLeave
        }

        onDrop={
          handleDrop
        }
      >


        {/* Empty state */}

        {files.length === 0 && (

          <>

            <div className="upload-menu">
              ⋯
            </div>


            <div className="upload-icon">

              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >

                <path d="M12 16V4" />

                <path d="M7 9l5-5 5 5" />

                <path d="M5 20h14" />

                <path d="M5 16v4" />

                <path d="M19 16v4" />

              </svg>

            </div>


            <div className="upload-title">

              Drop CSV or Excel files,
              or browse

            </div>


            <div className="upload-subtitle">

              .csv .xlsx .xls{MAX_FILE_SIZE_GB > 0 ? ` up to ${MAX_FILE_SIZE_GB} GB each` : ""}

            </div>


            <button
              type="button"
              className="browse-button"
              onClick={
                handleBrowse
              }
            >

              Browse files

            </button>

          </>

        )}


        {/* Selected files */}

        {files.length > 0 && (

          <div className="selected-files-container">

            <div className="selected-files-header">

              <strong>
                {files.length} file
                {files.length > 1 ? "s" : ""}
                selected
              </strong>

              <button
                type="button"
                className="clear-all-button"
                onClick={
                  handleClearAll
                }
              >
                Clear all
              </button>

            </div>


            {files.map(
              (file, index) => (

                <div
                  className="selected-file-card"
                  key={`${file.name}-${index}`}
                >

                  <div className="file-type-icon">

                    {file.name
                      .toLowerCase()
                      .endsWith(".csv")
                      ? "CSV"
                      : "XLSX"}

                  </div>


                  <div className="file-info">

                    <div className="file-name">

                      {file.name}

                    </div>


                    <div className="file-size">

                      {formatFileSize(
                        file.size
                      )}

                    </div>

                  </div>


                  {!uploading && (

                    <button
                      type="button"
                      className="remove-file"
                      onClick={() =>
                        handleRemove(index)
                      }
                    >

                      ×

                    </button>

                  )}

                </div>

              )
            )}


            {/* Upload button */}

            <button
              type="button"
              className="browse-button"
              onClick={
                uploadFiles
              }
              disabled={uploading}
            >

              {uploading
                ? "Uploading..."
                : `Upload ${files.length} file${
                    files.length > 1
                      ? "s"
                      : ""
                  }`
              }

            </button>

          </div>

        )}

      </div>


      {/* Hidden input */}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".csv,.xlsx,.xls"
        onChange={
          handleInputChange
        }
        hidden
      />


      {/* Error */}

      {error && (

        <div className="upload-error">

          {error}

        </div>

      )}

    </section>

  );

}


export default FileUpload;