import {
  selectOldestExpiredRecord,
  type RetentionRecord,
} from "../lib/retention.ts";

type ConfirmationContext = {
  hasUI: boolean;
  ui: {
    confirm: (title: string, message: string) => Promise<boolean>;
  };
};

export async function requestOldestExpiredCandidateConfirmation(
  records: RetentionRecord[],
  ctx: ConfirmationContext,
  title: string,
  message: (candidate: RetentionRecord) => string,
) {
  const candidate = selectOldestExpiredRecord(records);
  if (!candidate || !ctx.hasUI) return { candidate, confirmed: false };

  const confirmed = await ctx.ui.confirm(title, message(candidate));
  return { candidate, confirmed };
}
