import type { NormalizedVoiceCall, VoiceIntakePayload } from "./types.js";

export class VoiceIntakeValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class VoiceIntakeService {
  normalize(payload: VoiceIntakePayload): NormalizedVoiceCall {
    const sourceSystem = payload.sourceSystem?.trim();
    const phoneNumber = payload.caller.phoneNumber?.trim();
    const transcript = payload.transcript?.trim();

    if (!sourceSystem) {
      throw new VoiceIntakeValidationError("voice_intake_missing_source_system");
    }
    if (!phoneNumber) {
      throw new VoiceIntakeValidationError("voice_intake_missing_phone_number");
    }
    if (!transcript) {
      throw new VoiceIntakeValidationError("voice_intake_missing_transcript");
    }
    if (payload.durationSeconds !== undefined && payload.durationSeconds !== null && payload.durationSeconds < 0) {
      throw new VoiceIntakeValidationError("voice_intake_invalid_duration");
    }

    return {
      externalCallId: payload.externalCallId?.trim() || null,
      sourceSystem,
      receivedAt: payload.receivedAt ?? new Date().toISOString(),
      caller: {
        phoneNumber,
        displayName: payload.caller.displayName?.trim() || null,
        organizationName: payload.caller.organizationName?.trim() || null
      },
      transcript,
      callSummary: payload.callSummary?.trim() || null,
      durationSeconds: payload.durationSeconds ?? null
    };
  }
}
