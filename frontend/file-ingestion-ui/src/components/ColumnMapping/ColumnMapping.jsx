import { useEffect, useState } from "react";
import "./ColumnMapping.css";


export default function ColumnMapping({
    tables = [],
    onMappingComplete,
}) {

    // STATE
    const [tableMappings, setTableMappings] = useState({});

    const [expandedTables, setExpandedTables] = useState({});

    const [runningTable, setRunningTable] = useState(null);

    const [status, setStatus] = useState("");

    // INITIALIZE TABLE MAPPINGS

    useEffect(() => {

        if (
            !Array.isArray(tables) ||
            tables.length === 0
        ) {

            setTableMappings({});
            setExpandedTables({});

            return;
        }


        const initialMappings = {};

        const initialExpanded = {};


        tables.forEach((table) => {

            const tableName =
                table?.table_name ||
                table?.tableName ||
                table?.name ||
                "";


            if (!tableName) {
                return;
            }


            
            // Get columns

            const columns =
                Array.isArray(table?.column_metadata)
                    ? table.column_metadata
                    : Array.isArray(table?.column_names)
                        ? table.column_names
                        : [];

            // Create mapping for every column

            initialMappings[tableName] =
                columns
                    .map((column) => {

                        const sourceName =
                            typeof column === "string"
                                ? column
                                : column?.name;


                        if (!sourceName) {
                            return null;
                        }

                        // Original datatype

                        const sourceType =
                            typeof column === "string"
                                ? "VARCHAR"
                                : column?.type ||
                                  "VARCHAR";


                        const normalizedSourceType =
                            String(
                                sourceType
                            ).toUpperCase();


                        // Default target datatype
                        // VARCHAR is shown as STRING.

                        const targetType =
                            normalizedSourceType === "VARCHAR"
                                ? "STRING"
                                : normalizedSourceType;


                        return {

                            source:
                                sourceName,

                            target:
                                sourceName,

                            // Original datatype.
                            // This never changes.
                            currentType:
                                normalizedSourceType,

                            // User-selected datatype.
                            targetType:
                                targetType,

                            include:
                                true,

                        };

                    })
                    .filter(Boolean);


            // Expand every uploaded table
            initialExpanded[tableName] = true;

        });


        setTableMappings(
            initialMappings
        );


        setExpandedTables(
            initialExpanded
        );

    }, [tables]);


    // GET TABLE NAME

    function getTableName(table) {

        return (
            table?.table_name ||
            table?.tableName ||
            table?.name ||
            ""
        );

    }

    // UPDATE A SINGLE MAPPING
    function updateMapping(
        tableName,
        index,
        field,
        value
    ) {

        setTableMappings((current) => {

            const updated = {
                ...current,
            };


            updated[tableName] = [
                ...(current[tableName] || []),
            ];


            updated[tableName][index] = {

                ...updated[tableName][index],

                [field]:
                    value,

            };


            return updated;

        });

    }


    // CONVERT ALL TO STRING
    // This is the important function.
    // Clicking:
    //     Convert All to String
    // will:
    // 1. Change every target datatype to STRING.
    // 2. Select every column.
    // 3. Send the mapping directly to FastAPI.
    // 4. FastAPI converts STRING -> VARCHAR.
    // 5. Backend creates model.<original_table_name>.
    // 6. Preview is updated immediately.
    // User does NOT need to click Apply Mapping afterward.

    async function convertAllToString(tableName) {

        const currentMappings =
            tableMappings[tableName] || [];

        // Check columns
        if (
            currentMappings.length === 0
        ) {

            setStatus(
                `${tableName}: no columns found.`
            );

            return;
        }
        // Convert every column to STRING
        const stringMappings =
            currentMappings.map(
                (mapping) => ({

                    ...mapping,

                    targetType:
                        "STRING",

                    include:
                        true,

                })
            );

        // Update UI immediately
        setTableMappings(
            (current) => ({

                ...current,

                [tableName]:
                    stringMappings,

            })
        );


        setRunningTable(
            tableName
        );


        setStatus(
            `${tableName}: converting all columns to STRING...`
        );


        try {
            // BUILD API REQUEST

            const payload = {

                table_name:
                    tableName,

                mappings:
                    stringMappings.map(
                        (mapping) => ({

                            source:
                                mapping.source,

                            target:
                                mapping.target,

                            // Backend accepts STRING
                            // and converts it to VARCHAR.
                            type:
                                "STRING",

                            include:
                                true,

                        })
                    ),

            };


            console.log(
                "========================================"
            );

            console.log(
                "CONVERT ALL TO STRING REQUEST"
            );

            console.log(payload);

            console.log(
                "========================================"
            );


            // CALL BACKEND
            const response =
                await fetch(
                    "http://127.0.0.1:8000/api/column-mapping",
                    {

                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify(
                                payload
                            ),

                    }
                );

            // Read response

            const result =
                await response.json();


            console.log(
                "========================================"
            );

            console.log(
                "CONVERT ALL TO STRING RESPONSE"
            );

            console.log(result);

            console.log(
                "========================================"
            );
            // HANDLE BACKEND ERROR

            if (!response.ok) {

                throw new Error(
                    result?.detail ||
                    "Failed to convert columns to STRING."
                );

            }

            // SEND RESULT TO INGEST.JSX
            // Backend response:
            // {
            //     status: "success",
            //     table: "model.bkpf",
            //     table_name: "BKPF",
            //     rows: 1835,
            //     columns: [...],
            //     preview: [...]
            // }
            // Ingest.jsx uses this to update DataPreview.

            if (
                typeof onMappingComplete ===
                "function"
            ) {

                onMappingComplete(
                    result
                );

            }

            // SUCCESS MESSAGE
            setStatus(
                `${tableName}: all columns converted to STRING.`
            );


        } catch (error) {

            console.error(
                "Convert all to string error:",
                error
            );


            setStatus(
                `${tableName}: ${error.message}`
            );

        } finally {

            setRunningTable(
                null
            );

        }

    }

    // APPLY MANUAL MAPPING    
    // Used when the user wants:
    // BUKRS -> STRING
    // BELNR -> BIGINT
    // BUDAT -> DATE
    // instead of converting everything to STRING.

    async function handleApplyMapping(
        tableName
    ) {

        const mappings =
            tableMappings[tableName] || [];


        const activeMappings =
            mappings.filter(
                (mapping) =>
                    mapping.include
            );

        // Validate

        if (
            activeMappings.length === 0
        ) {

            setStatus(
                `${tableName}: select at least one column.`
            );

            return;
        }


        setRunningTable(
            tableName
        );


        setStatus(
            `${tableName}: applying mapping...`
        );


        try {

            // =================================================
            // BUILD REQUEST
            // =================================================

            const payload = {

                table_name:
                    tableName,

                mappings:
                    activeMappings.map(
                        (mapping) => ({

                            source:
                                mapping.source,

                            target:
                                mapping.target,

                            type:
                                mapping.targetType,

                            include:
                                mapping.include,

                        })
                    ),

            };


            console.log(
                "========================================"
            );

            console.log(
                "COLUMN MAPPING REQUEST"
            );

            console.log(payload);

            console.log(
                "========================================"
            );


            // =================================================
            // CALL BACKEND
            // =================================================

            const response =
                await fetch(
                    "http://127.0.0.1:8000/api/column-mapping",
                    {

                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify(
                                payload
                            ),

                    }
                );


            const result =
                await response.json();


            console.log(
                "========================================"
            );

            console.log(
                "COLUMN MAPPING RESPONSE"
            );

            console.log(result);

            console.log(
                "========================================"
            );


            // =================================================
            // HANDLE ERROR
            // =================================================

            if (!response.ok) {

                throw new Error(
                    result?.detail ||
                    "Column mapping failed."
                );

            }


            // =================================================
            // UPDATE PREVIEW
            // =================================================

            if (
                typeof onMappingComplete ===
                "function"
            ) {

                onMappingComplete(
                    result
                );

            }


            setStatus(
                `${tableName}: mapping completed.`
            );


        } catch (error) {

            console.error(
                "Column mapping error:",
                error
            );


            setStatus(
                `${tableName}: ${error.message}`
            );

        } finally {

            setRunningTable(
                null
            );

        }

    }


    // =========================================================
    // TOGGLE TABLE
    // =========================================================

    function toggleTable(
        tableName
    ) {

        setExpandedTables(
            (current) => ({

                ...current,

                [tableName]:
                    !current[tableName],

            })
        );

    }


    // =========================================================
    // NO TABLES
    // =========================================================

    if (
        !Array.isArray(tables) ||
        tables.length === 0
    ) {

        return null;

    }


    // =========================================================
    // RENDER
    // =========================================================

    return (

        <section className="column-mapping-section">


            {/* =================================================
                HEADER
            ================================================= */}

            <div className="column-mapping-header">

                <div>

                    <h3>
                        Uploaded Tables
                    </h3>

                    <p>
                        Review and convert column
                        data types for each uploaded table.
                    </p>

                </div>

            </div>


            {/* =================================================
                TABLE LIST
            ================================================= */}

            <div className="mapping-tables-container">

                {tables.map(
                    (table) => {

                        const tableName =
                            getTableName(
                                table
                            );


                        if (!tableName) {
                            return null;
                        }


                        const mappings =
                            tableMappings[
                                tableName
                            ] || [];


                        const expanded =
                            Boolean(
                                expandedTables[
                                    tableName
                                ]
                            );


                        const isRunning =
                            runningTable ===
                            tableName;


                        return (

                            <div
                                className="column-mapping-card"
                                key={
                                    tableName
                                }
                            >


                                {/* =================================
                                    TABLE HEADER
                                ================================= */}

                                <div
                                    className="table-card-header"
                                >


                                    <button
                                        type="button"
                                        className="table-expand-button"
                                        onClick={() =>
                                            toggleTable(
                                                tableName
                                            )
                                        }
                                    >

                                        {expanded
                                            ? "▼"
                                            : "▶"}

                                        {" "}

                                        {tableName}

                                    </button>


                                    {/* =================================
                                        CONVERT ALL TO STRING
                                    ================================= */}

                                    <button
                                        type="button"
                                        className="convert-string-button"
                                        onClick={() =>
                                            convertAllToString(
                                                tableName
                                            )
                                        }
                                        disabled={
                                            isRunning
                                        }
                                    >

                                        {isRunning
                                            ? "Converting..."
                                            : "Convert All to String"}

                                    </button>

                                </div>


                                {/* =================================
                                    TABLE CONTENT
                                ================================= */}

                                {expanded && (

                                    <>


                                        {/* =============================
                                            COLUMN TABLE
                                        ============================== */}

                                        <div
                                            className="mapping-table"
                                        >


                                            {/* -------------------------
                                                HEADER
                                            -------------------------- */}

                                            <div
                                                className="mapping-row mapping-header"
                                            >

                                                <div>
                                                    Column
                                                </div>

                                                <div>
                                                    Current Type
                                                </div>

                                                <div>
                                                    Convert To
                                                </div>

                                            </div>


                                            {/* -------------------------
                                                COLUMN ROWS
                                            -------------------------- */}

                                            {mappings.map(
                                                (
                                                    mapping,
                                                    index
                                                ) => (

                                                    <div
                                                        className="mapping-row"
                                                        key={
                                                            `${tableName}-${mapping.source}-${index}`
                                                        }
                                                    >


                                                        {/* =================
                                                            COLUMN NAME
                                                        ================= */}

                                                        <div
                                                            className="source-column"
                                                        >

                                                            {
                                                                mapping.source
                                                            }

                                                        </div>


                                                        {/* =================
                                                            CURRENT TYPE
                                                        ================= */}

                                                        <div>

                                                            {
                                                                mapping.currentType
                                                            }

                                                        </div>


                                                        {/* =================
                                                            TARGET TYPE
                                                        ================= */}

                                                        <div>

                                                            <select
                                                                value={
                                                                    mapping.targetType
                                                                }

                                                                onChange={(
                                                                    event
                                                                ) =>
                                                                    updateMapping(
                                                                        tableName,
                                                                        index,
                                                                        "targetType",
                                                                        event.target.value
                                                                    )
                                                                }

                                                                disabled={
                                                                    isRunning
                                                                }
                                                            >

                                                                <option value="STRING">
                                                                    STRING
                                                                </option>

                                                                <option value="INTEGER">
                                                                    INTEGER
                                                                </option>

                                                                <option value="BIGINT">
                                                                    BIGINT
                                                                </option>

                                                                <option value="DOUBLE">
                                                                    DOUBLE
                                                                </option>

                                                                <option value="DECIMAL">
                                                                    DECIMAL
                                                                </option>

                                                                <option value="DATE">
                                                                    DATE
                                                                </option>

                                                                <option value="TIMESTAMP">
                                                                    TIMESTAMP
                                                                </option>

                                                                <option value="BOOLEAN">
                                                                    BOOLEAN
                                                                </option>

                                                            </select>

                                                        </div>


                                                    </div>

                                                )
                                            )}


                                        </div>


                                        {/* =================================
                                            FOOTER
                                        ================================= */}

                                        <div
                                            className="mapping-footer"
                                        >


                                            {/* -----------------------------
                                                STATUS
                                            ------------------------------ */}

                                            <span
                                                className="mapping-status"
                                            >

                                                {isRunning
                                                    ? `${tableName}: converting...`
                                                    : status}

                                            </span>


                                            {/* -----------------------------
                                                MANUAL APPLY
                                            ------------------------------ */}

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleApplyMapping(
                                                        tableName
                                                    )
                                                }
                                                disabled={
                                                    isRunning
                                                }
                                            >

                                                {isRunning
                                                    ? "Applying..."
                                                    : "Apply mapping ↗"}

                                            </button>


                                        </div>


                                    </>

                                )}

                            </div>

                        );

                    }
                )}

            </div>


        </section>

    );

}