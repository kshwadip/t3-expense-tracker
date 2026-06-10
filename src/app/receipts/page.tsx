"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

// ── Types ────────────────────────────────────────────────────────────────────

type LineItem = {
  id: string;
  name: string;
  quantity: number | null;
  price: string;
};

type Receipt = {
  id: string;
  imageUrl: string;
  status: string;
  merchant: string | null;
  date: Date | null;
  category: string | null;
  currency: string;
  subtotal: string | null;
  tax: string | null;
  total: string | null;
  gstCredit: string | null;
  gstRate: string | null;
  isBusinessExp: boolean | null;
  flagged: boolean | null;
  flagReason: string | null;
  createdAt: Date | null;
  items: LineItem[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, string> = {
  "Food & Dining": "🍽",
  Groceries: "🛒",
  Transport: "🚌",
  Healthcare: "💊",
  Shopping: "🛍",
  Entertainment: "🎬",
  Utilities: "⚡",
  "Taxes & Fees": "🏛",
  Other: "📦",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(value: string | null, currency = "INR") {
  if (!value) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(parseFloat(value));
}

function fmtDate(date: Date | null) {
  if (!date) return "Unknown date";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── Step 2: Skeleton ──────────────────────────────────────────────────────────

function ReceiptSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-[#12121c] border border-[#2a2a3e] rounded-xl px-4 py-4"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="space-y-2">
              <div className="h-4 bg-[#1e1e2e] rounded w-32" />
              <div className="h-3 bg-[#1e1e2e] rounded w-20" />
            </div>
            <div className="h-6 bg-[#1e1e2e] rounded-full w-16" />
          </div>
          <div className="flex items-center justify-between">
            <div className="h-3 bg-[#1e1e2e] rounded w-24" />
            <div className="h-5 bg-[#1e1e2e] rounded w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Step 3: Status Badge ──────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-mono tracking-[0.15em] uppercase px-2 py-1 rounded-full border border-[#2adb7a40] text-[#2adb7a]">
        ✓ Done
      </span>
    );
  }
  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[9px] font-mono tracking-[0.15em] uppercase px-2 py-1 rounded-full border border-[#f5a62340] text-[#f5a623]">
        <span className="w-2 h-2 rounded-full border border-[#f5a623] border-t-transparent animate-spin" />
        Processing
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-mono tracking-[0.15em] uppercase px-2 py-1 rounded-full border border-[#ef444440] text-[#ef4444]">
        ✕ Failed
      </span>
    );
  }
  return null;
}

// ── Step 4 & 5: Receipt Card (expand + delete) ────────────────────────────────

function ReceiptCard({
  receipt,
  onDeleted,
}: {
  receipt: Receipt;
  onDeleted: (id: string) => void;
}) {
  // Step 4: expand/collapse state
  const [expanded, setExpanded] = useState(false);

  // Step 5: delete confirmation state
  const [confirmDelete, setConfirmDelete] = useState(false);

  const deleteMutation = api.receipts.delete.useMutation({
    onSuccess: () => onDeleted(receipt.id),
    onError: (err) => {
      alert(`Delete failed: ${err.message}`);
      setConfirmDelete(false);
    },
  });

  const isDone = receipt.status === "done";
  const hasItems = receipt.items.length > 0;
  const gstCreditVal = parseFloat(receipt.gstCredit ?? "0");
  const canExpand = isDone && hasItems;

  return (
    <div
      className={`bg-[#12121c] border rounded-xl overflow-hidden transition-all ${
        receipt.flagged
          ? "border-[#ef444430]"
          : receipt.status === "failed"
          ? "border-[#ef444420]"
          : "border-[#2a2a3e]"
      }`}
    >
      {/* ── Card header — always visible ── */}
      <div
        className={`px-4 py-3.5 ${canExpand ? "cursor-pointer active:bg-[#ffffff04]" : ""}`}
        onClick={() => canExpand && setExpanded((v) => !v)}
      >
        {/* Row 1: merchant + status badge */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="text-sm text-[#e8e0d0] font-mono truncate">
              {receipt.merchant ?? (isDone ? "Unknown Merchant" : "—")}
            </p>
            <p className="text-[10px] text-[#4a4a6a] mt-0.5">
              {fmtDate(receipt.date ?? receipt.createdAt)}
            </p>
          </div>
          <StatusBadge status={receipt.status} />
        </div>

        {/* Row 2: category + total + expand chevron */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">
              {CATEGORY_ICONS[receipt.category ?? ""] ?? "📦"}
            </span>
            <span className="text-[10px] text-[#6a6a8a]">
              {receipt.category ?? "Uncategorised"}
            </span>
            {/* Badges */}
            {receipt.isBusinessExp && (
              <span className="text-[8px] font-mono tracking-wider uppercase border border-[#2adb7a30] text-[#2adb7a] px-1.5 py-0.5 rounded-full">
                Biz
              </span>
            )}
            {receipt.flagged && (
              <span className="text-[8px] font-mono tracking-wider uppercase border border-[#ef444430] text-[#ef4444] px-1.5 py-0.5 rounded-full">
                ⚠ Flagged
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm text-[#e8e0d0] font-mono">
              {fmt(receipt.total, receipt.currency)}
            </span>
            {canExpand && (
              <span
                className={`text-[#4a4a6a] text-xs transition-transform duration-200 ${
                  expanded ? "rotate-180" : ""
                }`}
              >
                ▾
              </span>
            )}
          </div>
        </div>

        {/* GST credit callout — only if non-zero */}
        {gstCreditVal > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[9px] text-[#2adb7a] font-mono tracking-wider">
              ITC claimable: {fmt(receipt.gstCredit, receipt.currency)}
            </span>
          </div>
        )}
      </div>

      {/* ── Step 4: Expanded line items ── */}
      {expanded && (
        <div className="border-t border-[#1e1e2e]">
          {/* Line items */}
          <div className="px-4 py-3 space-y-2">
            <p className="text-[9px] text-[#4a4a6a] tracking-[0.2em] uppercase mb-2">
              Line Items
            </p>
            {receipt.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between">
                <span className="text-xs text-[#c8c0b0] flex-1 min-w-0 truncate">
                  {item.quantity && item.quantity > 1
                    ? `${item.quantity}× `
                    : ""}
                  {item.name}
                </span>
                <span className="text-xs text-[#e8e0d0] font-mono shrink-0 ml-3">
                  {fmt(item.price, receipt.currency)}
                </span>
              </div>
            ))}
          </div>

          {/* Subtotals */}
          {(receipt.subtotal ?? receipt.tax) && (
            <div className="px-4 pb-3 pt-1 border-t border-[#1e1e2e] space-y-1">
              {receipt.subtotal && (
                <div className="flex justify-between">
                  <span className="text-[10px] text-[#4a4a6a]">Subtotal</span>
                  <span className="text-[10px] text-[#c8c0b0] font-mono">
                    {fmt(receipt.subtotal, receipt.currency)}
                  </span>
                </div>
              )}
              {receipt.tax && parseFloat(receipt.tax) > 0 && (
                <div className="flex justify-between">
                  <span className="text-[10px] text-[#4a4a6a]">
                    GST{receipt.gstRate ? ` (${receipt.gstRate}%)` : ""}
                  </span>
                  <span className="text-[10px] text-[#c8c0b0] font-mono">
                    {fmt(receipt.tax, receipt.currency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t border-[#1e1e2e]">
                <span className="text-[10px] text-[#e8e0d0]">Total</span>
                <span className="text-[10px] text-[#f5a623] font-mono font-bold">
                  {fmt(receipt.total, receipt.currency)}
                </span>
              </div>
            </div>
          )}

          {/* Flag reason if present */}
          {receipt.flagReason && (
            <div className="px-4 pb-3">
              <p className="text-[10px] text-[#ef4444] bg-[#ef444410] border border-[#ef444420] rounded-lg px-3 py-2">
                ⚠ {receipt.flagReason}
              </p>
            </div>
          )}

          {/* ── Step 5: Delete section ── */}
          <div className="px-4 pb-3 pt-1 border-t border-[#1e1e2e]">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-[10px] text-[#4a4a6a] hover:text-[#ef4444] font-mono tracking-wider uppercase transition-colors"
              >
                Delete receipt
              </button>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-[#ef4444]">
                  Delete permanently?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-[10px] text-[#4a4a6a] hover:text-[#c8c0b0] font-mono tracking-wider uppercase transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate({ id: receipt.id })}
                    disabled={deleteMutation.isPending}
                    className="text-[10px] text-[#ef4444] font-mono tracking-wider uppercase disabled:opacity-50"
                  >
                    {deleteMutation.isPending ? "Deleting…" : "Confirm"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReceiptsPage() {
  const {
    data: allReceipts,
    isLoading,
    refetch,
    isRefetching,
  } = api.receipts.getAll.useQuery(undefined, {
    // Auto-refetch every 5 s when any receipt is still processing,
    // so the status badge updates without a manual refresh.
    refetchInterval: (query) => {
      const data = query.state.data as Receipt[] | undefined;
      const hasProcessing = data?.some((r) => r.status === "processing");
      return hasProcessing ? 5000 : false;
    },
  });

  // Optimistic removal — the card disappears instantly on delete confirm
  // instead of waiting for the next getAll refetch.
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const handleDeleted = (id: string) => {
    setDeletedIds((prev) => new Set(prev).add(id));
  };

  const receipts = (allReceipts as Receipt[] | undefined)?.filter(
    (r) => !deletedIds.has(r.id),
  );

  const processingCount =
    receipts?.filter((r) => r.status === "processing").length ?? 0;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e0d0] font-mono pb-24">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-[#0a0a0f] border-b border-[#1e1e2e] px-4 py-4">
        <p className="text-[10px] text-[#f5a623] tracking-[0.35em] uppercase mb-1">
          History
        </p>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Receipts</h1>
            {!isLoading && receipts && (
              <p className="text-[10px] text-[#4a4a6a] mt-0.5">
                {receipts.length} total
                {processingCount > 0 && (
                  <span className="text-[#f5a623] ml-2">
                    · {processingCount} processing
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Refresh button */}
          <button
            onClick={() => void refetch()}
            disabled={isRefetching}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#2a2a3e] text-[#4a4a6a] hover:text-[#f5a623] hover:border-[#f5a62350] transition-all disabled:opacity-40"
            title="Refresh"
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={2} strokeLinecap="round"
              strokeLinejoin="round"
              className={isRefetching ? "animate-spin" : ""}
            >
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-4 py-5">
        {/* ── Step 2: Loading skeleton ── */}
        {isLoading && <ReceiptSkeleton />}

        {/* ── Step 3–5: Receipt cards ── */}
        {!isLoading && receipts && receipts.length > 0 && (
          <div className="space-y-3">
            {receipts.map((receipt) => (
              <ReceiptCard
                key={receipt.id}
                receipt={receipt}
                onDeleted={handleDeleted}
              />
            ))}
          </div>
        )}

        {/* ── Empty state ── */}
        {!isLoading && receipts?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="text-5xl mb-5 opacity-30">🧾</span>
            <p className="text-[#4a4a6a] text-sm mb-1">No receipts yet</p>
            <p className="text-[#2a2a4e] text-xs">
              Upload your first receipt to get started
            </p>
          </div>
        )}
      </div>
    </div>
  );
}