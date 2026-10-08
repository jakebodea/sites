/** Preview publishing ticks must be requested explicitly; backups are prod-only. */
export const cmsCrons = ({
  production,
  publishCron,
  backupCron,
  previewScheduledPublishing,
}: {
  readonly production: boolean;
  readonly publishCron: string;
  readonly backupCron: string;
  readonly previewScheduledPublishing: boolean;
}): string[] => {
  if (production) {
    return [publishCron, backupCron];
  }
  return previewScheduledPublishing ? [publishCron] : [];
};
