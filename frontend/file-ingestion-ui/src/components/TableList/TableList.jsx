function TableList({
    tables,
    onSelectTable
}) {

    if (!tables.length) {

        return (
            <div className="table-list-empty">
                Upload files to create tables.
            </div>
        );

    }


    return (

        <div className="table-list">

            <div className="table-list-title">
                Available tables
            </div>


            <div className="table-list-items">

                {tables.map((table) => (

                    <button
                        key={
                            table.table_name
                        }

                        type="button"

                        className="table-item"

                        onClick={() =>
                            onSelectTable(
                                table.table_name
                            )
                        }
                    >

                        <div className="table-name">

                            {table.table_name}

                        </div>

                        <div className="table-meta">

                            {table.rows} rows ·{" "}
                            {table.columns} columns

                        </div>

                    </button>

                ))}

            </div>

        </div>

    );
}


export default TableList;