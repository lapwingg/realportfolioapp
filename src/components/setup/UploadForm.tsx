import { useState } from "react";
import { Upload } from "lucide-react";
import { SubmitButton } from "@/components/auth/SubmitButton";

export default function UploadForm() {
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <form
      method="POST"
      action="/api/transactions/import"
      encType="multipart/form-data"
      className="space-y-4"
      noValidate
    >
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-blue-100/80">CSV file</span>
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          onChange={(e) => {
            const file = e.target.files?.[0];
            setFileName(file ? file.name : null);
          }}
          className="block w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white file:mr-3 file:rounded-md file:border-0 file:bg-purple-600 file:px-3 file:py-1 file:text-sm file:font-medium file:text-white hover:file:bg-purple-500"
        />
        {fileName && <span className="mt-2 block text-xs text-blue-100/60">Selected: {fileName}</span>}
      </label>

      <SubmitButton pendingText="Importing..." icon={<Upload className="size-4" />}>
        Import
      </SubmitButton>
    </form>
  );
}
