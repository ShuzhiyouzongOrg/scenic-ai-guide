/**
 * @fileoverview 按需注册项目使用的 ECharts 图表、组件和渲染器。
 * @description 集中导出 ECharts 实例、配置类型与图形工具，控制前端包体积。
 */

/**
 * @description ECharts 插件配置
 *
 * 按需导入 ECharts 图表和组件，减小打包体积。
 * 只注册项目中实际使用的图表类型和组件。
 *
 * @module plugins/echarts
 *
 */

// ECharts 按需导入配置
import * as echarts from 'echarts/core'

// 导入图表类型
import {
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  RadarChart,
  MapChart,
  CandlestickChart
} from 'echarts/charts'

// 导入组件
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
  MarkPointComponent,
  MarkLineComponent,
  ToolboxComponent,
  BrushComponent,
  GeoComponent,
  VisualMapComponent
} from 'echarts/components'

// 导入渲染器
import { CanvasRenderer } from 'echarts/renderers'

// 注册必要的组件
echarts.use([
  // 图表类型
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  RadarChart,
  MapChart,
  CandlestickChart,

  // 组件
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
  MarkPointComponent,
  MarkLineComponent,
  ToolboxComponent,
  BrushComponent,
  GeoComponent,
  VisualMapComponent,

  // 渲染器
  CanvasRenderer
])

/**
 * @description 导出已按需注册图表、组件和 Canvas 渲染器的 ECharts 核心实例。
 * @see echarts
 */
export { echarts }
/**
 * @description 重导出项目常用的 ECharts 通用配置与柱状图系列类型。
 * @see EChartsOption
 * @see BarSeriesOption
 */
export type { EChartsOption, BarSeriesOption } from 'echarts'

/**
 * @description 导出 ECharts 图形元素与渐变等构造工具。
 * @type {typeof echarts.graphic}
 */
export const graphic = echarts.graphic
