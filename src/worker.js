function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function cleanHandle(value) {
  return String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 30);
}

function validNumber(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.min(max, Math.max(min, number));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /*
     * HEALTH CHECK
     */
    if (url.pathname === "/api/health") {
      try {
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

    /*
     * SAVE A SCORE
     */
    if (
      url.pathname === "/api/submit-score" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();

        const playerHandle = cleanHandle(body.playerHandle);
        const wpm = validNumber(body.wpm, 0, 400);
        const accuracy = validNumber(body.accuracy, 0, 100);
        const rejected = validNumber(body.rejected, 0, 10000);
        const bestCombo = validNumber(body.bestCombo, 0, 10000);
        const factoryScore = validNumber(body.factoryScore, 0, 100000000);
        const carrotDistance = validNumber(body.carrotDistance, 0.1, 99.9);
        const shiftId = String(body.shiftId ?? "").trim().slice(0, 100);

        if (!playerHandle) {
          return jsonResponse(
            {
              status: "error",
              message: "A valid player handle is required."
            },
            400
          );
        }

        if (
          wpm === null ||
          accuracy === null ||
          rejected === null ||
          bestCombo === null ||
          factoryScore === null ||
          carrotDistance === null ||
          !shiftId
        ) {
          return jsonResponse(
            {
              status: "error",
              message: "Invalid or incomplete score data."
            },
            400
          );
        }

        const insertResult = await env.DB
          .prepare(`
            INSERT INTO scores (
              player_handle,
              wpm,
              accuracy,
              rejected,
              best_combo,
              factory_score,
              shift_id,
              carrot_distance
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            playerHandle,
            Math.round(wpm),
            accuracy,
            Math.round(rejected),
            Math.round(bestCombo),
            Math.round(factoryScore),
            shiftId,
            carrotDistance
          )
          .run();

        const factoryFileNumber = Number(
          insertResult.meta?.last_row_id ?? 0
        );

        return jsonResponse(
          {
            status: "ok",
            message: "Shift recorded.",
            factoryFileNumber,
            factoryFile: `CF-${String(factoryFileNumber).padStart(6, "0")}`
          },
          201
        );
      } catch (error) {
        const message = String(error?.message ?? error);

        if (message.toLowerCase().includes("unique")) {
          return jsonResponse(
            {
              status: "error",
              message: "This shift has already been recorded."
            },
            409
          );
        }

        return jsonResponse(
          {
            status: "error",
            message: "The shift could not be recorded.",
            detail: message
          },
          500
        );
      }
    }

    /*
     * GET LEADERBOARD
     */
    if (
      url.pathname === "/api/leaderboard" &&
      request.method === "GET"
    ) {
      try {
        const period =
          url.searchParams.get("period") === "all"
            ? "all"
            : "week";

        const whereClause =
          period === "week"
            ? "WHERE datetime(created_at) >= datetime('now', '-7 days')"
            : "";

        const result = await env.DB
          .prepare(`
            SELECT
              id,
              player_handle,
              wpm,
              accuracy,
              rejected,
              best_combo,
              factory_score,
              carrot_distance,
              created_at
            FROM scores
            ${whereClause}
            ORDER BY factory_score DESC, accuracy DESC, wpm DESC
            LIMIT 10
          `)
          .all();

        const leaderboard = (result.results ?? []).map((score, index) => ({
          rank: index + 1,
          factoryFileNumber: Number(score.id),
          factoryFile: `CF-${String(score.id).padStart(6, "0")}`,
          playerHandle: score.player_handle,
          wpm: Number(score.wpm),
          accuracy: Number(score.accuracy),
          rejected: Number(score.rejected),
          bestCombo: Number(score.best_combo),
          factoryScore: Number(score.factory_score),
          carrotDistance: Number(score.carrot_distance),
          createdAt: score.created_at
        }));

        return jsonResponse({
          status: "ok",
          period,
          leaderboard
        });
      } catch (error) {
        return jsonResponse(
          {
            status: "error",
            message: "The leaderboard could not be loaded.",
            detail: String(error?.message ?? error)
          },
          500
        );
      }
    }

    /*
     * SERVE THE EXISTING GAME
     */
    return env.ASSETS.fetch(request);
  }
};