"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
export default function TestPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const uploadMutation = api.receipts.upload.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setLoading(false);
    },
    onError: (err) => {
      alert(`Error: ${err.message}`);
      setLoading(false);
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setResult(null);

    // Convert file to Base64
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const base64String = (reader.result as string).split(",")[1];
      if (!base64String) return;

      uploadMutation.mutate({
        fileName: file.name,
        mimeType: file.type,
        fileBase64: base64String,
      });
    };
  };

  return (
    <div className="p-8 max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Phase 2 Verification: Upload Receipt</h1>
      
      <div className="border-2 border-dashed p-6 text-center rounded-lg">
        <input 
          type="file" 
          accept="image/*" 
          onChange={handleFileChange} 
          disabled={loading}
        />
        {loading && <p className="mt-4 text-blue-500 animate-pulse">AI is reading your receipt...</p>}
      </div>

      {result && (
        <div className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto max-h-96 text-xs font-mono">
          <p className="font-bold text-sm text-white mb-2">🎉 DB Write Successful:</p>
          {JSON.stringify(result, null, 2)}
        </div>
      )}
    </div>
  );
}