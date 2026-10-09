// Phase 21A.1 — the ADVANCED chart engine chunk (radar, boxplot, heatmap + the radar coordinate system and the continuous colour scale).
// Registered into the same engine core on demand: a chart of a common kind never downloads it.
import { use as registerModules } from "echarts/core";
import { BoxplotChart, HeatmapChart, RadarChart } from "echarts/charts";
import { RadarComponent, VisualMapContinuousComponent } from "echarts/components";

registerModules([RadarChart, BoxplotChart, HeatmapChart, RadarComponent, VisualMapContinuousComponent]);
export const CHART_ADVANCED_MARKER = "xp-chart-advanced-v1";
