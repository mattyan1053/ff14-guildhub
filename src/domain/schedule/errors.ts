export class ScheduleValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(
      `Invalid schedule input:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`,
    );
    this.name = "ScheduleValidationError";
    this.issues = issues;
  }
}
