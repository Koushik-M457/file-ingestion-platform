# File Ingestion Platform

A full-stack data ingestion, transformation, and visual data modeling platform built with **React, FastAPI, Python, and DuckDB**.

The platform allows users to upload structured data files, inspect and map columns, transform data using SQL, discover relationships between tables, validate those relationships, and build a visual representation of the data model.

## 1. Project Overview

Organizations often receive data from multiple sources in CSV and Excel formats. Before this data can be analyzed, it needs to be loaded, validated, cleaned, transformed, and organized into meaningful relationships.

The File Ingestion Platform aims to simplify this process through a single web application.

Users can upload datasets, explore their structure, apply data transformations, and discover how tables relate to one another without manually managing every step through separate tools.

### Key objectives

- Simplify the ingestion of multiple CSV and Excel files.
- Preserve original uploaded files separately from working data.
- Inspect columns and manage data types.
- Execute SQL transformations and create derived tables.
- Discover potential relationships between tables.
- Approve or reject relationships before saving them.
- Visualize approved relationships in an interactive data model.
- Provide a foundation for future automated analytics and AI-assisted data preparation.

## 2. Key Features

### 2.1 File Upload and Ingestion

- Upload CSV, XLSX, and XLS files.
- Process multiple datasets.
- Store original files separately from working tables.
- Load uploaded data into DuckDB schemas.
- Display dataset information such as row counts, column counts, and column names.

### 2.2 Column Mapping

- Inspect columns and their detected data types.
- Choose target column names.
- Convert columns into supported data types.
- Select which columns to include in mapped output.
- Prepare tables for downstream transformations and modeling.

### 2.3 SQL Transformation

- Write SQL queries through a web-based SQL editor.
- Execute transformations against available datasets.
- Create derived tables from SQL queries.
- Preview transformed results.
- Use uploaded or previously transformed tables as inputs for further transformations.

### 2.4 Data Model and Table Discovery

- Discover tables available in the model schema.
- Inspect table columns, data types, null counts, distinct counts, and sample values.
- Display table metadata for data exploration.
- Make uploaded, mapped, and SQL-derived tables available to the data modeling workflow when they are registered in the model schema.

### 2.5 Relationship Discovery and Validation

- Identify candidate relationships between columns in different tables.
- Compare column names, data types, and overlapping values.
- Estimate relationship cardinality and confidence.
- Approve or reject candidate relationships.
- Save relationship decisions in persistent metadata storage.

Discovered relationships are suggestions, not guaranteed business relationships. Users should validate them before approval.

### 2.6 Visual Data Model

- Represent tables as visual nodes.
- Display columns and their data types.
- Connect tables using approved relationships.
- Support interactive graph navigation, including zooming, panning, and moving nodes.
- Use the saved approved relationships as the source for the visual model.

## 3. Technology Stack

| Technology | Purpose |
|---|---|
| React | Frontend user interface |
| Vite | Frontend development server and build tooling |
| Python | Backend application logic |
| FastAPI | REST API endpoints |
| DuckDB | Local analytical database |
| Pandas | Reading and processing tabular files |
| SQL | Data transformation and table creation |
| Pydantic | API request validation |
| React Flow (`@xyflow/react`) | Interactive visual data model |

## 4. System Architecture

The application uses a frontend-backend architecture.

```text
                 USER
                  |
                  v
          REACT FRONTEND
                  |
          HTTP REST REQUESTS
                  |
                  v
            FASTAPI BACKEND
                  |
          +-------+--------+
          |                |
          v                v
    FILE INGESTION    SQL TRANSFORM
          |                |
          +-------+--------+
                  |
                  v
               DUCKDB
                  |
       +----------+----------+
       |          |          |
       v          v          v
      raw       staging     model
                             |
                             v
                      DATA DISCOVERY
                             |
                             v
                   RELATIONSHIP REVIEW
                             |
                             v
                     APPROVED RELATIONS
                             |
                             v
                      VISUAL DATA MODEL
```

### Component responsibilities

**Frontend:** Provides the upload interface, column mapping controls, SQL editor, data previews, and visual model.

**Backend:** Validates requests, processes files, executes approved SQL operations, inspects database metadata, and manages relationship decisions.

**DuckDB:** Stores the structured data used by the application and provides SQL-based analytical operations.

**Metadata storage:** Stores saved relationship decisions separately from business datasets.

## 5. Data Storage Design

The application separates data according to its purpose.

| Schema | Purpose |
|---|---|
| `raw` | Tables loaded directly from uploaded source files |
| `staging` | Working copies used for preparation and transformation |
| `model` | Tables made available for data modeling and relationship discovery |
| `metadata` | Application metadata, including saved relationship decisions |

### Example data flow

When `BKPF.csv` is uploaded, the intended workflow is:

```text
BKPF.csv
   |
   v
raw.BKPF
   |
   v
staging.BKPF
   |
   v
model.BKPF
```

A SQL transformation may then create:

```sql
CREATE TABLE AP_INVOICE AS
SELECT *
FROM BKPF;
```

The resulting table should be registered as `model.AP_INVOICE` so it can be discovered by the Data Model.

**Important:** These schemas are separate database locations, not automatic synchronization mechanisms. The ingestion and transformation code must explicitly create tables in the appropriate schemas. The original source files should also be protected from unintended overwrites.

## 6. Relationship Discovery Workflow

Relationship discovery is a multi-step process.

1. **Table discovery:** Find tables registered in the `model` schema.
2. **Column discovery:** Inspect column names, data types, and value statistics.
3. **Relationship discovery:** Compare compatible columns and generate potential relationship candidates.
4. **Relationship validation:** Check candidate table and column references and accept an approval or rejection decision.
5. **Relationship persistence:** Save decisions in `metadata.relationships`.
6. **Visual modeling:** Retrieve approved relationships and draw connections between table nodes.

### Example

Suppose the platform contains:

```text
EKPO
  EBELN
  EBELP
  MATNR

EKBE
  EBELN
  EBELP
  GJAHR
```

The system may suggest a relationship using `EBELN`:

```text
EKPO.EBELN  ─────────  EKBE.EBELN
```

The relationship should only be included in the visual model after it has been approved.

A matching column name or overlapping values alone does not prove that two columns form a valid business key. Actual business rules and the intended join behavior should also be considered.

## 7. Project Structure

The project is organized into a frontend and backend.

```text
file-ingestion-platform/
|
├── frontend/
│   └── file-ingestion-ui/
│       ├── src/
│       │   ├── components/
│       │   │   ├── FileUpload/
│       │   │   ├── SQLEditor/
│       │   │   ├── DataPreview/
│       │   │   └── ColumnMapping/
│       │   ├── pages/
│       │   │   ├── Ingest.jsx
│       │   │   └── DataModel.jsx
│       │   ├── App.jsx
│       │   └── App.css
│       ├── package.json
│       └── vite.config.js
|
├── backend/
│   ├── app/
│   │   ├── routers/
│   │   │   ├── upload.py
│   │   │   └── data_model.py
│   │   ├── services/
│   │   │   ├── ingestion.py
│   │   │   └── file_service.py
│   │   ├── database.py
│   │   └── main.py
│   ├── requirements.txt
│   └── storage/
|
├── .gitignore
└── README.md
```

This is an illustrative structure. The actual files and names may differ slightly depending on the current implementation.

## 8. Installation and Setup

### Prerequisites

Install the following:

- Python 3.10 or a compatible version supported by the backend dependencies.
- Node.js and npm.
- Git.
- A web browser.

### Step 1: Clone the repository

```bash
git clone https://github.com/Koushik-M457/file-ingestion-platform.git
cd file-ingestion-platform
```

### Step 2: Set up the backend

Open a terminal in the `backend` directory:

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment on Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the FastAPI server:

```bash
uvicorn app.main:app --reload
```

The backend should be available at:

- API: `http://127.0.0.1:8000`
- Interactive API documentation: `http://127.0.0.1:8000/docs`

### Step 3: Set up the frontend

Open another terminal:

```bash
cd frontend/file-ingestion-ui
npm install
npm run dev
```

Open the local URL printed by Vite, commonly:

`http://localhost:5173`

### Step 4: Verify the application

1. Open the frontend.
2. Upload a CSV or Excel file.
3. Inspect the uploaded dataset.
4. Apply column mappings if required.
5. Run a SQL transformation.
6. Open the Data Model.
7. Discover candidate relationships.
8. Approve valid relationships.
9. Verify that approved relationships appear in the visual model.

The exact workflow depends on which features are enabled in the current version.

## 9. Example Use Case

Consider an organization working with SAP-style purchasing and accounting datasets.

The user uploads:

- `EKKO` — purchasing document headers.
- `EKPO` — purchasing document items.
- `EKBE` — purchasing document history.
- `BKPF` — accounting document headers.
- `BSEG` — accounting document line items.

The platform can prepare these datasets, allow SQL transformations, inspect their columns, and suggest potential relationships.

After reviewing and approving valid relationships, the user can visualize the resulting model and use it as a foundation for downstream analysis.

The platform does not automatically guarantee that the uploaded datasets follow a particular SAP schema. The source data and its business semantics must be verified.

## 10. Data Protection and Security

- Keep environment variables and credentials out of source control.
- Exclude local databases and uploaded business data from Git unless there is an explicit, safe reason to share them.
- Keep original source data separate from transformed outputs.
- Validate SQL and table identifiers before execution.
- Restrict destructive SQL operations when they are not required.
- Review uploaded files and access permissions before using the application with sensitive business data.

The local DuckDB database is generated application data and should not normally be committed to GitHub.

## 11. Current Scope and Limitations

The platform is under active development.

Potential limitations include:

- Relationship discovery can produce false positives.
- Candidate matching is not equivalent to confirmed business-key validation.
- Large datasets may require query optimization and additional resource management.
- Duplicate uploaded filenames need an explicit overwrite or versioning policy.
- Multi-user authentication, authorization, and production deployment require additional implementation.
- Persistent dataset registration should be verified to ensure the upload list remains available after a browser refresh.
- The exact supported SQL operations depend on the backend SQL validation rules.

## 12. Future Enhancements

Potential future improvements include:

- Natural-language-to-SQL transformation.
- AI-assisted column matching and relationship recommendations.
- More robust dataset versioning and duplicate detection.
- Relationship editing and deletion.
- Exporting the visual data model.
- Large-file processing and query optimization.
- User authentication and role-based access control.
- Automated data quality checks.
- Dashboard generation from transformed datasets.

## 13. Project Status

The project is being developed incrementally, with functionality spanning:

- File ingestion and storage.
- SQL transformation and result preview.
- Column mapping.
- Table and column discovery.
- Relationship discovery, validation, and persistence.
- Interactive visual data modeling.

The status of each feature should be verified against the current source code before treating it as production-ready.

## 14. Author

**Koushik M**

GitHub: https://github.com/Koushik-M457

Repository: https://github.com/Koushik-M457/file-ingestion-platform

---

*This project is intended to provide a foundation for data ingestion, preparation, relationship discovery, and visual data modeling through a single web-based interface.*
