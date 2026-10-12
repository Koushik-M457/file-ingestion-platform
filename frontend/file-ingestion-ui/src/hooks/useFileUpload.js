import { useState } from "react";
import { validateFile } from "../utils/fileValidation";
import { uploadFile } from "../services/api";

export function useFileUpload() {
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const selectFile = (selectedFile) => {
    setError("");

    const result = validateFile(selectedFile);

    if (!result.valid) {
      setFile(null);
      setError(result.error);
      return;
    }

    setFile(selectedFile);
  };

  const upload = async () => {
    if (!file) return;

    try {
      setUploading(true);
      setError("");

      const result = await uploadFile(file);

      return result;
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const removeFile = () => {
    setFile(null);
    setError("");
  };

  return {
    file,
    error,
    uploading,
    selectFile,
    upload,
    removeFile,
  };
}