import React from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acknowledgeAaliyahOpportunity,
  acknowledgeAaliyahStrategicInsight,
  acknowledgeAaliyahNotification,
  createAaliyahEvaluationSchedule,
  createFetchClient,
  composeAaliyahDigest,
  dismissAaliyahOpportunity,
  dismissAaliyahStrategicInsight,
  dismissAaliyahNotification,
  executeFounderCommand,
  getAaliyahCommandSurface,
  getAaliyahDeliveries,
  getAaliyahDigests,
  getAaliyahFounderPreferenceControls,
  getAaliyahFollowThroughEngineRecords,
  getAaliyahInbox,
  getAaliyahNotifications,
  getAaliyahOpportunities,
  getAaliyahStrategicInsights,
  getAaliyahEvaluationSchedules,
  getAaliyahEvaluationRuns,
  getAaliyahRecommendations,
  getAaliyahOpenTasks,
  getAaliyahSessionSnapshot,
  getFounderCommandHistory,
  resetAaliyahSession,
  resolveAppApiBaseUrl,
  readApiEnv,
  retryAaliyahDelivery,
  sendAaliyahDigest,
  putAaliyahFounderPreferenceControls,
  runAaliyahRuntime,
  runAaliyahEvaluationSchedule,
  pauseAaliyahEvaluationSchedule,
  resumeAaliyahEvaluationSchedule,
  type AaliyahInboxItem,
  type AaliyahCommandSurface,
  type AaliyahDeliveryRecord,
  type AaliyahDigestRecord,
  type AaliyahFollowThroughEngineRecord,
  type AaliyahNotificationRecord,
  type AaliyahOpportunityRecord,
  type AaliyahRecommendationRecord,
  type AaliyahEvaluationRunRecord,
  type AaliyahEvaluationRunMutationResult,
  type AaliyahEvaluationScheduleRecord,
  type AaliyahEvaluationScheduleMutationResult,
  type AaliyahFounderPreferenceControlsRecord,
  type AaliyahStrategicInsightRecord,
  type AaliyahMode,
  type AaliyahQuickAction,
  type AaliyahRuntimeResponse,
  type AaliyahSessionSnapshot,
  type AaliyahTask,
  type FounderCommandRecord,
  type FounderCommandRequest,
} from "@zbest/api-sdk";
import { MetricTile, tokens } from "@zbest/ui";
import { AppShell } from "../ui/AppShell";

function correlationId() {
  return crypto.randomUUID();
}

function shortId(value: string | null | undefined) {
  if (!value) return "None";
  return value.length > 12 ? `${value.slice(0, 12)}...` : value;
}

function toIsoFromLocalDateTime(value: string | undefined) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function urgencyTone(urgency: string) {
  switch (urgency) {
    case "urgent":
      return "#FF6B6B";
    case "high":
      return "#FFC857";
    case "normal":
      return "#74C0FC";
    default:
      return tokens.colors.muted;
  }
}

function interruptionLabel(interruptionClass: string) {
  switch (interruptionClass) {
    case "interrupt_now":
      return "Interrupt now";
    case "same_day_briefing":
      return "Same-day briefing";
    case "passive_queue":
      return "Passive queue";
    default:
      return "Silent log";
  }
}

function extractReviewItemId(sourceItemId: string) {
  return sourceItemId.startsWith("review:") ? sourceItemId.slice("review:".length) : null;
}

function extractVoiceCallId(sourceItemId: string) {
  return sourceItemId.startsWith("voice:") ? sourceItemId.slice("voice:".length) : null;
}

export default function AaliyahPage() {
  const queryClient = useQueryClient();
  const fetchClient = React.useMemo(() => createFetchClient({ correlationId }), []);
  const envData = React.useMemo(() => {
    try {
      return {
        env: readApiEnv(import.meta.env as Record<string, unknown>),
        appApiBaseUrl: resolveAppApiBaseUrl(import.meta.env as Record<string, unknown>),
        error: null as string | null,
      };
    } catch (err) {
      return {
        env: null,
        appApiBaseUrl: null,
        error: (err as Error).message,
      };
    }
  }, []);

  const sessionQuery = useQuery({
    queryKey: ["aaliyah", "session"],
    enabled: Boolean(envData.env && envData.appApiBaseUrl),
    queryFn: async () =>
      getAaliyahSessionSnapshot({
        baseUrl: envData.appApiBaseUrl!,
        bearer: envData.env!.VITE_POLICY_BEARER,
        fetchClient,
      }),
    refetchInterval: 20_000,
  });

  const activeMode = sessionQuery.data?.session.activeModeState.activeMode ?? "founder";

  const founderPreferencesQuery = useQuery({
    queryKey: ["aaliyah", "founder-preferences", activeMode],
    enabled: Boolean(envData.env && envData.appApiBaseUrl),
    queryFn: async () =>
      getAaliyahFounderPreferenceControls({
        baseUrl: envData.appApiBaseUrl!,
        bearer: envData.env!.VITE_POLICY_BEARER,
        fetchClient,
        mode: activeMode,
      }),
    refetchInterval: 20_000,
  });

  const [shellQuery, inboxQuery, tasksQuery, commandHistoryQuery, followThroughEngineQuery, recommendationsQuery, notificationsQuery, deliveriesQuery, digestsQuery, opportunitiesQuery, strategicInsightsQuery, evaluationSchedulesQuery, evaluationRunsQuery] = useQueries({
    queries: [
      {
        queryKey: ["aaliyah", "command-surface", activeMode],
        enabled: Boolean(envData.env && envData.appApiBaseUrl),
        queryFn: async () =>
          getAaliyahCommandSurface({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            mode: activeMode,
          }),
        refetchInterval: 20_000,
      },
      {
        queryKey: ["aaliyah", "inbox", activeMode],
        enabled: Boolean(envData.env && envData.appApiBaseUrl),
        queryFn: async () =>
          getAaliyahInbox({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            mode: activeMode,
        }),
        refetchInterval: 20_000,
      },
      {
        queryKey: ["aaliyah", "tasks", activeMode],
        enabled: Boolean(envData.env && envData.appApiBaseUrl),
        queryFn: async () =>
          getAaliyahOpenTasks({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            mode: activeMode,
          }),
        refetchInterval: 20_000,
      },
      {
        queryKey: ["aaliyah", "founder-command-history", activeMode],
        enabled: Boolean(envData.env && envData.appApiBaseUrl),
        queryFn: async () =>
          getFounderCommandHistory({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            mode: activeMode,
            limit: 20,
          }),
        refetchInterval: 20_000,
      },
      {
        queryKey: ["aaliyah", "follow-through-engine", activeMode],
        enabled: Boolean(envData.env && envData.appApiBaseUrl),
        queryFn: async () =>
          getAaliyahFollowThroughEngineRecords({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            mode: activeMode,
            limit: 30,
        }),
        refetchInterval: 20_000,
      },
      {
        queryKey: ["aaliyah", "recommendations", activeMode],
        enabled: Boolean(envData.env && envData.appApiBaseUrl),
        queryFn: async () =>
          getAaliyahRecommendations({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            mode: activeMode,
            limit: 20,
        }),
        refetchInterval: 20_000,
      },
      {
        queryKey: ["aaliyah", "notifications", activeMode],
        enabled: Boolean(envData.env && envData.appApiBaseUrl),
        queryFn: async () =>
          getAaliyahNotifications({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            mode: activeMode,
            limit: 20,
            status: "active",
        }),
        refetchInterval: 20_000,
      },
      {
        queryKey: ["aaliyah", "deliveries", activeMode],
        enabled: Boolean(envData.env && envData.appApiBaseUrl),
        queryFn: async () =>
          getAaliyahDeliveries({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            mode: activeMode,
            limit: 50,
            sourceType: "notification",
        }),
        refetchInterval: 20_000,
      },
      {
        queryKey: ["aaliyah", "digests", activeMode],
        enabled: Boolean(envData.env && envData.appApiBaseUrl),
        queryFn: async () =>
          getAaliyahDigests({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            mode: activeMode,
            limit: 20,
          }),
        refetchInterval: 20_000,
      },
      {
        queryKey: ["aaliyah", "opportunities", activeMode],
        enabled: Boolean(envData.env && envData.appApiBaseUrl),
        queryFn: async () =>
          getAaliyahOpportunities({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            mode: activeMode,
            limit: 20,
            status: "active",
        }),
        refetchInterval: 20_000,
      },
      {
        queryKey: ["aaliyah", "strategic-intelligence", activeMode],
        enabled: Boolean(envData.env && envData.appApiBaseUrl),
        queryFn: async () =>
          getAaliyahStrategicInsights({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            mode: activeMode,
            limit: 20,
            status: "active",
        }),
        refetchInterval: 20_000,
      },
      {
        queryKey: ["aaliyah", "evaluation-schedules", activeMode],
        enabled: Boolean(envData.env && envData.appApiBaseUrl),
        queryFn: async () =>
          getAaliyahEvaluationSchedules({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            mode: activeMode,
            limit: 20,
          }),
        refetchInterval: 20_000,
      },
      {
        queryKey: ["aaliyah", "evaluation-runs", activeMode],
        enabled: Boolean(envData.env && envData.appApiBaseUrl),
        queryFn: async () =>
          getAaliyahEvaluationRuns({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            mode: activeMode,
            limit: 20,
          }),
        refetchInterval: 20_000,
      },
    ],
  });

  const [runtimeNotice, setRuntimeNotice] = React.useState<string | null>(null);
  const [runtimeError, setRuntimeError] = React.useState<string | null>(null);
  const [lastRuntimeResult, setLastRuntimeResult] = React.useState<AaliyahRuntimeResponse["result"] | null>(null);
  const [commandNotice, setCommandNotice] = React.useState<string | null>(null);
  const [commandError, setCommandError] = React.useState<string | null>(null);
  const [draftFollowUpTitles, setDraftFollowUpTitles] = React.useState<Record<string, string>>({});
  const [taskFollowUpTitles, setTaskFollowUpTitles] = React.useState<Record<string, string>>({});
  const [draftRevisionNotes, setDraftRevisionNotes] = React.useState<Record<string, string>>({});
  const [taskEscalationNotes, setTaskEscalationNotes] = React.useState<Record<string, string>>({});
  const [taskScheduleReasons, setTaskScheduleReasons] = React.useState<Record<string, string>>({});
  const [taskScheduleTimes, setTaskScheduleTimes] = React.useState<Record<string, string>>({});
  const [calendarOverrideTargetId, setCalendarOverrideTargetId] = React.useState("");
  const [calendarOverrideReason, setCalendarOverrideReason] = React.useState("");
  const [schedulerEngineType, setSchedulerEngineType] = React.useState<AaliyahEvaluationScheduleRecord["engineType"]>("follow_through");
  const [schedulerCadenceType, setSchedulerCadenceType] = React.useState<AaliyahEvaluationScheduleRecord["cadenceType"]>("hourly");
  const [schedulerCadenceValue, setSchedulerCadenceValue] = React.useState("1");
  const [preferenceDraft, setPreferenceDraft] = React.useState<AaliyahFounderPreferenceControlsRecord | null>(null);

  const runtimeMutation = useMutation({
    mutationFn: async (input: { intent: string; parameters?: Record<string, unknown>; mode?: AaliyahMode }) =>
      runAaliyahRuntime({
        baseUrl: envData.appApiBaseUrl!,
        bearer: envData.env!.VITE_POLICY_BEARER,
        fetchClient,
        intent: input.intent,
        mode: input.mode,
        parameters: input.parameters,
      }),
    onSuccess: async (response) => {
      setLastRuntimeResult(response.result);
      if (response.result.outcomeType === "fallback") {
        setRuntimeError(response.result.fallback.reason);
        setRuntimeNotice(null);
      } else {
        setRuntimeError(null);
        setRuntimeNotice(`Completed ${response.result.resolvedIntent} in ${response.result.activeMode} mode.`);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["aaliyah"] }),
      ]);
    },
    onError: (error) => {
      setRuntimeNotice(null);
      setRuntimeError((error as Error).message);
    },
  });

  const founderCommandMutation = useMutation({
    mutationFn: async (request: FounderCommandRequest) =>
      executeFounderCommand({
        baseUrl: envData.appApiBaseUrl!,
        bearer: envData.env!.VITE_POLICY_BEARER,
        fetchClient,
        request,
      }),
    onSuccess: async (response) => {
      if (response.result.ok) {
        setCommandError(null);
        setCommandNotice(response.result.summary);
      } else {
        setCommandNotice(null);
        setCommandError(response.result.message);
      }
      await queryClient.invalidateQueries({ queryKey: ["aaliyah"] });
    },
    onError: (error) => {
      setCommandNotice(null);
      setCommandError((error as Error).message);
    },
  });

  const notificationMutation = useMutation({
    mutationFn: async (input: { notificationId: string; action: "acknowledge" | "dismiss" }) =>
      input.action === "acknowledge"
        ? acknowledgeAaliyahNotification({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            notificationId: input.notificationId,
            mode: activeMode,
          })
        : dismissAaliyahNotification({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            notificationId: input.notificationId,
            mode: activeMode,
          }),
    onSuccess: async (response) => {
      if (response.result.ok) {
        setCommandError(null);
        setCommandNotice(response.result.message);
      } else {
        setCommandNotice(null);
        setCommandError(response.result.message);
      }
      await queryClient.invalidateQueries({ queryKey: ["aaliyah"] });
    },
    onError: (error) => {
      setCommandNotice(null);
      setCommandError((error as Error).message);
    },
  });

  const opportunityMutation = useMutation({
    mutationFn: async (input: { opportunityId: string; action: "acknowledge" | "dismiss" }) =>
      input.action === "acknowledge"
        ? acknowledgeAaliyahOpportunity({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            opportunityId: input.opportunityId,
            mode: activeMode,
          })
        : dismissAaliyahOpportunity({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            opportunityId: input.opportunityId,
            mode: activeMode,
          }),
    onSuccess: async (response) => {
      setCommandError(null);
      setCommandNotice(response.result.message);
      await queryClient.invalidateQueries({ queryKey: ["aaliyah", "opportunities"] });
    },
    onError: (error) => {
      setCommandNotice(null);
      setCommandError((error as Error).message);
    },
  });

  const strategicInsightMutation = useMutation({
    mutationFn: async (input: { insightId: string; action: "acknowledge" | "dismiss" }) =>
      input.action === "acknowledge"
        ? acknowledgeAaliyahStrategicInsight({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            insightId: input.insightId,
            mode: activeMode,
          })
        : dismissAaliyahStrategicInsight({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            insightId: input.insightId,
            mode: activeMode,
          }),
    onSuccess: async (response) => {
      setCommandError(null);
      setCommandNotice(response.result.message);
      await queryClient.invalidateQueries({ queryKey: ["aaliyah", "strategic-intelligence"] });
    },
    onError: (error) => {
      setCommandNotice(null);
      setCommandError((error as Error).message);
    },
  });

  const deliveryRetryMutation = useMutation({
    mutationFn: async (deliveryId: string) =>
      retryAaliyahDelivery({
        baseUrl: envData.appApiBaseUrl!,
        bearer: envData.env!.VITE_POLICY_BEARER,
        fetchClient,
        deliveryId,
        mode: activeMode,
      }),
    onSuccess: async (response) => {
      if (response.result.ok) {
        setCommandError(null);
        setCommandNotice(response.result.message);
      } else {
        setCommandNotice(null);
        setCommandError(response.result.message);
      }
      await queryClient.invalidateQueries({ queryKey: ["aaliyah"] });
    },
    onError: (error) => {
      setCommandNotice(null);
      setCommandError((error as Error).message);
    },
  });

  const digestMutation = useMutation({
    mutationFn: async (
      input:
        | { action: "compose"; digestType: AaliyahDigestRecord["digestType"] }
        | { action: "send"; digestId: string }
    ) =>
      input.action === "compose"
        ? composeAaliyahDigest({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            mode: activeMode,
            digestType: input.digestType,
          })
        : sendAaliyahDigest({
            baseUrl: envData.appApiBaseUrl!,
            bearer: envData.env!.VITE_POLICY_BEARER,
            fetchClient,
            digestId: input.digestId,
            mode: activeMode,
          }),
    onSuccess: async (response) => {
      if (response.result.ok) {
        setCommandError(null);
        setCommandNotice(response.result.message);
      } else {
        setCommandNotice(null);
        setCommandError(response.result.message);
      }
      await queryClient.invalidateQueries({ queryKey: ["aaliyah"] });
    },
    onError: (error) => {
      setCommandNotice(null);
      setCommandError((error as Error).message);
    },
  });

  const schedulerMutation = useMutation<
    { manifestVersion: string; resourceType: "aaliyah_evaluation_schedule_result"; result: AaliyahEvaluationScheduleMutationResult }
    | { manifestVersion: string; resourceType: "aaliyah_evaluation_run_result"; result: AaliyahEvaluationRunMutationResult },
    Error,
    | { action: "create"; engineType: AaliyahEvaluationScheduleRecord["engineType"]; cadenceType: AaliyahEvaluationScheduleRecord["cadenceType"]; cadenceValue?: string }
    | { action: "pause" | "resume" | "run"; scheduleId: string }
  >({
    mutationFn: async (input:
      | { action: "create"; engineType: AaliyahEvaluationScheduleRecord["engineType"]; cadenceType: AaliyahEvaluationScheduleRecord["cadenceType"]; cadenceValue?: string }
      | { action: "pause" | "resume" | "run"; scheduleId: string }) => {
      if (input.action === "create") {
        return createAaliyahEvaluationSchedule({
          baseUrl: envData.appApiBaseUrl!,
          bearer: envData.env!.VITE_POLICY_BEARER,
          fetchClient,
          mode: activeMode,
          engineType: input.engineType,
          cadenceType: input.cadenceType,
          cadenceValue: input.cadenceValue,
        });
      }
      if (input.action === "pause") {
        return pauseAaliyahEvaluationSchedule({
          baseUrl: envData.appApiBaseUrl!,
          bearer: envData.env!.VITE_POLICY_BEARER,
          fetchClient,
          scheduleId: input.scheduleId,
          mode: activeMode,
        });
      }
      if (input.action === "resume") {
        return resumeAaliyahEvaluationSchedule({
          baseUrl: envData.appApiBaseUrl!,
          bearer: envData.env!.VITE_POLICY_BEARER,
          fetchClient,
          scheduleId: input.scheduleId,
          mode: activeMode,
        });
      }
      return runAaliyahEvaluationSchedule({
        baseUrl: envData.appApiBaseUrl!,
        bearer: envData.env!.VITE_POLICY_BEARER,
        fetchClient,
        scheduleId: input.scheduleId,
        mode: activeMode,
      });
    },
    onSuccess: async (response) => {
      if (response.result.ok) {
        setCommandError(null);
        setCommandNotice(response.result.message);
      } else {
        setCommandNotice(null);
        setCommandError(response.result.message);
      }
      await queryClient.invalidateQueries({ queryKey: ["aaliyah"] });
    },
    onError: (error) => {
      setCommandNotice(null);
      setCommandError((error as Error).message);
    },
  });

  const founderPreferencesMutation = useMutation({
    mutationFn: async (preferences: AaliyahFounderPreferenceControlsRecord) =>
      putAaliyahFounderPreferenceControls({
        baseUrl: envData.appApiBaseUrl!,
        bearer: envData.env!.VITE_POLICY_BEARER,
        fetchClient,
        mode: activeMode,
        preferences
      }),
    onSuccess: async (response) => {
      if (response.result.ok) {
        setCommandError(null);
        setCommandNotice(response.result.message);
        setPreferenceDraft(response.result.preferences);
      } else {
        setCommandNotice(null);
        setCommandError(response.result.message);
      }
      await queryClient.invalidateQueries({ queryKey: ["aaliyah"] });
    },
    onError: (error) => {
      setCommandNotice(null);
      setCommandError((error as Error).message);
    }
  });

  const resetMutation = useMutation({
    mutationFn: async (scope: "soft" | "hard") =>
      resetAaliyahSession({
        baseUrl: envData.appApiBaseUrl!,
        bearer: envData.env!.VITE_POLICY_BEARER,
        fetchClient,
        scope,
      }),
    onSuccess: async (response) => {
      setLastRuntimeResult(null);
      setRuntimeError(null);
      setRuntimeNotice(`Session reset: ${response.reset.resetReason}.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["aaliyah"] }),
      ]);
    },
    onError: (error) => {
      setRuntimeNotice(null);
      setRuntimeError((error as Error).message);
    },
  });

  const isLoading = sessionQuery.isLoading || founderPreferencesQuery.isLoading || shellQuery.isLoading || inboxQuery.isLoading || tasksQuery.isLoading || commandHistoryQuery.isLoading || followThroughEngineQuery.isLoading || recommendationsQuery.isLoading || notificationsQuery.isLoading || deliveriesQuery.isLoading || digestsQuery.isLoading || opportunitiesQuery.isLoading || strategicInsightsQuery.isLoading || evaluationSchedulesQuery.isLoading || evaluationRunsQuery.isLoading;
  const isError = Boolean(envData.error) || sessionQuery.isError || founderPreferencesQuery.isError || shellQuery.isError || inboxQuery.isError || tasksQuery.isError || commandHistoryQuery.isError || followThroughEngineQuery.isError || recommendationsQuery.isError || notificationsQuery.isError || deliveriesQuery.isError || digestsQuery.isError || opportunitiesQuery.isError || strategicInsightsQuery.isError || evaluationSchedulesQuery.isError || evaluationRunsQuery.isError;
  const errorMessage =
    envData.error ??
    (sessionQuery.error as Error | undefined)?.message ??
    (founderPreferencesQuery.error as Error | undefined)?.message ??
    (shellQuery.error as Error | undefined)?.message ??
    (inboxQuery.error as Error | undefined)?.message ??
    (tasksQuery.error as Error | undefined)?.message ??
    (commandHistoryQuery.error as Error | undefined)?.message ??
    (followThroughEngineQuery.error as Error | undefined)?.message ??
    (recommendationsQuery.error as Error | undefined)?.message ??
    (notificationsQuery.error as Error | undefined)?.message ??
    (deliveriesQuery.error as Error | undefined)?.message ??
    (digestsQuery.error as Error | undefined)?.message ??
    (opportunitiesQuery.error as Error | undefined)?.message ??
    (strategicInsightsQuery.error as Error | undefined)?.message ??
    (evaluationSchedulesQuery.error as Error | undefined)?.message ??
    (evaluationRunsQuery.error as Error | undefined)?.message ??
    null;

  const shell = shellQuery.data?.shell;
  const inbox = inboxQuery.data?.inbox;
  const session = sessionQuery.data?.session;
  const tasks = tasksQuery.data?.result.ok ? tasksQuery.data.result.tasks : [];
  const commandHistory = commandHistoryQuery.data?.result.ok ? commandHistoryQuery.data.result.commands : [];
  const followThroughRecords = followThroughEngineQuery.data?.result.ok ? followThroughEngineQuery.data.result.records : [];
  const recommendations = recommendationsQuery.data?.result.ok ? recommendationsQuery.data.result.recommendations : [];
  const notifications = notificationsQuery.data?.result.ok ? notificationsQuery.data.result.notifications : [];
  const deliveries = deliveriesQuery.data?.result.ok ? deliveriesQuery.data.result.deliveries : [];
  const digests = digestsQuery.data?.result.ok ? digestsQuery.data.result.digests : [];
  const opportunities = opportunitiesQuery.data?.result.ok ? opportunitiesQuery.data.result.opportunities : [];
  const strategicInsights = strategicInsightsQuery.data?.result.ok ? strategicInsightsQuery.data.result.insights : [];
  const evaluationSchedules = evaluationSchedulesQuery.data?.result.ok ? evaluationSchedulesQuery.data.result.schedules : [];
  const evaluationRuns = evaluationRunsQuery.data?.result.ok ? evaluationRunsQuery.data.result.runs : [];
  const founderPreferences = founderPreferencesQuery.data?.result.ok ? founderPreferencesQuery.data.result.preferences : null;

  React.useEffect(() => {
    if (founderPreferences) {
      setPreferenceDraft(founderPreferences);
    }
  }, [founderPreferences]);

  const deliveriesByNotificationId = React.useMemo(() => {
    const mapping = new Map<string, Partial<Record<AaliyahDeliveryRecord["channel"], AaliyahDeliveryRecord>>>();
    for (const delivery of deliveries) {
      if (delivery.sourceType !== "notification") continue;
      const existing = mapping.get(delivery.sourceId) ?? {};
      existing[delivery.channel] = delivery;
      mapping.set(delivery.sourceId, existing);
    }
    return mapping;
  }, [deliveries]);

  async function executeIntent(intent: string, parameters?: Record<string, unknown>, mode?: AaliyahMode) {
    await runtimeMutation.mutateAsync({ intent, parameters, mode });
  }

  async function executeQuickAction(action: AaliyahQuickAction) {
    if (action.availabilityStatus !== "available") {
      setRuntimeNotice(null);
      setRuntimeError(action.availabilityReason ?? "Quick action is not available.");
      return;
    }
    await executeIntent("execute_quick_action", { actionId: action.actionId });
  }

  async function submitFounderCommand(request: Omit<FounderCommandRequest, "mode" | "idempotencyKey"> & { idempotencySeed: string }) {
    setCommandNotice(null);
    setCommandError(null);
    await founderCommandMutation.mutateAsync({
      mode: activeMode,
      commandType: request.commandType,
      target: request.target,
      payload: request.payload,
      idempotencyKey: request.idempotencySeed,
    });
  }

  async function approveDraft(reviewItemId: string, approvalMode: "approved_for_send" | "approved_for_revision") {
    await submitFounderCommand({
      commandType: "approve_draft",
      target: { targetType: "gmail_draft", targetId: reviewItemId },
      payload: {
        approvalMode,
        notes: approvalMode === "approved_for_revision" ? draftRevisionNotes[reviewItemId] ?? "" : undefined,
      },
      idempotencySeed: `approve_draft:${reviewItemId}:${approvalMode}`,
    });
  }

  async function createFollowUpFromTarget(targetType: FounderCommandRequest["target"]["targetType"], targetId: string, title: string) {
    await submitFounderCommand({
      commandType: "create_follow_up",
      target: { targetType, targetId },
      payload: { title },
      idempotencySeed: `follow_up:${targetType}:${targetId}`,
    });
  }

  async function escalateTask(taskId: string) {
    await submitFounderCommand({
      commandType: "escalate_task",
      target: { targetType: "task", targetId: taskId },
      payload: {
        escalationReason: "urgent",
        priority: "critical",
        notes: taskEscalationNotes[taskId] ?? undefined,
      },
      idempotencySeed: `escalate_task:${taskId}`,
    });
  }

  async function overrideTaskSchedule(taskId: string) {
    await submitFounderCommand({
      commandType: "override_schedule",
      target: { targetType: "task", targetId: taskId },
      payload: {
        overrideMode: "reschedule",
        startAtIso: toIsoFromLocalDateTime(taskScheduleTimes[taskId]),
        reason: taskScheduleReasons[taskId] ?? "",
      },
      idempotencySeed: `override_schedule:task:${taskId}`,
    });
  }

  async function recordCalendarOverride() {
    await submitFounderCommand({
      commandType: "override_schedule",
      target: { targetType: "calendar_event", targetId: calendarOverrideTargetId },
      payload: {
        overrideMode: "reschedule",
        reason: calendarOverrideReason,
      },
      idempotencySeed: `override_schedule:calendar:${calendarOverrideTargetId}`,
    });
  }

  async function triggerWorkflow(workflowName: "draft_follow_up" | "contact_revival" | "post_meeting_recap") {
    await submitFounderCommand({
      commandType: "trigger_workflow",
      target: { targetType: "workflow", targetId: workflowName },
      payload: { workflowName },
      idempotencySeed: `trigger_workflow:${workflowName}`,
    });
  }

  async function saveFounderPreferences() {
    if (!preferenceDraft) return;
    await founderPreferencesMutation.mutateAsync(preferenceDraft);
  }

  async function acknowledgeNotification(notificationId: string) {
    await notificationMutation.mutateAsync({ notificationId, action: "acknowledge" });
  }

  async function dismissNotification(notificationId: string) {
    await notificationMutation.mutateAsync({ notificationId, action: "dismiss" });
  }

  async function retryDelivery(deliveryId: string) {
    await deliveryRetryMutation.mutateAsync(deliveryId);
  }

  async function composeDigest(digestType: AaliyahDigestRecord["digestType"]) {
    await digestMutation.mutateAsync({ action: "compose", digestType });
  }

  async function sendDigest(digestId: string) {
    await digestMutation.mutateAsync({ action: "send", digestId });
  }

  async function acknowledgeOpportunity(opportunityId: string) {
    await opportunityMutation.mutateAsync({ opportunityId, action: "acknowledge" });
  }

  async function dismissOpportunity(opportunityId: string) {
    await opportunityMutation.mutateAsync({ opportunityId, action: "dismiss" });
  }

  async function acknowledgeStrategicInsight(insightId: string) {
    await strategicInsightMutation.mutateAsync({ insightId, action: "acknowledge" });
  }

  async function dismissStrategicInsight(insightId: string) {
    await strategicInsightMutation.mutateAsync({ insightId, action: "dismiss" });
  }

  async function saveEvaluationSchedule() {
    await schedulerMutation.mutateAsync({
      action: "create",
      engineType: schedulerEngineType,
      cadenceType: schedulerCadenceType,
      cadenceValue: schedulerCadenceType === "manual" ? undefined : schedulerCadenceValue,
    });
  }

  async function pauseEvaluationSchedule(scheduleId: string) {
    await schedulerMutation.mutateAsync({ action: "pause", scheduleId });
  }

  async function resumeEvaluationSchedule(scheduleId: string) {
    await schedulerMutation.mutateAsync({ action: "resume", scheduleId });
  }

  async function runEvaluationScheduleNow(scheduleId: string) {
    await schedulerMutation.mutateAsync({ action: "run", scheduleId });
  }

  async function actOnRecommendation(recommendation: AaliyahRecommendationRecord) {
    const targetType = typeof recommendation.metadata.targetType === "string" ? recommendation.metadata.targetType : null;
    const targetId = typeof recommendation.metadata.targetId === "string" ? recommendation.metadata.targetId : null;

    switch (recommendation.recommendationType) {
      case "escalate_now":
        if (targetType === "task" && targetId) {
          await escalateTask(targetId);
          return;
        }
        break;
      case "revive_contact":
        if (targetType === "contact" && targetId) {
          await createFollowUpFromTarget("contact", targetId, "Revive relationship with this contact");
          return;
        }
        break;
      case "follow_up_now":
        if (targetType && targetId && ["task", "contact", "account", "gmail_draft", "calendar_event"].includes(targetType)) {
          await createFollowUpFromTarget(targetType as FounderCommandRequest["target"]["targetType"], targetId, "Follow up now");
          return;
        }
        break;
      case "schedule_next":
        if (targetType === "calendar_event" && targetId) {
          await submitFounderCommand({
            commandType: "override_schedule",
            target: { targetType: "calendar_event", targetId },
            payload: {
              overrideMode: "reschedule",
              reason: "Recommendation surfaced a missing next scheduled step.",
            },
            idempotencySeed: `override_schedule:calendar:${targetId}`,
          });
          return;
        }
        break;
      case "send_now":
      case "noop":
      default:
        break;
    }

    setCommandNotice(null);
    setCommandError("This recommendation is advisory only right now and has no Pack 34 command mapping.");
  }

  async function actOnOpportunity(opportunity: AaliyahOpportunityRecord) {
    const targetType = typeof opportunity.metadata.targetType === "string" ? opportunity.metadata.targetType : null;
    const targetId = typeof opportunity.metadata.targetId === "string" ? opportunity.metadata.targetId : null;

    switch (opportunity.opportunityType) {
      case "dormant_contact":
      case "engagement_spike":
        if (targetType === "contact" && targetId) {
          await createFollowUpFromTarget("contact", targetId, "Re-engage this contact");
          return;
        }
        if (targetType === "account" && targetId) {
          await createFollowUpFromTarget("account", targetId, "Re-engage this account");
          return;
        }
        break;
      case "missed_follow_up_window":
        if (targetType === "calendar_event" && targetId) {
          await submitFounderCommand({
            commandType: "override_schedule",
            target: { targetType: "calendar_event", targetId },
            payload: {
              overrideMode: "reschedule",
              reason: "Opportunity engine surfaced a missed follow-up window.",
            },
            idempotencySeed: `override_schedule:calendar:${targetId}`,
          });
          return;
        }
        if (targetType === "contact" && targetId) {
          await createFollowUpFromTarget("contact", targetId, "Create the missed follow-up now");
          return;
        }
        if (targetType === "task" && targetId) {
          await createFollowUpFromTarget("task", targetId, "Create the missed follow-up now");
          return;
        }
        break;
      case "stalled_pipeline":
      case "recurring_block_pattern":
        if (targetType === "task" && targetId) {
          await escalateTask(targetId);
          return;
        }
        if (targetType === "contact" && targetId) {
          await createFollowUpFromTarget("contact", targetId, "Break the stall with a concrete follow-up");
          return;
        }
        break;
      case "noop":
      default:
        break;
    }

    setCommandNotice(null);
    setCommandError("This opportunity is advisory only right now and has no Pack 34 command mapping.");
  }

  async function handleQueueAction(item: AaliyahInboxItem, action: string) {
    switch (action) {
      case "open_review_item":
        await executeIntent("get_founder_queue_item", { queueItemId: item.queueItemId });
        return;
      case "approve_review_item": {
        const reviewItemId = extractReviewItemId(item.sourceItemId);
        if (!reviewItemId) {
          setRuntimeError("Review item context is missing.");
          return;
        }
        await approveDraft(reviewItemId, "approved_for_send");
        return;
      }
      case "request_review_revision": {
        const reviewItemId = extractReviewItemId(item.sourceItemId);
        if (!reviewItemId) {
          setRuntimeError("Review item context is missing.");
          return;
        }
        const note = window.prompt("Revision note", draftRevisionNotes[reviewItemId] ?? "Tighten the language and remove any unconfirmed commitments.");
        if (!note) {
          return;
        }
        setDraftRevisionNotes((current) => ({ ...current, [reviewItemId]: note }));
        await approveDraft(reviewItemId, "approved_for_revision");
        return;
      }
      case "open_voice_escalation": {
        const callId = extractVoiceCallId(item.sourceItemId);
        if (!callId) {
          setRuntimeError("Voice escalation target is missing.");
          return;
        }
        await executeIntent("get_voice_call_summary", { callId });
        return;
      }
      case "open_incident":
        await executeIntent("get_incident_summary");
        return;
      case "refresh_founder_briefing":
        await executeIntent("get_founder_briefing");
        return;
      default:
        setRuntimeError(`Unsupported founder action: ${action}`);
    }
  }

  return (
    <AppShell
      title="Aaliyah"
      right={
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <ModeButton active={activeMode === "founder"} onClick={() => executeIntent("switch_mode", { targetMode: "founder" })}>
            Founder
          </ModeButton>
          <ModeButton active={activeMode === "zbestmedia"} onClick={() => executeIntent("switch_mode", { targetMode: "zbestmedia" })}>
            Z Best Media
          </ModeButton>
          <button style={ghostButtonStyle} onClick={() => resetMutation.mutate("soft")} disabled={resetMutation.isPending}>
            Soft reset
          </button>
        </div>
      }
    >
      {isLoading ? (
        <LoadingState />
      ) : isError || !shell || !inbox || !session ? (
        <ErrorState message={errorMessage ?? "Failed to load Aaliyah founder console."} />
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={heroStyle}>
            <div>
              <div style={{ fontSize: 12, color: tokens.colors.muted, letterSpacing: 0.6, textTransform: "uppercase" }}>
                Founder operating console
              </div>
              <div style={{ marginTop: 6, fontSize: 28, fontWeight: 750, lineHeight: 1.1 }}>
                {shell.whatMattersNow[0]?.title ?? "Aaliyah is standing by."}
              </div>
              <div style={{ marginTop: 8, maxWidth: 720, color: tokens.colors.muted, fontSize: 14 }}>
                {shell.whatMattersNow[0]?.summary ?? "No interrupt-worthy founder item is active right now. Use the queue to review governed actions."}
              </div>
            </div>
            <div style={heroMetaStyle}>
              <StatusChip label={`Mode: ${shell.activeMode}`} tone="info" />
              <StatusChip
                label={`Ops: ${shell.opsStatusSummary.statusLevel}`}
                tone={shell.opsStatusSummary.statusLevel === "critical" ? "danger" : shell.opsStatusSummary.statusLevel === "warning" ? "warn" : "ok"}
              />
              <StatusChip label={`Session: ${shortId(session.sessionId)}`} tone="neutral" />
            </div>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <MetricTile label="What Matters" value={`${shell.whatMattersNow.length}`} accent />
            <MetricTile label="Open Approvals" value={`${shell.openApprovals.totalPending}`} />
            <MetricTile label="Interrupt Now" value={`${shell.interruptQueueSummary.interruptNowCount}`} />
            <MetricTile label="Founder Inbox" value={`${inbox.totalItems}`} />
          </div>

          {runtimeNotice || runtimeError || commandNotice || commandError ? (
            <div
              style={{
                ...panelStyle,
                borderColor: runtimeError || commandError ? "#C92A2A" : tokens.colors.border,
                background: runtimeError || commandError ? "rgba(201,42,42,0.08)" : tokens.colors.surface,
              }}
            >
              <div style={{ fontWeight: 650 }}>{runtimeError || commandError ? "Action blocked" : "Control update"}</div>
              <div style={{ marginTop: 6, color: runtimeError || commandError ? "#FF8787" : tokens.colors.muted, fontSize: 13 }}>
                {commandError ?? runtimeError ?? commandNotice ?? runtimeNotice}
              </div>
              {lastRuntimeResult ? (
                <div style={{ marginTop: 8, fontSize: 12, color: tokens.colors.muted }}>
                  {lastRuntimeResult.outcomeType === "completed"
                    ? `Payload: ${lastRuntimeResult.payloadType}`
                    : `Fallback: ${lastRuntimeResult.fallback.outcome}`}
                </div>
              ) : null}
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 1.55fr) minmax(320px, 0.95fr)" }}>
            <div style={{ display: "grid", gap: 16 }}>
              <Section
                title="What Matters Now"
                subtitle="High-signal founder items ranked by interruption, urgency, and operational pressure."
              >
                <ItemList items={shell.whatMattersNow} emptyText="No founder-priority items are active." />
              </Section>

              <Section
                title="Unified Founder Queue"
                subtitle="One governed queue for approvals, dispatch-ready actions, escalations, and founder-relevant incidents."
              >
                <div style={{ display: "grid", gap: 12 }}>
                  {inbox.items.length === 0 ? (
                    <EmptyState text="The founder queue is clear." />
                  ) : (
                    inbox.items.map((item) => (
                      <InboxItemCard
                        key={item.inboxItemId}
                        item={item}
                        busy={runtimeMutation.isPending}
                        onAction={(action) => void handleQueueAction(item, action)}
                      />
                    ))
                  )}
                </div>
              </Section>

              <Section
                title="Founder Command Console"
                subtitle="Backend-governed controls for draft approval, follow-through, task escalation, schedule overrides, workflows, and command history."
              >
                <div style={{ display: "grid", gap: 16 }}>
                  <DraftReviewPanel
                    drafts={shell.openApprovals.items}
                    busy={founderCommandMutation.isPending}
                    revisionNotes={draftRevisionNotes}
                    followUpTitles={draftFollowUpTitles}
                    onRevisionNoteChange={(reviewItemId, value) =>
                      setDraftRevisionNotes((current) => ({ ...current, [reviewItemId]: value }))
                    }
                    onFollowUpTitleChange={(reviewItemId, value) =>
                      setDraftFollowUpTitles((current) => ({ ...current, [reviewItemId]: value }))
                    }
                    onApprove={(reviewItemId) => void approveDraft(reviewItemId, "approved_for_send")}
                    onRevision={(reviewItemId) => void approveDraft(reviewItemId, "approved_for_revision")}
                    onCreateFollowUp={(reviewItemId, title) => void createFollowUpFromTarget("gmail_draft", reviewItemId, title)}
                  />

                  <TaskControlPanel
                    tasks={tasks}
                    busy={founderCommandMutation.isPending}
                    escalationNotes={taskEscalationNotes}
                    followUpTitles={taskFollowUpTitles}
                    onEscalationNoteChange={(taskId, value) =>
                      setTaskEscalationNotes((current) => ({ ...current, [taskId]: value }))
                    }
                    onFollowUpTitleChange={(taskId, value) =>
                      setTaskFollowUpTitles((current) => ({ ...current, [taskId]: value }))
                    }
                    onEscalate={(taskId) => void escalateTask(taskId)}
                    onCreateFollowUp={(taskId, title) => void createFollowUpFromTarget("task", taskId, title)}
                  />

                  <ScheduleOverridePanel
                    tasks={tasks}
                    busy={founderCommandMutation.isPending}
                    taskScheduleReasons={taskScheduleReasons}
                    taskScheduleTimes={taskScheduleTimes}
                    calendarTargetId={calendarOverrideTargetId}
                    calendarReason={calendarOverrideReason}
                    onTaskReasonChange={(taskId, value) =>
                      setTaskScheduleReasons((current) => ({ ...current, [taskId]: value }))
                    }
                    onTaskTimeChange={(taskId, value) =>
                      setTaskScheduleTimes((current) => ({ ...current, [taskId]: value }))
                    }
                    onCalendarTargetIdChange={setCalendarOverrideTargetId}
                    onCalendarReasonChange={setCalendarOverrideReason}
                    onTaskOverride={(taskId) => void overrideTaskSchedule(taskId)}
                    onCalendarOverride={() => void recordCalendarOverride()}
                  />

                  <WorkflowTriggerPanel busy={founderCommandMutation.isPending} onTrigger={(workflowName) => void triggerWorkflow(workflowName)} />

                  <CommandHistoryPanel commands={commandHistory} />

                  <FollowThroughEnginePanel records={followThroughRecords} />

                  <RecommendationsPanel
                    recommendations={recommendations}
                    busy={founderCommandMutation.isPending}
                    onAct={(recommendation) => void actOnRecommendation(recommendation)}
                  />

                  <NotificationsPanel
                    notifications={notifications}
                    deliveriesByNotificationId={deliveriesByNotificationId}
                    busy={notificationMutation.isPending || deliveryRetryMutation.isPending}
                    onAcknowledge={(notificationId) => void acknowledgeNotification(notificationId)}
                    onDismiss={(notificationId) => void dismissNotification(notificationId)}
                    onRetryDelivery={(deliveryId) => void retryDelivery(deliveryId)}
                  />

                  <DigestsPanel
                    digests={digests}
                    busy={digestMutation.isPending}
                    onCompose={(digestType) => void composeDigest(digestType)}
                    onSend={(digestId) => void sendDigest(digestId)}
                  />

                  <OpportunitiesPanel
                    opportunities={opportunities}
                    busy={founderCommandMutation.isPending || opportunityMutation.isPending}
                    onAct={(opportunity) => void actOnOpportunity(opportunity)}
                    onAcknowledge={(opportunityId) => void acknowledgeOpportunity(opportunityId)}
                    onDismiss={(opportunityId) => void dismissOpportunity(opportunityId)}
                  />

                  <StrategicIntelligencePanel
                    insights={strategicInsights}
                    busy={strategicInsightMutation.isPending}
                    onAcknowledge={(insightId) => void acknowledgeStrategicInsight(insightId)}
                    onDismiss={(insightId) => void dismissStrategicInsight(insightId)}
                  />

                  <EvaluationSchedulerPanel
                    schedules={evaluationSchedules}
                    runs={evaluationRuns}
                    busy={schedulerMutation.isPending}
                    engineType={schedulerEngineType}
                    cadenceType={schedulerCadenceType}
                    cadenceValue={schedulerCadenceValue}
                    onEngineTypeChange={setSchedulerEngineType}
                    onCadenceTypeChange={setSchedulerCadenceType}
                    onCadenceValueChange={setSchedulerCadenceValue}
                    onSave={() => void saveEvaluationSchedule()}
                    onPause={(scheduleId) => void pauseEvaluationSchedule(scheduleId)}
                    onResume={(scheduleId) => void resumeEvaluationSchedule(scheduleId)}
                    onRunNow={(scheduleId) => void runEvaluationScheduleNow(scheduleId)}
                  />

                  <FounderPreferencesControlsPanel
                    preferences={preferenceDraft}
                    busy={founderPreferencesMutation.isPending}
                    onChange={setPreferenceDraft}
                    onSave={() => void saveFounderPreferences()}
                  />
                </div>
              </Section>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              <Section title="Waiting on Me" subtitle="Items currently surfaced for direct founder attention.">
                <ItemList items={shell.waitingOnMe} emptyText="Nothing is waiting on you right now." compact />
              </Section>

              <Section title="Quick Actions" subtitle="Only governed actions with known runtime targets.">
                <div style={{ display: "grid", gap: 10 }}>
                  {shell.quickActions.map((action) => (
                    <button
                      key={action.actionId}
                      style={{
                        ...actionButtonStyle,
                        opacity: action.availabilityStatus === "available" ? 1 : 0.6,
                      }}
                      onClick={() => void executeQuickAction(action)}
                      disabled={runtimeMutation.isPending || action.availabilityStatus !== "available"}
                    >
                      <span>{action.label}</span>
                      <span style={{ fontSize: 12, color: tokens.colors.muted }}>
                        {action.availabilityStatus === "available" ? "Run" : action.availabilityReason ?? "Unavailable"}
                      </span>
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="Session Context" subtitle="Inspectable founder-safe continuity, bounded by reset and retention policy.">
                <SessionPanel session={session} onHardReset={() => resetMutation.mutate("hard")} pending={resetMutation.isPending} />
              </Section>

              <Section title="Interruption Control" subtitle="What should interrupt now, what can wait, and why.">
                <InterruptionPanel shell={shell} />
              </Section>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function triageTone(triageClass: string) {
  switch (triageClass) {
    case "act_now":
      return "filled";
    case "blocked":
      return "filled";
    case "stale":
      return "outline";
    case "resolved_or_terminal":
      return "outline";
    default:
      return "outline";
  }
}

function InboxItemCard({
  item,
  busy,
  onAction,
}: {
  item: AaliyahInboxItem;
  busy: boolean;
  onAction: (action: string) => void;
}) {
  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 650 }}>{item.title}</div>
            <Tag label={item.priorityBand.toUpperCase()} tone={item.priorityBand === "p0" || item.priorityBand === "p1" ? "filled" : "outline"} />
            <Tag label={item.triageClass.replaceAll("_", " ")} tone={triageTone(item.triageClass)} />
            <Tag label={item.itemType.replaceAll("_", " ")} />
            <Tag label={interruptionLabel(item.interruptionClass)} tone="outline" />
            {item.isBlocked ? <Tag label="blocked" tone="filled" /> : null}
            {item.isStale ? <Tag label="stale" tone="outline" /> : null}
          </div>
          <div style={{ marginTop: 6, color: tokens.colors.muted, fontSize: 13 }}>{item.summary}</div>
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {item.reasonCodes.map((reason) => (
              <Tag key={reason} label={reason.replaceAll("_", " ")} tone="outline" />
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
          <span style={{ color: urgencyTone(item.urgency), fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>{item.urgency}</span>
          <span style={{ color: tokens.colors.muted, fontSize: 12 }}>next {item.nextFounderAction.replaceAll("_", " ")}</span>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {actionListForInbox(item).map((action) => (
          <button key={action} style={chipButtonStyle} onClick={() => onAction(action)} disabled={busy}>
            {actionLabel(action)}
          </button>
        ))}
      </div>
    </div>
  );
}

function actionListForInbox(item: AaliyahInboxItem) {
  switch (item.nextFounderAction) {
    case "approve_review_item":
      return ["open_review_item", "approve_review_item", "request_review_revision"];
    case "dispatch_email":
      return ["open_review_item"];
    case "review_voice_escalation":
      return ["open_voice_escalation"];
    case "review_incident":
      return ["open_incident"];
    case "refresh_briefing":
      return ["refresh_founder_briefing"];
    default:
      return [];
  }
}

function InterruptionPanel({ shell }: { shell: AaliyahCommandSurface }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <MetricMini label="Interrupt now" value={shell.interruptQueueSummary.interruptNowCount} />
        <MetricMini label="Same day" value={shell.interruptQueueSummary.sameDayBriefingCount} />
        <MetricMini label="Passive" value={shell.interruptQueueSummary.passiveQueueCount} />
        <MetricMini label="Suppressed" value={shell.interruptQueueSummary.silentLogCount} />
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {shell.interruptionQueue.items.slice(0, 4).map((item) => (
          <div key={`${item.sourceItemId}:${item.visibilityAction}`} style={compactPanelStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 600 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: tokens.colors.muted }}>{interruptionLabel(item.visibilityAction)}</div>
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: tokens.colors.muted }}>{item.summary}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionPanel({
  session,
  onHardReset,
  pending,
}: {
  session: AaliyahSessionSnapshot;
  onHardReset: () => void;
  pending: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 10 }}>
        <DataRow label="Active mode" value={session.activeModeState.activeMode} />
        <DataRow label="Previous mode" value={session.activeModeState.previousMode ?? "None"} />
        <DataRow label="Last intent" value={session.interactionState.lastResolvedIntent ?? session.interactionState.lastIntent ?? "None"} />
        <DataRow label="Working item" value={session.interactionState.currentWorkingItem?.title ?? "None"} />
        <DataRow label="Review context" value={session.interactionState.activeReviewContext?.reviewItemId ?? "None"} />
      </div>

      {session.interactionState.pendingDisambiguation ? (
        <div style={{ ...compactPanelStyle, borderColor: "#FAB005" }}>
          <div style={{ fontWeight: 650 }}>Pending disambiguation</div>
          <div style={{ marginTop: 4, fontSize: 13, color: tokens.colors.muted }}>
            {session.interactionState.pendingDisambiguation.reason}
          </div>
        </div>
      ) : null}

      {session.interactionState.currentWorkingItem ? (
        <div style={compactPanelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontWeight: 650 }}>{session.interactionState.currentWorkingItem.title}</div>
            <div style={{ fontSize: 12, color: tokens.colors.muted }}>
              {session.interactionState.currentWorkingItem.closureState}
            </div>
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: tokens.colors.muted }}>
            {session.interactionState.currentWorkingItem.summary}
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={ghostButtonStyle} onClick={onHardReset} disabled={pending}>
          Hard reset
        </button>
        <div style={{ alignSelf: "center", fontSize: 12, color: tokens.colors.muted }}>
          Expires {new Date(session.expiresAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

function ItemList({
  items,
  emptyText,
  compact,
}: {
  items: AaliyahCommandSurface["whatMattersNow"];
  emptyText: string;
  compact?: boolean;
}) {
  if (items.length === 0) {
    return <EmptyState text={emptyText} />;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.slice(0, compact ? 4 : 6).map((item) => (
        <div key={item.itemId} style={compact ? compactPanelStyle : panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 650 }}>{item.title}</div>
              <div style={{ marginTop: 5, fontSize: 13, color: tokens.colors.muted }}>{item.summary}</div>
            </div>
            <span style={{ color: urgencyTone(item.urgency), fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>{item.urgency}</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: tokens.colors.muted }}>{item.recommendedAction}</div>
        </div>
      ))}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section style={panelStyle}>
      <div>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <div style={{ marginTop: 4, color: tokens.colors.muted, fontSize: 13 }}>{subtitle}</div>
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
}

function DraftReviewPanel(args: {
  drafts: AaliyahCommandSurface["openApprovals"]["items"];
  busy: boolean;
  revisionNotes: Record<string, string>;
  followUpTitles: Record<string, string>;
  onRevisionNoteChange: (reviewItemId: string, value: string) => void;
  onFollowUpTitleChange: (reviewItemId: string, value: string) => void;
  onApprove: (reviewItemId: string) => void;
  onRevision: (reviewItemId: string) => void;
  onCreateFollowUp: (reviewItemId: string, title: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Draft Review</div>
      {args.drafts.length === 0 ? (
        <EmptyState text="No Gmail drafts are waiting for founder approval." />
      ) : (
        args.drafts.map((draft) => (
          <div key={draft.reviewItemId} style={compactPanelStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 650 }}>{draft.proposedSubject}</div>
                <div style={{ marginTop: 4, fontSize: 13, color: tokens.colors.muted }}>{draft.summary}</div>
              </div>
              <Tag label={draft.reviewStatus.replaceAll("_", " ")} tone="outline" />
            </div>
            <div style={{ marginTop: 10, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
              <DataBlock label="Linked draft" value={shortId(draft.draftId)} />
              <DataBlock label="Thread" value={shortId(draft.threadId)} />
              <DataBlock label="Priority" value={draft.priority} />
              <DataBlock label="Risk" value={draft.riskLevel} />
            </div>
            <textarea
              style={textAreaStyle}
              rows={2}
              placeholder="Revision note for Aaliyah"
              value={args.revisionNotes[draft.reviewItemId] ?? ""}
              onChange={(event) => args.onRevisionNoteChange(draft.reviewItemId, event.target.value)}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={primaryButtonStyle} disabled={args.busy} onClick={() => args.onApprove(draft.reviewItemId)}>
                Approve for send
              </button>
              <button style={ghostButtonStyle} disabled={args.busy} onClick={() => args.onRevision(draft.reviewItemId)}>
                Approve for revision
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                style={inputStyle}
                value={args.followUpTitles[draft.reviewItemId] ?? ""}
                onChange={(event) => args.onFollowUpTitleChange(draft.reviewItemId, event.target.value)}
                placeholder="Follow-up title"
              />
              <button
                style={ghostButtonStyle}
                disabled={args.busy || !(args.followUpTitles[draft.reviewItemId] ?? "").trim()}
                onClick={() => args.onCreateFollowUp(draft.reviewItemId, args.followUpTitles[draft.reviewItemId] ?? "")}
              >
                Create follow-up
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function TaskControlPanel(args: {
  tasks: AaliyahTask[];
  busy: boolean;
  escalationNotes: Record<string, string>;
  followUpTitles: Record<string, string>;
  onEscalationNoteChange: (taskId: string, value: string) => void;
  onFollowUpTitleChange: (taskId: string, value: string) => void;
  onEscalate: (taskId: string) => void;
  onCreateFollowUp: (taskId: string, title: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Task Control</div>
      {args.tasks.length === 0 ? (
        <EmptyState text="No open tasks are active." />
      ) : (
        args.tasks.slice(0, 6).map((task) => (
          <div key={task.id} style={compactPanelStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 650 }}>{task.title}</div>
                <div style={{ marginTop: 4, fontSize: 13, color: tokens.colors.muted }}>
                  {task.nextStepSummary ?? task.description ?? "No next-step summary recorded."}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Tag label={task.status.replaceAll("_", " ")} tone="outline" />
                <Tag label={task.priority} tone={task.priority === "critical" ? "filled" : "outline"} />
              </div>
            </div>
            <textarea
              style={textAreaStyle}
              rows={2}
              placeholder="Escalation note"
              value={args.escalationNotes[task.id] ?? ""}
              onChange={(event) => args.onEscalationNoteChange(task.id, event.target.value)}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={primaryButtonStyle} disabled={args.busy} onClick={() => args.onEscalate(task.id)}>
                Escalate task
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                style={inputStyle}
                value={args.followUpTitles[task.id] ?? ""}
                onChange={(event) => args.onFollowUpTitleChange(task.id, event.target.value)}
                placeholder="Follow-up title"
              />
              <button
                style={ghostButtonStyle}
                disabled={args.busy || !(args.followUpTitles[task.id] ?? "").trim()}
                onClick={() => args.onCreateFollowUp(task.id, args.followUpTitles[task.id] ?? "")}
              >
                Create follow-up
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ScheduleOverridePanel(args: {
  tasks: AaliyahTask[];
  busy: boolean;
  taskScheduleReasons: Record<string, string>;
  taskScheduleTimes: Record<string, string>;
  calendarTargetId: string;
  calendarReason: string;
  onTaskReasonChange: (taskId: string, value: string) => void;
  onTaskTimeChange: (taskId: string, value: string) => void;
  onCalendarTargetIdChange: (value: string) => void;
  onCalendarReasonChange: (value: string) => void;
  onTaskOverride: (taskId: string) => void;
  onCalendarOverride: () => void;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Schedule Overrides</div>
      <div style={{ ...compactPanelStyle, borderColor: "#4DABF7" }}>
        <div style={{ fontWeight: 650 }}>Backend capability note</div>
        <div style={{ marginTop: 4, fontSize: 13, color: tokens.colors.muted }}>
          Task schedule overrides apply real backend changes. Calendar event overrides are recorded and audited, but live calendar mutation is not implemented yet.
        </div>
      </div>
      {args.tasks.slice(0, 3).map((task) => (
        <div key={task.id} style={compactPanelStyle}>
          <div style={{ fontWeight: 650 }}>{task.title}</div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              style={inputStyle}
              type="datetime-local"
              value={args.taskScheduleTimes[task.id] ?? ""}
              onChange={(event) => args.onTaskTimeChange(task.id, event.target.value)}
            />
            <input
              style={inputStyle}
              value={args.taskScheduleReasons[task.id] ?? ""}
              onChange={(event) => args.onTaskReasonChange(task.id, event.target.value)}
              placeholder="Override reason"
            />
            <button
              style={ghostButtonStyle}
              disabled={args.busy || !(args.taskScheduleReasons[task.id] ?? "").trim()}
              onClick={() => args.onTaskOverride(task.id)}
            >
              Override task schedule
            </button>
          </div>
        </div>
      ))}
      <div style={compactPanelStyle}>
        <div style={{ fontWeight: 650 }}>Record calendar event override</div>
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            style={inputStyle}
            value={args.calendarTargetId}
            onChange={(event) => args.onCalendarTargetIdChange(event.target.value)}
            placeholder="Calendar event ID"
          />
          <input
            style={inputStyle}
            value={args.calendarReason}
            onChange={(event) => args.onCalendarReasonChange(event.target.value)}
            placeholder="Founder override reason"
          />
          <button
            style={ghostButtonStyle}
            disabled={args.busy || !args.calendarTargetId.trim() || !args.calendarReason.trim()}
            onClick={args.onCalendarOverride}
          >
            Record override
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkflowTriggerPanel({
  busy,
  onTrigger,
}: {
  busy: boolean;
  onTrigger: (workflowName: "draft_follow_up" | "contact_revival" | "post_meeting_recap") => void;
}) {
  const workflows: Array<{ workflowName: "draft_follow_up" | "contact_revival" | "post_meeting_recap"; label: string; description: string }> = [
    {
      workflowName: "draft_follow_up",
      label: "Draft Follow-Up",
      description: "Create a governed follow-up task from an approved or in-flight draft."
    },
    {
      workflowName: "contact_revival",
      label: "Contact Revival",
      description: "Open a high-signal relationship reactivation follow-up."
    },
    {
      workflowName: "post_meeting_recap",
      label: "Post Meeting Recap",
      description: "Create the next action trail after a meeting or schedule decision."
    }
  ];

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Workflow Triggers</div>
      <div style={{ display: "grid", gap: 8 }}>
        {workflows.map((workflow) => (
          <button key={workflow.workflowName} style={actionButtonStyle} disabled={busy} onClick={() => onTrigger(workflow.workflowName)}>
            <span>
              <div>{workflow.label}</div>
              <div style={{ marginTop: 3, fontSize: 12, color: tokens.colors.muted }}>{workflow.description}</div>
            </span>
            <span style={{ fontSize: 12, color: tokens.colors.muted }}>Trigger</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CommandHistoryPanel({ commands }: { commands: FounderCommandRecord[] }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Command History</div>
      {commands.length === 0 ? (
        <EmptyState text="No founder commands have been recorded yet." />
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {commands.map((command) => (
            <div key={command.id} style={compactPanelStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 650 }}>{command.commandType.replaceAll("_", " ")}</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: tokens.colors.muted }}>{command.summary}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <Tag label={command.executionStatus} tone={command.executionStatus === "executed" ? "filled" : "outline"} />
                  <Tag label={command.targetType.replaceAll("_", " ")} tone="outline" />
                </div>
              </div>
              <div style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                <DataBlock label="Command ID" value={shortId(command.id)} />
                <DataBlock label="Target" value={shortId(command.targetId)} />
                <DataBlock label="Audit" value={shortId(command.auditEventId)} />
                <DataBlock label="Executed" value={new Date(command.executedAt ?? command.createdAt).toLocaleString()} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FollowThroughEnginePanel({ records }: { records: AaliyahFollowThroughEngineRecord[] }) {
  const suggested = records.filter((record) => record.decisionType === "create_task");
  const stale = records.filter((record) => record.status === "stale");
  const needsReview = records.filter((record) => record.status === "blocked" || record.decisionType === "queue_founder_review");

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Follow-Through Engine</div>
      {records.length === 0 ? (
        <EmptyState text="No follow-through records have been generated yet." />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
            <MetricMini label="Suggested next actions" value={suggested.length} />
            <MetricMini label="Stale items" value={stale.length} />
            <MetricMini label="Needs founder review" value={needsReview.length} />
            <MetricMini label="Total records" value={records.length} />
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {records.map((record) => (
              <div key={record.id} style={compactPanelStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 650 }}>{record.summary}</div>
                    <div style={{ marginTop: 4, fontSize: 13, color: tokens.colors.muted }}>{record.reason}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <Tag label={followThroughStatusLabel(record)} tone={followThroughTone(record)} />
                    <Tag label={record.policyKey} tone="outline" />
                    <Tag label={record.source.sourceType.replaceAll("_", " ")} tone="outline" />
                  </div>
                </div>
                <div style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                  <DataBlock label="Source" value={shortId(record.source.sourceId)} />
                  <DataBlock label="Created task" value={record.createdArtifactIds[0] ? shortId(record.createdArtifactIds[0]) : "None"} />
                  <DataBlock label="Audit" value={shortId(record.auditEventId)} />
                  <DataBlock label="Evaluated" value={new Date(record.evaluatedAtIso).toLocaleString()} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function followThroughStatusLabel(record: AaliyahFollowThroughEngineRecord) {
  if (record.decisionType === "create_task") {
    return "Created task";
  }
  if (record.status === "stale") {
    return "Flagged stale";
  }
  if (record.status === "blocked") {
    return "Needs review";
  }
  return "No action";
}

function followThroughTone(record: AaliyahFollowThroughEngineRecord): "filled" | "outline" {
  if (record.status === "blocked" || record.status === "stale") {
    return "filled";
  }
  return "outline";
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
      <span style={{ color: tokens.colors.muted }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function DataBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={miniFieldStyle}>
      <div style={{ fontSize: 11, color: tokens.colors.muted, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function StatusChip({ label, tone }: { label: string; tone: "ok" | "warn" | "danger" | "info" | "neutral" }) {
  const background =
    tone === "ok" ? "rgba(64,192,87,0.14)" :
      tone === "warn" ? "rgba(255,200,87,0.16)" :
        tone === "danger" ? "rgba(255,107,107,0.16)" :
          tone === "info" ? "rgba(116,192,252,0.18)" :
            "rgba(255,255,255,0.05)";
  const color =
    tone === "ok" ? "#8CE99A" :
      tone === "warn" ? "#FFD43B" :
        tone === "danger" ? "#FFA8A8" :
          tone === "info" ? "#A5D8FF" :
            tokens.colors.text;
  return (
    <div style={{ padding: "8px 10px", borderRadius: 999, background, color, fontSize: 12, fontWeight: 700 }}>
      {label}
    </div>
  );
}

function Tag({ label, tone = "filled" }: { label: string; tone?: "filled" | "outline" }) {
  return (
    <span
      style={{
        padding: "4px 8px",
        borderRadius: 999,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 0.3,
        border: `1px solid ${tokens.colors.border}`,
        background: tone === "filled" ? tokens.colors.panel : "transparent",
        color: tokens.colors.muted,
      }}
    >
      {label}
    </span>
  );
}

function recommendationActionLabel(recommendation: AaliyahRecommendationRecord) {
  switch (recommendation.recommendationType) {
    case "escalate_now":
      return "Escalate now";
    case "revive_contact":
      return "Revive contact";
    case "follow_up_now":
      return "Follow up now";
    case "schedule_next":
      return "Record next step";
    case "review_blocked":
    case "send_now":
      return "Advisory only";
    default:
      return "No action";
  }
}

function recommendationTone(type: AaliyahRecommendationRecord["recommendationType"]) {
  switch (type) {
    case "escalate_now":
    case "review_blocked":
      return "filled" as const;
    default:
      return "outline" as const;
  }
}

function RecommendationsPanel(args: {
  recommendations: AaliyahRecommendationRecord[];
  busy: boolean;
  onAct: (recommendation: AaliyahRecommendationRecord) => void;
}) {
  const actionable = args.recommendations.filter((recommendation) => !["noop", "send_now", "review_blocked"].includes(recommendation.recommendationType));

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Recommendations</div>
      {args.recommendations.length === 0 ? (
        <EmptyState text="No persisted founder recommendations are active." />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
            <MetricMini label="Actionable" value={actionable.length} />
            <MetricMini label="Blocked review" value={args.recommendations.filter((item) => item.recommendationType === "review_blocked").length} />
            <MetricMini label="Escalate now" value={args.recommendations.filter((item) => item.recommendationType === "escalate_now").length} />
            <MetricMini label="Total records" value={args.recommendations.length} />
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {args.recommendations.map((recommendation) => {
              const actionableNow = !["send_now", "noop", "review_blocked"].includes(recommendation.recommendationType);
              return (
                <div key={recommendation.id} style={compactPanelStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 650 }}>{recommendation.summary}</div>
                      <div style={{ marginTop: 4, fontSize: 13, color: tokens.colors.muted }}>{recommendation.reason}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <Tag label={recommendation.recommendationType.replaceAll("_", " ")} tone={recommendationTone(recommendation.recommendationType)} />
                      <Tag label={recommendation.status} tone="outline" />
                      <Tag label={recommendation.source.sourceType.replaceAll("_", " ")} tone="outline" />
                    </div>
                  </div>
                  <div style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                    <DataBlock label="Source" value={shortId(recommendation.source.sourceId)} />
                    <DataBlock label="Task" value={shortId(recommendation.relatedTaskId)} />
                    <DataBlock label="Command" value={shortId(recommendation.relatedCommandId)} />
                    <DataBlock label="Evaluated" value={new Date(recommendation.evaluatedAtIso).toLocaleString()} />
                  </div>
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      style={actionableNow ? primaryButtonStyle : ghostButtonStyle}
                      disabled={args.busy || !actionableNow}
                      onClick={() => args.onAct(recommendation)}
                    >
                      {recommendationActionLabel(recommendation)}
                    </button>
                    {!actionableNow ? (
                      <div style={{ alignSelf: "center", fontSize: 12, color: tokens.colors.muted }}>
                        Execution remains founder-command only. This recommendation is advisory for now.
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function notificationTone(severity: AaliyahNotificationRecord["severity"]) {
  switch (severity) {
    case "critical":
      return "filled" as const;
    case "warning":
      return "outline" as const;
    default:
      return "outline" as const;
  }
}

function NotificationsPanel(args: {
  notifications: AaliyahNotificationRecord[];
  deliveriesByNotificationId: Map<string, Partial<Record<AaliyahDeliveryRecord["channel"], AaliyahDeliveryRecord>>>;
  busy: boolean;
  onAcknowledge: (notificationId: string) => void;
  onDismiss: (notificationId: string) => void;
  onRetryDelivery: (deliveryId: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Notifications</div>
      {args.notifications.length === 0 ? (
        <EmptyState text="No active founder notifications are queued right now." />
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {args.notifications.map((notification) => {
            const deliveries = args.deliveriesByNotificationId.get(notification.id) ?? {};
            const consoleDelivery = deliveries.console ?? null;
            const emailDelivery = deliveries.email ?? null;

            return (
              <div key={notification.id} style={compactPanelStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 650 }}>{notification.title}</div>
                    <div style={{ marginTop: 4, fontSize: 13, color: tokens.colors.muted }}>{notification.summary}</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: tokens.colors.muted }}>{notification.reason}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <Tag label={notification.severity} tone={notificationTone(notification.severity)} />
                    <Tag label={notification.notificationType.replace(/_/g, " ")} tone="outline" />
                  </div>
                </div>
                <div style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                  <DataBlock label="Source" value={shortId(notification.source.sourceId)} />
                  <DataBlock label="Task" value={shortId(notification.relatedTaskId)} />
                  <DataBlock label="Recommendation" value={shortId(notification.relatedRecommendationId)} />
                  <DataBlock label="Created" value={new Date(notification.createdAtIso).toLocaleString()} />
                </div>
                <div style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                  <DataBlock label="Console delivery" value={consoleDelivery?.deliveryStatus ?? "not routed"} />
                  <DataBlock label="Email delivery" value={emailDelivery?.deliveryStatus ?? "not sent"} />
                  <DataBlock label="Email attempts" value={emailDelivery ? String(emailDelivery.attemptCount) : "0"} />
                  <DataBlock label="Last email error" value={emailDelivery?.lastError ?? "None"} />
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button style={primaryButtonStyle} disabled={args.busy} onClick={() => args.onAcknowledge(notification.id)}>
                    Acknowledge
                  </button>
                  <button style={ghostButtonStyle} disabled={args.busy} onClick={() => args.onDismiss(notification.id)}>
                    Dismiss
                  </button>
                  {emailDelivery?.deliveryStatus === "failed" ? (
                    <button style={ghostButtonStyle} disabled={args.busy} onClick={() => args.onRetryDelivery(emailDelivery.id)}>
                      Retry email
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DigestsPanel(args: {
  digests: AaliyahDigestRecord[];
  busy: boolean;
  onCompose: (digestType: AaliyahDigestRecord["digestType"]) => void;
  onSend: (digestId: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700 }}>Digests</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={ghostButtonStyle} disabled={args.busy} onClick={() => args.onCompose("daily_founder_digest")}>
            Compose daily
          </button>
          <button style={ghostButtonStyle} disabled={args.busy} onClick={() => args.onCompose("weekly_founder_brief")}>
            Compose weekly
          </button>
          <button style={ghostButtonStyle} disabled={args.busy} onClick={() => args.onCompose("critical_digest")}>
            Compose critical
          </button>
        </div>
      </div>
      {args.digests.length === 0 ? (
        <EmptyState text="No digests have been composed yet." />
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {args.digests.map((digest) => (
            <div key={digest.id} style={compactPanelStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 650 }}>{digest.title}</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: tokens.colors.muted }}>{digest.summary}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <Tag label={digest.digestType.replace(/_/g, " ")} tone="outline" />
                  <Tag label={digest.digestStatus} tone={digest.digestStatus === "sent" ? "filled" : "outline"} />
                </div>
              </div>
              <div style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                <DataBlock label="Composed" value={new Date(digest.composedAtIso).toLocaleString()} />
                <DataBlock label="Sent" value={digest.sentAtIso ? new Date(digest.sentAtIso).toLocaleString() : "Not sent"} />
                <DataBlock label="Deliveries" value={String(digest.deliveryRecordIds.length)} />
              </div>
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", color: tokens.colors.muted }}>View digest body</summary>
                <pre style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: 12 }}>{digest.bodyText}</pre>
              </details>
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  style={primaryButtonStyle}
                  disabled={args.busy || digest.digestStatus === "sent" || digest.digestStatus === "skipped"}
                  onClick={() => args.onSend(digest.id)}
                >
                  {digest.digestStatus === "sent" ? "Sent" : "Send"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function opportunityActionLabel(opportunity: AaliyahOpportunityRecord) {
  switch (opportunity.opportunityType) {
    case "dormant_contact":
      return "Create follow-up";
    case "stalled_pipeline":
      return "Unblock now";
    case "missed_follow_up_window":
      return "Schedule next";
    case "engagement_spike":
      return "Reach out";
    case "recurring_block_pattern":
      return "Escalate";
    case "noop":
    default:
      return "Advisory";
  }
}

function opportunityTone(type: AaliyahOpportunityRecord["opportunityType"]) {
  switch (type) {
    case "recurring_block_pattern":
    case "stalled_pipeline":
      return "filled" as const;
    default:
      return "outline" as const;
  }
}

function OpportunitiesPanel(args: {
  opportunities: AaliyahOpportunityRecord[];
  busy: boolean;
  onAct: (opportunity: AaliyahOpportunityRecord) => void;
  onAcknowledge: (opportunityId: string) => void;
  onDismiss: (opportunityId: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Opportunities</div>
      {args.opportunities.length === 0 ? (
        <EmptyState text="No active opportunities are persisted right now." />
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {args.opportunities.map((opportunity) => (
            <div key={opportunity.id} style={compactPanelStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 650 }}>{opportunity.summary}</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: tokens.colors.muted }}>{opportunity.reason}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <Tag label={opportunity.opportunityType.replaceAll("_", " ")} tone={opportunityTone(opportunity.opportunityType)} />
                  <Tag label={opportunity.status} tone="outline" />
                  <Tag label={opportunity.source.sourceType.replaceAll("_", " ")} tone="outline" />
                </div>
              </div>
              <div style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                <DataBlock label="Source" value={shortId(opportunity.source.sourceId)} />
                <DataBlock label="Task" value={shortId(opportunity.relatedTaskId)} />
                <DataBlock label="Recommendation" value={shortId(opportunity.relatedRecommendationId)} />
                <DataBlock label="Evaluated" value={new Date(opportunity.evaluatedAtIso).toLocaleString()} />
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={primaryButtonStyle} disabled={args.busy || opportunity.opportunityType === "noop"} onClick={() => args.onAct(opportunity)}>
                  {opportunityActionLabel(opportunity)}
                </button>
                <button style={ghostButtonStyle} disabled={args.busy} onClick={() => args.onAcknowledge(opportunity.id)}>
                  Acknowledge
                </button>
                <button style={ghostButtonStyle} disabled={args.busy} onClick={() => args.onDismiss(opportunity.id)}>
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function strategicInsightTone(type: AaliyahStrategicInsightRecord["insightType"]) {
  switch (type) {
    case "attention_priority":
    case "execution_bottleneck":
      return "filled" as const;
    default:
      return "outline" as const;
  }
}

function StrategicIntelligencePanel(args: {
  insights: AaliyahStrategicInsightRecord[];
  busy: boolean;
  onAcknowledge: (insightId: string) => void;
  onDismiss: (insightId: string) => void;
}) {
  const topPriorities = args.insights.filter((item) => item.insightType === "attention_priority").length;
  const bottlenecks = args.insights.filter((item) => item.insightType === "execution_bottleneck").length;
  const clusters = args.insights.filter((item) => item.insightType === "opportunity_cluster").length;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Strategic Intelligence</div>
      {args.insights.length === 0 ? (
        <EmptyState text="No strategic intelligence records are persisted right now." />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
            <MetricMini label="Top priorities" value={topPriorities} />
            <MetricMini label="Bottlenecks" value={bottlenecks} />
            <MetricMini label="Clusters" value={clusters} />
            <MetricMini label="Total records" value={args.insights.length} />
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {args.insights.map((insight) => (
              <div key={insight.id} style={compactPanelStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 650 }}>{insight.title}</div>
                    <div style={{ marginTop: 4, fontSize: 13, color: tokens.colors.muted }}>{insight.summary}</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: tokens.colors.muted }}>{insight.reason}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <Tag label={insight.insightType.replaceAll("_", " ")} tone={strategicInsightTone(insight.insightType)} />
                    <Tag label={insight.status} tone="outline" />
                  </div>
                </div>
                <div style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                  <DataBlock label="Entities" value={insight.relatedEntityIds.length ? insight.relatedEntityIds.map(shortId).join(", ") : "None"} />
                  <DataBlock label="Records" value={String(insight.relatedRecordIds.length)} />
                  <DataBlock label="Evaluated" value={new Date(insight.evaluatedAtIso).toLocaleString()} />
                  <DataBlock label="Created" value={new Date(insight.createdAtIso).toLocaleString()} />
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button style={primaryButtonStyle} disabled={args.busy} onClick={() => args.onAcknowledge(insight.id)}>
                    Acknowledge
                  </button>
                  <button style={ghostButtonStyle} disabled={args.busy} onClick={() => args.onDismiss(insight.id)}>
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EvaluationSchedulerPanel(args: {
  schedules: AaliyahEvaluationScheduleRecord[];
  runs: AaliyahEvaluationRunRecord[];
  busy: boolean;
  engineType: AaliyahEvaluationScheduleRecord["engineType"];
  cadenceType: AaliyahEvaluationScheduleRecord["cadenceType"];
  cadenceValue: string;
  onEngineTypeChange: (value: AaliyahEvaluationScheduleRecord["engineType"]) => void;
  onCadenceTypeChange: (value: AaliyahEvaluationScheduleRecord["cadenceType"]) => void;
  onCadenceValueChange: (value: string) => void;
  onSave: () => void;
  onPause: (scheduleId: string) => void;
  onResume: (scheduleId: string) => void;
  onRunNow: (scheduleId: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Cadence / Scheduler</div>
      <div style={compactPanelStyle}>
        <div style={{ fontWeight: 650 }}>Control the clock</div>
        <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select style={inputStyle} value={args.engineType} onChange={(event) => args.onEngineTypeChange(event.target.value as AaliyahEvaluationScheduleRecord["engineType"])}>
            <option value="follow_through">Follow through</option>
            <option value="recommendation">Recommendation</option>
            <option value="notification">Notification</option>
            <option value="opportunity">Opportunity</option>
            <option value="strategic_intelligence">Strategic intelligence</option>
          </select>
          <select style={inputStyle} value={args.cadenceType} onChange={(event) => args.onCadenceTypeChange(event.target.value as AaliyahEvaluationScheduleRecord["cadenceType"])}>
            <option value="manual">Manual</option>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
          <input
            style={inputStyle}
            value={args.cadenceValue}
            onChange={(event) => args.onCadenceValueChange(event.target.value)}
            placeholder={args.cadenceType === "hourly" ? "1" : args.cadenceType === "daily" ? "09:00" : "MON@09:00"}
            disabled={args.cadenceType === "manual"}
          />
          <button style={primaryButtonStyle} disabled={args.busy} onClick={args.onSave}>
            Save cadence
          </button>
        </div>
      </div>
      {args.schedules.length === 0 ? (
        <EmptyState text="No evaluation cadences are persisted yet." />
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {args.schedules.map((schedule) => (
            <div key={schedule.id} style={compactPanelStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 650 }}>{schedule.engineType.replaceAll("_", " ")}</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: tokens.colors.muted }}>
                    {schedule.cadenceType === "manual" ? "Manual only" : `${schedule.cadenceType} cadence${schedule.cadenceValue ? ` (${schedule.cadenceValue})` : ""}`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Tag label={schedule.status} tone={schedule.status === "active" ? "filled" : "outline"} />
                  <Tag label={schedule.engineType.replaceAll("_", " ")} tone="outline" />
                </div>
              </div>
              <div style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                <DataBlock label="Last run" value={schedule.lastRunAtIso ? new Date(schedule.lastRunAtIso).toLocaleString() : "Never"} />
                <DataBlock label="Next run" value={schedule.nextRunAtIso ? new Date(schedule.nextRunAtIso).toLocaleString() : "Manual"} />
                <DataBlock label="Schedule ID" value={shortId(schedule.id)} />
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={primaryButtonStyle} disabled={args.busy} onClick={() => args.onRunNow(schedule.id)}>
                  Run now
                </button>
                {schedule.status === "active" ? (
                  <button style={ghostButtonStyle} disabled={args.busy} onClick={() => args.onPause(schedule.id)}>
                    Pause
                  </button>
                ) : (
                  <button style={ghostButtonStyle} disabled={args.busy} onClick={() => args.onResume(schedule.id)}>
                    Resume
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 650 }}>Recent evaluation runs</div>
        {args.runs.length === 0 ? (
          <EmptyState text="No scheduler runs have been recorded yet." />
        ) : (
          args.runs.map((run) => (
            <div key={run.id} style={compactPanelStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 650 }}>{run.engineType.replaceAll("_", " ")}</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: tokens.colors.muted }}>{run.summary}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Tag label={run.runStatus} tone={run.runStatus === "failed" ? "filled" : "outline"} />
                </div>
              </div>
              <div style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                <DataBlock label="Window" value={run.windowKey} />
                <DataBlock label="Started" value={new Date(run.startedAtIso).toLocaleString()} />
                <DataBlock label="Completed" value={run.completedAtIso ? new Date(run.completedAtIso).toLocaleString() : "Running"} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function FounderPreferencesControlsPanel(args: {
  preferences: AaliyahFounderPreferenceControlsRecord | null;
  busy: boolean;
  onChange: (value: AaliyahFounderPreferenceControlsRecord) => void;
  onSave: () => void;
}) {
  if (!args.preferences) {
    return <EmptyState text="Founder preference controls are loading." />;
  }

  const preferences = args.preferences;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Preference Controls</div>
      <div style={compactPanelStyle}>
        <div style={{ fontWeight: 650 }}>Notification and delivery thresholds</div>
        <div style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label style={fieldLabelStyle}>
            <span>Console severity</span>
            <select
              style={inputStyle}
              value={preferences.notification.minimumConsoleSeverity}
              onChange={(event) => args.onChange({
                ...preferences,
                notification: {
                  ...preferences.notification,
                  minimumConsoleSeverity: event.target.value as AaliyahFounderPreferenceControlsRecord["notification"]["minimumConsoleSeverity"]
                }
              })}
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label style={fieldLabelStyle}>
            <span>Email severity</span>
            <select
              style={inputStyle}
              value={preferences.notification.minimumEmailSeverity}
              onChange={(event) => args.onChange({
                ...preferences,
                notification: {
                  ...preferences.notification,
                  minimumEmailSeverity: event.target.value as AaliyahFounderPreferenceControlsRecord["notification"]["minimumEmailSeverity"]
                }
              })}
            >
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label style={fieldLabelStyle}>
            <span>Email enabled</span>
            <input
              type="checkbox"
              checked={preferences.delivery.emailEnabled}
              onChange={(event) => args.onChange({
                ...preferences,
                delivery: { ...preferences.delivery, emailEnabled: event.target.checked }
              })}
            />
          </label>
          <label style={fieldLabelStyle}>
            <span>Console enabled</span>
            <input
              type="checkbox"
              checked={preferences.delivery.consoleEnabled}
              onChange={(event) => args.onChange({
                ...preferences,
                delivery: { ...preferences.delivery, consoleEnabled: event.target.checked }
              })}
            />
          </label>
        </div>
      </div>

      <div style={compactPanelStyle}>
        <div style={{ fontWeight: 650 }}>Digest and scheduler controls</div>
        <div style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label style={fieldLabelStyle}><span>Daily digest</span><input type="checkbox" checked={preferences.digest.dailyDigestEnabled} onChange={(event) => args.onChange({ ...preferences, digest: { ...preferences.digest, dailyDigestEnabled: event.target.checked } })} /></label>
          <label style={fieldLabelStyle}><span>Weekly brief</span><input type="checkbox" checked={preferences.digest.weeklyBriefEnabled} onChange={(event) => args.onChange({ ...preferences, digest: { ...preferences.digest, weeklyBriefEnabled: event.target.checked } })} /></label>
          <label style={fieldLabelStyle}><span>Critical digest</span><input type="checkbox" checked={preferences.digest.criticalDigestEnabled} onChange={(event) => args.onChange({ ...preferences, digest: { ...preferences.digest, criticalDigestEnabled: event.target.checked } })} /></label>
          <label style={fieldLabelStyle}><span>Automatic runs</span><input type="checkbox" checked={preferences.scheduler.allowAutomaticRuns} onChange={(event) => args.onChange({ ...preferences, scheduler: { ...preferences.scheduler, allowAutomaticRuns: event.target.checked } })} /></label>
        </div>
      </div>

      <div style={compactPanelStyle}>
        <div style={{ fontWeight: 650 }}>Opportunity thresholds</div>
        <div style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label style={fieldLabelStyle}>
            <span>Dormant contact days</span>
            <input
              type="number"
              style={inputStyle}
              value={preferences.opportunity.dormantContactDays}
              onChange={(event) => args.onChange({
                ...preferences,
                opportunity: { ...preferences.opportunity, dormantContactDays: Number(event.target.value || 0) }
              })}
            />
          </label>
          <label style={fieldLabelStyle}>
            <span>Missed follow-up hours</span>
            <input
              type="number"
              style={inputStyle}
              value={preferences.opportunity.missedFollowUpWindowHours}
              onChange={(event) => args.onChange({
                ...preferences,
                opportunity: { ...preferences.opportunity, missedFollowUpWindowHours: Number(event.target.value || 0) }
              })}
            />
          </label>
          <label style={fieldLabelStyle}>
            <span>Recurring block threshold</span>
            <input
              type="number"
              style={inputStyle}
              value={preferences.opportunity.recurringBlockThreshold}
              onChange={(event) => args.onChange({
                ...preferences,
                opportunity: { ...preferences.opportunity, recurringBlockThreshold: Number(event.target.value || 0) }
              })}
            />
          </label>
        </div>
      </div>

      <button style={primaryButtonStyle} disabled={args.busy} onClick={args.onSave}>
        Save preference controls
      </button>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div style={{ color: tokens.colors.muted, fontSize: 13 }}>{text}</div>;
}

function ErrorState({ message }: { message: string }) {
  return (
    <div style={{ ...panelStyle, borderColor: "#C92A2A" }}>
      <div style={{ fontWeight: 650 }}>Failed to load Aaliyah</div>
      <div style={{ marginTop: 6, color: "#FF8787", fontSize: 13 }}>{message}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={heroStyle}>
        <div>
          <div style={{ fontSize: 12, color: tokens.colors.muted, textTransform: "uppercase" }}>Founder operating console</div>
          <div style={{ marginTop: 8, fontSize: 26, fontWeight: 750 }}>Loading Aaliyah...</div>
        </div>
      </div>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <MetricTile label="What Matters" value="..." accent />
        <MetricTile label="Open Approvals" value="..." />
        <MetricTile label="Interrupt Now" value="..." />
        <MetricTile label="Founder Queue" value="..." />
      </div>
    </div>
  );
}

function ModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      style={{
        borderRadius: 999,
        border: `1px solid ${active ? tokens.colors.gold : tokens.colors.border}`,
        background: active ? "rgba(230,193,90,0.18)" : tokens.colors.surface,
        color: tokens.colors.text,
        padding: "10px 12px",
        cursor: "pointer",
        fontWeight: 650,
      }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function MetricMini({ label, value }: { label: string; value: number }) {
  return (
    <div style={compactPanelStyle}>
      <div style={{ fontSize: 12, color: tokens.colors.muted }}>{label}</div>
      <div style={{ marginTop: 4, fontWeight: 750, fontSize: 22 }}>{value}</div>
    </div>
  );
}

function actionLabel(action: string) {
  switch (action) {
    case "open_review_item":
      return "Focus item";
    case "approve_review_item":
      return "Approve";
    case "reject_review_item":
      return "Reject";
    case "request_review_revision":
      return "Request revision";
    case "dispatch_approved_email":
      return "Dispatch";
    case "open_voice_escalation":
      return "Open voice";
    case "open_incident":
      return "Open incident";
    case "refresh_founder_briefing":
      return "Refresh briefing";
    default:
      return action;
  }
}

const heroStyle: React.CSSProperties = {
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: 22,
  background: "linear-gradient(135deg, rgba(230,193,90,0.14), rgba(18,18,24,0.94))",
  padding: 20,
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
};

const heroMetaStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
};

const panelStyle: React.CSSProperties = {
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: 18,
  background: tokens.colors.surface,
  padding: 16,
};

const compactPanelStyle: React.CSSProperties = {
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: 14,
  background: tokens.colors.panel,
  padding: 12,
};

const miniFieldStyle: React.CSSProperties = {
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: 12,
  background: tokens.colors.surface,
  padding: 10,
};

const ghostButtonStyle: React.CSSProperties = {
  borderRadius: 14,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.surface,
  color: tokens.colors.text,
  padding: "10px 12px",
  cursor: "pointer",
  fontWeight: 650,
};

const primaryButtonStyle: React.CSSProperties = {
  ...ghostButtonStyle,
  background: "rgba(230,193,90,0.18)",
  border: `1px solid ${tokens.colors.gold}`,
};

const chipButtonStyle: React.CSSProperties = {
  borderRadius: 999,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.panel,
  color: tokens.colors.text,
  padding: "8px 10px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 650,
};

const actionButtonStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  borderRadius: 14,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.panel,
  color: tokens.colors.text,
  padding: "12px 14px",
  cursor: "pointer",
  fontWeight: 650,
};

const inputStyle: React.CSSProperties = {
  minWidth: 180,
  flex: 1,
  borderRadius: 12,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.surface,
  color: tokens.colors.text,
  padding: "10px 12px",
};

const fieldLabelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  color: tokens.colors.muted
};

const textAreaStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.surface,
  color: tokens.colors.text,
  padding: "10px 12px",
  resize: "vertical",
  minHeight: 72,
};
