export type SendEmailResult =
  | { ok: true; mode: "resend"; messageId?: string }
  | { ok: true; mode: "dev_console" }
  | { ok: false; error: string };

/** Send transactional email via Resend when `RESEND_API_KEY` is set; otherwise dev logs or fails in production. */
export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.EMAIL_FROM?.trim() ?? "LocalPro <onboarding@resend.dev>";

  if (!key) {
    if (process.env.NODE_ENV === "development") {
      console.info("[email:dev]", params.to, params.subject, params.text.slice(0, 800));
      return { ok: true, mode: "dev_console" };
    }
    return { ok: false, error: "RESEND_API_KEY is not configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        text: params.text,
        html: params.html,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };

    if (!res.ok) {
      const msg =
        typeof data.message === "string"
          ? data.message
          : `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }

    return { ok: true, mode: "resend", messageId: data.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Email send failed";
    return { ok: false, error: msg };
  }
}
