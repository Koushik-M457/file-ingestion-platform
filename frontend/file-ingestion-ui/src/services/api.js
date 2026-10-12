const API_BASE =
    "http://127.0.0.1:8000/api";


export async function uploadFiles(files) {

    const formData =
        new FormData();

    files.forEach((file) => {

        formData.append(
            "files",
            file
        );

    });


    const response =
        await fetch(
            `${API_BASE}/upload`,
            {
                method: "POST",
                body: formData
            }
        );


    const result =
        await response.json();


    if (!response.ok) {

        throw new Error(
            result.detail ||
            "Upload failed"
        );

    }


    return result;
}


export async function getTables() {

    const response =
        await fetch(
            `${API_BASE}/tables`
        );


    const result =
        await response.json();


    if (!response.ok) {

        throw new Error(
            result.detail ||
            "Failed to load tables"
        );

    }


    return result;
}


export async function runTransform(
    sql,
    outputTable
) {

    const response =
        await fetch(
            `${API_BASE}/transform`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    sql,
                    output_table:
                        outputTable
                })
            }
        );


    const result =
        await response.json();


    if (!response.ok) {

        throw new Error(
            result.detail ||
            "Transformation failed"
        );

    }


    return result;
}