const token = (process.env.BROWSERLESS_TOKEN || "").trim();

if (!token) {
  console.error("ERROR: BROWSERLESS_TOKEN was not loaded.");
  process.exit(1);
}

console.log("Browserless token loaded.");

try {
  const response = await fetch(
    `https://production-sfo.browserless.io/content?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: "https://example.com",
      }),
    }
  );

  const body = await response.text();

  console.log("Browserless status:", response.status);

  if (response.ok) {
    console.log("SUCCESS: Browserless accepted the token.");
  } else {
    console.error("FAILED:", body.slice(0, 300));
  }
} catch (error) {
  console.error("Connection error:", error.message);
}