export type ReportSummaryMetric = {
  label: string;
  value: string | number;
};

export type ToolReportSummary = {
  toolSlug: string;
  title: string;
  metrics: ReportSummaryMetric[];
};
