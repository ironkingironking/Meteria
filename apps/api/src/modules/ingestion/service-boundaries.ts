export type RawEventReprocessRequest = {
  tenantId: string;
  rawEventIds: string[];
  requestedByUserId: string;
  reason?: string;
  correlationId?: string;
};

export type RawEventReprocessResult = {
  queuedCount: number;
  strategy: "noop";
  note: string;
};

export interface RawEventReprocessingPort {
  requestReprocess(input: RawEventReprocessRequest): Promise<RawEventReprocessResult>;
}

class NoopRawEventReprocessingPort implements RawEventReprocessingPort {
  async requestReprocess(input: RawEventReprocessRequest): Promise<RawEventReprocessResult> {
    return {
      queuedCount: input.rawEventIds.length,
      strategy: "noop",
      note: "TODO: wire worker queue for raw-event reprocessing"
    };
  }
}

export function buildRawEventReprocessingPort(): RawEventReprocessingPort {
  return new NoopRawEventReprocessingPort();
}

