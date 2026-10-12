import "./DataPreview.css";


function DataPreview({
  data = [],
  columns = [],
  rowCount = 0,
  tableName = "",
  loading = false,
}) {

  return (

    <section className="preview-card">

      {/* =========================================
          HEADER
      ========================================= */}

      <div className="preview-header">

        <div>

          <h3>
            Transformed Preview
          </h3>

          <p>
            {tableName ||
              "Run a transformation to preview the result"}
          </p>

        </div>


        {rowCount > 0 && (

          <div className="row-count">

            {rowCount.toLocaleString()}
            {" "}
            rows

          </div>

        )}

      </div>


      {/* =========================================
          LOADING
      ========================================= */}

      {loading && (

        <div className="preview-message">

          Running transformation...

        </div>

      )}


      {/* =========================================
          EMPTY
      ========================================= */}

      {!loading &&
        columns.length === 0 && (

          <div className="preview-message">

            Run a SQL transformation
            to see the result here.

          </div>

        )}


      {/* =========================================
          DATA TABLE
      ========================================= */}

      {!loading &&
        columns.length > 0 && (

          <>

            <div className="table-container">

              <table>

                {/* =================================
                    TABLE HEADER
                ================================= */}

                <thead>

                  <tr>

                    {columns.map(
                      (column) => (

                        <th
                          key={column.name}
                        >

                          <div>
                            {column.name}
                          </div>

                          <span>
                            {column.type}
                          </span>

                        </th>

                      )
                    )}

                  </tr>

                </thead>


                {/* =================================
                    TABLE BODY
                ================================= */}

                <tbody>

                  {data.map(
                    (row, rowIndex) => (

                      <tr
                        key={rowIndex}
                      >

                        {columns.map(
                          (column) => (

                            <td
                              key={
                                column.name
                              }
                            >

                              {formatValue(
                                row[
                                  column.name
                                ]
                              )}

                            </td>

                          )
                        )}

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>


            {/* =================================
                FOOTER
            ================================= */}

            <div className="preview-footer">

              Showing{" "}

              {data.length.toLocaleString()}

              {" of "}

              {rowCount.toLocaleString()}

              {" rows · "}

              {columns.length}

              {" columns"}

            </div>

          </>

        )}

    </section>

  );

}


/* =============================================
   FORMAT VALUE
============================================= */

function formatValue(value) {

  if (
    value === null ||
    value === undefined
  ) {

    return "NULL";

  }


  if (
    typeof value === "object"
  ) {

    return JSON.stringify(
      value
    );

  }


  return String(value);

}


export default DataPreview;