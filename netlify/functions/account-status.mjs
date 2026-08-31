import {
  json,
  verifyUser,
  getProfile,
  getUsage,
  effectivePlan,
  getHistory,
  isAdminUser
} from "../lib/supabase.mjs";

export default async (request) => {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const { user } = await verifyUser(request);
    const profile = await getProfile(user);
    const plan = effectivePlan(profile);
    const isAdmin = isAdminUser(user);
    const usage = isAdmin
      ? { used: 0, limit: 999999, remaining: 999999, resetDate: null }
      : await getUsage(user.id, profile);

    const includeHistory =
      new URL(request.url).searchParams.get("includeHistory") === "1";

    const history =
      includeHistory && (plan === "pro" || isAdmin)
        ? await getHistory(user.id, 8)
        : [];

    return json({
      profile: {
        fullName:
          profile.full_name ||
          user.user_metadata?.full_name ||
          "",
        plan: isAdmin ? "business" : plan,
        subscriptionStatus:
          profile.subscription_status || "inactive",
        billingInterval:
          profile.billing_interval || ""
      },
      usage,
      history
    });
  } catch (error) {
    return json(
      { error: error.message || "Account status failed." },
      Number(error.status) || 500
    );
  }
};

export const config = {
  path: "/api/account-status"
};
