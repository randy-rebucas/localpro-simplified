import { Invoice } from "@/models/Invoice";

function isDuplicateKeyError(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: number }).code === 11000,
  );
}

/** Sequential human-readable numbers per calendar year (best-effort under concurrency). */
export async function allocateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const last = await Invoice.findOne({ invoice_number: new RegExp(`^${escaped}`) })
    .sort({ invoice_number: -1 })
    .select("invoice_number")
    .lean();

  let seq = 1;
  if (last?.invoice_number) {
    const tail = last.invoice_number.slice(prefix.length).split("-")[0] ?? "";
    const n = parseInt(tail, 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(5, "0")}`;
}

/** Insert helper: retries on rare duplicate invoice_number races. */
export async function withInvoiceNumber<T>(
  insert: (invoiceNumber: string) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const invoice_number =
      attempt === 0
        ? await allocateInvoiceNumber()
        : `${await allocateInvoiceNumber()}-${attempt}`;
    try {
      return await insert(invoice_number);
    } catch (e) {
      if (!isDuplicateKeyError(e)) throw e;
    }
  }
  throw new Error("Could not allocate a unique invoice number");
}
