/** EmDash publishes scheduled entries and runs maintenance from this every-minute tick. */
export const EMDASH_CRON = "* * * * *";

/** Daily backup (10:17 UTC, off the hour to avoid the top-of-hour rush). */
export const BACKUP_CRON = "17 10 * * *";
