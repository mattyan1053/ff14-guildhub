import type { ScheduleRepository } from "./ports/scheduleRepository.js";

export interface AttachScheduleMessageDeps {
  repository: ScheduleRepository;
}

export function makeAttachScheduleMessage(
  deps: AttachScheduleMessageDeps,
): (input: {
  eventId: string;
  channelId: string;
  messageId: string;
}) => Promise<void> {
  return async (input) => {
    await deps.repository.attachMessage(
      input.eventId,
      input.channelId,
      input.messageId,
    );
  };
}
