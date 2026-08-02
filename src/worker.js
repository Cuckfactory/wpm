function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Eerste controletest: draait de Worker en werkt de database?
    if (url.pathname === "/api/health") {
      try {
        if (!env.DB) {
          return jsonResponse(
            {
              status: "error",
              database: "binding_missing"
            },
            500
          );
        }

        const result = await env.DB
          .prepare("SELECT COUNT(*) AS score_count FROM scores")
          .first();

        return jsonResponse({
          status: "ok",
          worker: "running",
          database: "connected",
          scoresRecorded: Number(result?.score_count ?? 0)
        });
      } catch (error) {
        console.error("Health check failed:", error);

        return jsonResponse(
          {
            status: "error",
            worker: "running",
            database: "query_failed",
            message: String(error?.message ?? error)
          },
          500
        );
      }
    }

    // Alle gewone verzoeken blijven de bestaande website en assets tonen.
    return env.ASSETS.fetch(request);
  }
};