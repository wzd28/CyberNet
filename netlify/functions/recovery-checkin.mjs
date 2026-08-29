import { serviceFetch } from "../lib/supabase.mjs";

function env(name) {
  try {
    return globalThis.Netlify?.env?.get?.(name) || process.env[name] || "";
  } catch {
    return process.env[name] || "";
  }
}

async function getUserEmail(userId) {
  try {
    const { url, serviceKey } = { url: env("SUPABASE_URL"), serviceKey: env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY") };
    const response = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.email || null;
  } catch {
    return null;
  }
}

async function sendCheckinEmail(email, caseTitle, caseId, siteUrl) {
  const apiKey = env("RESEND_API_KEY");
  if (!apiKey || !email) return false;

  const caseUrl = `${siteUrl}/recovery`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "CyberNet AI <notifications@cybernetai.app>",
        to: [email],
        subject: "Checking in on your recovery case",
        html: `
          <div style="background:#020812;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#08152a;border:1px solid rgba(34,211,238,0.16);border-radius:18px;overflow:hidden;">
              <tr><td style="padding:32px 28px;text-align:center;">
                <div style="font-size:26px;margin-bottom:12px;">🛡️</div>
                <h1 style="color:#eaf6ff;font-size:20px;margin:0 0 10px 0;">How's your recovery going?</h1>
                <p style="color:#8ea5b8;font-size:14px;line-height:1.6;margin:0 0 22px 0;">
                  It's been a little while since you updated your case
                  <strong style="color:#eaf6ff;">"${caseTitle}"</strong>.
                  If you've made progress on the recommended steps, let us know
                  so we can adjust your plan and check what's left to secure.
                </p>
                <a href="${caseUrl}" style="display:inline-block;background:#22d3ee;color:#04141c;font-weight:700;font-size:14px;text-decoration:none;padding:13px 28px;border-radius:10px;">Update My Case</a>
                <p style="color:#5b6b7a;font-size:11px;margin-top:22px;">You're receiving this because you have an open Recovery case on a Pro or Business CyberNet AI account.</p>
              </td></tr>
            </table>
          </div>
        `
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function checkinForPlan(plan, thresholdMinutes, siteUrl) {
  const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000).toISOString();

  const profilesRes = await serviceFetch(
    `/rest/v1/profiles?select=id&plan=eq.${plan}&subscription_status=in.(active,trialing)&limit=1000`
  );
  if (!profilesRes.ok) {
    console.error(`CyberNet recovery-checkin ${plan} profiles query failed`, await profilesRes.text().catch(() => ""));
    return { checked: 0, sent: 0 };
  }
  const users = await profilesRes.json();
  const userIds = users.map((p) => p.id).filter(Boolean);
  if (!userIds.length) return { checked: 0, sent: 0 };

  const idList = userIds.join(",");
  const casesRes = await serviceFetch(
    `/rest/v1/recovery_cases?select=id,owner_user_id,case_title,status,updated_at,last_checkin_sent_at` +
    `&status=neq.resolved&updated_at=lt.${encodeURIComponent(cutoff)}` +
    `&or=(last_checkin_sent_at.is.null,last_checkin_sent_at.lt.${encodeURIComponent(cutoff)})` +
    `&owner_user_id=in.(${idList})&limit=100`
  );

  if (!casesRes.ok) {
    console.error(`CyberNet recovery-checkin ${plan} cases query failed`, await casesRes.text().catch(() => ""));
    return { checked: 0, sent: 0 };
  }

  const cases = await casesRes.json();
  let sent = 0;

  for (const item of cases) {
    const email = await getUserEmail(item.owner_user_id);
    if (!email) continue;

    const ok = await sendCheckinEmail(email, item.case_title || "Recovery Case", item.id, siteUrl);
    if (ok) {
      sent += 1;
      await serviceFetch(`/rest/v1/recovery_cases?id=eq.${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ last_checkin_sent_at: new Date().toISOString() })
      });
    }
  }

  return { checked: cases.length, sent };
}

export default async () => {
  const siteUrl = env("SITE_URL") || "https://cybernetai.app";

  try {
    // Business: automated AI check-ins every 30 minutes on open cases.
    // Pro: proactive check-ins after 24 hours of inactivity on open cases.
    const [businessResult, proResult] = await Promise.all([
      checkinForPlan("business", 30, siteUrl),
      checkinForPlan("pro", 24 * 60, siteUrl)
    ]);

    return new Response(JSON.stringify({
      business: businessResult,
      pro: proResult
    }), { status: 200 });
  } catch (error) {
    console.error("CyberNet recovery-checkin failed", error);
    return new Response("error", { status: 500 });
  }
};

export const config = {
  schedule: "*/15 * * * *"
};
