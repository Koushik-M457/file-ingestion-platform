const ALLOWED_EXTENSIONS = [
  ".csv",
  ".xlsx",
  ".xls",
];

const MAX_FILE_SIZE =
  Number(import.meta.env.VITE_MAX_FILE_SIZE_MB || 200) *
  1024 *
  1024;

export function validateFile(file) {
  if (!file) {
    return {
      valid: false,
      error: "No file selected.",
    };
  }

  const fileName = file.name.toLowerCase();

  const validExtension = ALLOWED_EXTENSIONS.some(
    (extension) => fileName.endsWith(extension)
  );

  if (!validExtension) {
    return {
      valid: false,
      error: "Only CSV and Excel files are supported.",
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size must be less than ${
        MAX_FILE_SIZE / 1024 / 1024
      } MB.`,
    };
  }

  return {
    valid: true,
    error: null,
  };
}