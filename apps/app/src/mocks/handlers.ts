import { http, HttpResponse } from "msw";

type ExportJob = {
  targetId: string;
  reason: string;
  polls: number;
  requestedAt: string;
};

const exportJobs = new Map<string, ExportJob>();

export const handlers = [
  http.post("/api/research/export", async ({ request }) => {
    const body = (await request.json()) as { target_id?: string; reason?: string };
    const jobId = `job_${crypto.randomUUID().slice(0, 8)}`;
    exportJobs.set(jobId, {
      targetId: body.target_id ?? "unknown",
      reason: body.reason ?? "",
      polls: 0,
      requestedAt: new Date().toISOString(),
    });

    return HttpResponse.json({
      job_id: jobId,
      status: "queued",
    });
  }),

  http.get("/api/research/export/:jobId", async ({ params }) => {
    const jobId = String(params.jobId);
    const job = exportJobs.get(jobId);
    if (!job) {
      return new HttpResponse(null, { status: 404 });
    }

    job.polls += 1;
    exportJobs.set(jobId, job);

    if (job.polls <= 1) {
      return HttpResponse.json({
        job_id: jobId,
        status: "queued",
      });
    }
    if (job.polls <= 3) {
      return HttpResponse.json({
        job_id: jobId,
        status: "running",
      });
    }
    return HttpResponse.json({
      job_id: jobId,
      status: "complete",
      artifact_url: `https://artifacts.zbestmedia.com/${job.targetId}/${jobId}.pdf?sig=mock_signed`,
    });
  }),

  http.post("/api/content/score", async ({ request }) => {
    const body = (await request.json()) as { draft?: string };
    const draft = String(body.draft ?? "");
    const len = draft.trim().length;
    const score = Math.max(12, Math.min(100, Math.round(Math.min(len, 400) / 4)));
    const risk = len < 80 ? "high" : len < 180 ? "medium" : "low";
    const readiness = score >= 80 ? "ready" : score >= 55 ? "review" : "not_ready";
    const tone = draft.toLowerCase().includes("urgent") ? "aggressive" : "executive";

    return HttpResponse.json({
      score,
      tone,
      risk,
      readiness,
      warnings: [
        ...(len < 80 ? ["Draft is too short for reliable publish quality."] : []),
        ...(draft.includes("!!!") ? ["Excessive punctuation may trigger platform risk checks."] : []),
      ],
    });
  }),
];
