"use client";

import { useState, useRef } from "react";
import { api } from "~/trpc/react";

function fmt(n: string | null) {
  if (!n) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 2,
  }).format(parseFloat(n));
}

export default function UploadPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const upload = api.receipts.upload.useMutation({
    onError: (err) => alert(`Upload failed: ${err.message}`),
  });

  const receipt = upload.data;

  async function processFile(file: File) {
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }
    setPreview(URL.createObjectURL(file));
    upload.reset();

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const b64 = (reader.result as string).split(",")[1];
      if (!b64) return;
      upload.mutate({ fileName: file.name, mimeType: file.type, fileBase64: b64 });
    };
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void processFile(file);
  }

  function reset() {
    setPreview(null);
    upload.reset();
    if (fileRef.current) fileRef.current.value = "";
    fileRef.current?.click();
  }

  const isAnalyzing = upload.isPending;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e0d0] font-mono pb-24">
      {/* Header */}
      <div className="border-b border-[#1e1e2e] px-4 py-4">
        <p className="text-[10px] text-[#f5a623] tracking-[0.35em] uppercase mb-1">
          Receipt Scanner
        </p>
        <h1 className="text-xl font-bold tracking-tight">Upload</h1>
      </div>

      <div className="px-4 py-6 space-y-6 max-w-md mx-auto">
        {/* Drop / tap zone */}
        <div
          onClick={() => !isAnalyzing && fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 overflow-hidden ${
            isAnalyzing ? "cursor-default" : "cursor-pointer"
          } ${
            dragging
              ? "border-[#f5a623] bg-[#f5a62308]"
              : "border-[#2a2a3e] hover:border-[#3a3a5e] bg-[#12121c]"
          }`}
          style={{ minHeight: "180px" }}
        >
          {preview ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Receipt preview"
                className="w-full object-contain max-h-64 opacity-60"
              />
              {isAnalyzing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0f80] backdrop-blur-sm">
                  <div className="w-8 h-8 border-2 border-[#f5a623] border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-xs text-[#f5a623] tracking-widest uppercase animate-pulse">
                    Analyzing…
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
              <span className="text-4xl mb-4 opacity-40">📷</span>
              <p className="text-sm text-[#6a6a8a] mb-1">Tap to select a receipt</p>
              <p className="text-[9px] text-[#2a2a4a] mt-3 tracking-wider uppercase">
                JPG · PNG · WEBP
              </p>
            </div>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Scan another */}
        {preview && !isAnalyzing && (
          <button
            onClick={reset}
            className="w-full py-2.5 text-xs tracking-widest uppercase text-[#4a4a6a] border border-[#2a2a3e] rounded-xl hover:border-[#3a3a5e] hover:text-[#6a6a8a] transition-all"
          >
            Scan another receipt
          </button>
        )}

        {/* ── Result: done ── */}
        {receipt?.status === "done" && (
          <div className="space-y-3">
            <p className="text-[10px] text-[#f5a623] tracking-[0.28em] uppercase">
              Extracted Data
            </p>
            <div className="bg-[#12121c] border border-[#2a2a3e] rounded-xl divide-y divide-[#1e1e2e]">
              <Row label="Merchant" value={receipt.merchant ?? "—"} highlight />
              <Row
                label="Date"
                value={
                  receipt.date
                    ? new Date(receipt.date).toLocaleDateString("en-IN", {
                        day: "2-digit", month: "short", year: "numeric",
                      })
                    : "—"
                }
              />
              <Row label="Category" value={receipt.category ?? "—"} />
              <Row label="Currency" value={receipt.currency} />
            </div>
            <div className="bg-[#12121c] border border-[#2a2a3e] rounded-xl divide-y divide-[#1e1e2e]">
              <Row label="Subtotal" value={fmt(receipt.subtotal)} />
              <Row label="Tax (GST)" value={fmt(receipt.tax)} />
              <Row label="Total" value={fmt(receipt.total)} highlight accent />
            </div>
            <div className="flex gap-2 flex-wrap">
              <span className={`text-[9px] tracking-[0.15em] uppercase px-2.5 py-1 rounded-full border font-mono ${
                receipt.isBusinessExp
                  ? "border-[#2adb7a40] text-[#2adb7a]"
                  : "border-[#2a2a3e] text-[#4a4a6a]"
              }`}>
                {receipt.isBusinessExp ? "✓ Business Expense" : "Personal"}
              </span>
              <span className="text-[9px] tracking-[0.15em] uppercase px-2.5 py-1 rounded-full border border-[#2adb7a40] text-[#2adb7a] font-mono">
                ✓ Saved
              </span>
              {receipt.flagged && (
                <span className="text-[9px] tracking-[0.15em] uppercase px-2.5 py-1 rounded-full border border-[#ef444440] text-[#ef4444] font-mono">
                  ⚠ Flagged
                </span>
              )}
            </div>
            {receipt.flagReason && (
              <p className="text-[10px] text-[#ef4444] bg-[#ef444410] border border-[#ef444420] rounded-lg px-3 py-2">
                {receipt.flagReason}
              </p>
            )}
          </div>
        )}

        {/* ── Result: failed ── */}
        {receipt?.status === "failed" && (
          <div className="bg-[#12121c] border border-[#ef444430] rounded-xl p-4 text-center">
            <p className="text-sm text-[#ef4444] mb-1">Extraction failed</p>
            <p className="text-xs text-[#6a6a8a]">
              The AI couldn&apos;t read this receipt. Try a clearer photo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label, value, highlight = false, accent = false,
}: {
  label: string; value: string; highlight?: boolean; accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5">
      <span className="text-[10px] text-[#4a4a6a] tracking-wider uppercase">{label}</span>
      <span className={`text-sm ${accent ? "text-[#f5a623] font-bold" : highlight ? "text-[#e8e0d0]" : "text-[#c8c0b0]"}`}>
        {value}
      </span>
    </div>
  );
}