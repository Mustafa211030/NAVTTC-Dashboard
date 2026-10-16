/**
 * ECharts, trimmed to what the dashboard draws.
 *
 * Importing "echarts" pulls in every chart type and component (~1 MB min),
 * which is slow to compile in `next dev` and heavy in the browser. This file
 * registers only the pieces the modules use. If a new chart type or option
 * block (e.g. `markArea`, `pie`) is added, register it here too — ECharts
 * silently skips unregistered components in production builds.
 */
import * as echarts from "echarts/core";
import {
  BarChart, LineChart, ScatterChart, EffectScatterChart, HeatmapChart, RadarChart,
  BoxplotChart, MapChart, SankeyChart, TreemapChart,
} from "echarts/charts";
import {
  GridComponent, TooltipComponent, LegendComponent, TitleComponent, VisualMapComponent,
  DataZoomComponent, MarkLineComponent, GeoComponent, RadarComponent, AxisPointerComponent,
} from "echarts/components";
import { SVGRenderer, CanvasRenderer } from "echarts/renderers";
import { LabelLayout } from "echarts/features";

echarts.use([
  BarChart, LineChart, ScatterChart, EffectScatterChart, HeatmapChart, RadarChart,
  BoxplotChart, MapChart, SankeyChart, TreemapChart,
  GridComponent, TooltipComponent, LegendComponent, TitleComponent, VisualMapComponent,
  DataZoomComponent, MarkLineComponent, GeoComponent, RadarComponent, AxisPointerComponent,
  SVGRenderer, CanvasRenderer, LabelLayout,
]);

export const { init, registerMap } = echarts;
export default echarts;
