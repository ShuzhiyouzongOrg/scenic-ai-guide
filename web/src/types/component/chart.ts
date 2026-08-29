/**
 * @fileoverview 图表组件类型定义。
 * @description 声明 ECharts 图表主题、数据项、组件属性、事件回调和错误结构。
 */
import type { EChartsOption } from '@/plugins/echarts'

// 图例位置类型
/**
 * @description 定义图例在图表中的位置。
 * @typedef {'bottom' | 'top' | 'left' | 'right'} LegendPosition
 */
export type LegendPosition = 'bottom' | 'top' | 'left' | 'right'

/**
 * @description 定义 ECharts 数据点符号。
 * @typedef {| 'circle' | 'rect' | 'roundRect' | 'triangle' | 'diamond' | 'pin' | 'arrow' | 'none'} SymbolType
 */
export type SymbolType =
  | 'circle'
  | 'rect'
  | 'roundRect'
  | 'triangle'
  | 'diamond'
  | 'pin'
  | 'arrow'
  | 'none'

// 图表主题配置
/**
 * @description 描述图表高度、字体和主题颜色。
 * @typedef {object} ChartThemeConfig
 * @property {string} chartHeight 图表高度。
 * @property {number} fontSize 字体大小。
 * @property {string} fontColor 字体颜色。
 * @property {string} themeColor 主题颜色。
 * @property {string[]} colors 图表颜色组。
 */
export interface ChartThemeConfig {
  /**
   * @description 图表高度
   */
  chartHeight: string
  /**
   * @description 字体大小
   */
  fontSize: number
  /**
   * @description 字体颜色
   */
  fontColor: string
  /**
   * @description 主题颜色
   */
  themeColor: string
  /**
   * @description 颜色组
   */
  colors: string[]
}

// 图表初始化选项
/**
 * @description 描述图表初始化、延迟、观察阈值和主题响应选项。
 * @typedef {object} UseChartOptions
 * @property {EChartsOption} [initOptions] ECharts 初始化配置。
 * @property {number} [initDelay] 延迟初始化毫秒数。
 * @property {number} [threshold] 可见性观察阈值。
 * @property {boolean} [autoTheme] 是否跟随系统主题。
 */
export interface UseChartOptions {
  /**
   * @description 初始化选项
   */
  initOptions?: EChartsOption
  /**
   * @description 延迟初始化时间(ms)
   */
  initDelay?: number
  /**
   * @description IntersectionObserver阈值
   */
  threshold?: number
  /**
   * @description 是否自动响应主题变化
   */
  autoTheme?: boolean
}

// 基础图表 Props 接口 - 统一所有图表的基础属性
/**
 * @description 描述全部图表组件共用的基础属性。
 * @typedef {object} BaseChartProps
 * @property {string} [height] 高度。
 * @property {boolean} [loading] 是否加载中。
 * @property {boolean} [isEmpty] 数据是否为空。
 * @property {string[]} [colors] 图表颜色组。
 */
export interface BaseChartProps {
  /**
   * @description 图表高度
   */
  height?: string
  /**
   * @description 是否加载中
   */
  loading?: boolean
  isEmpty?: boolean
  /**
   * @description 颜色配置
   */
  colors?: string[]
}

// 轴线显示控制接口 - 统一轴线相关配置
/**
 * @description 描述坐标轴标签、轴线和分割线显示选项。
 * @typedef {object} AxisDisplayProps
 * @property {boolean} [showAxisLabel] 是否显示坐标轴标签。
 * @property {boolean} [showAxisLine] 是否显示坐标轴线。
 * @property {boolean} [showSplitLine] 是否显示分割线。
 */
export interface AxisDisplayProps {
  /**
   * @description 是否显示坐标轴标签
   */
  showAxisLabel?: boolean
  /**
   * @description 是否显示坐标轴线
   */
  showAxisLine?: boolean
  /**
   * @description 是否显示分割线
   */
  showSplitLine?: boolean
}

// 交互显示控制接口 - 统一交互相关配置
/**
 * @description 描述提示框和图例交互显示选项。
 * @typedef {object} InteractionProps
 * @property {boolean} [showTooltip] 是否显示提示框。
 * @property {boolean} [showLegend] 是否显示图例。
 * @property {LegendPosition} [legendPosition] 图例位置。
 */
export interface InteractionProps {
  /**
   * @description 是否显示提示框
   */
  showTooltip?: boolean
  /**
   * @description 是否显示图例
   */
  showLegend?: boolean
  /**
   * @description 图例位置
   */
  legendPosition?: LegendPosition
}

// 柱状图数据项接口
/**
 * @description 描述一组柱状图系列数据。
 * @typedef {object} BarDataItem
 * @property {string} name 名称。
 * @property {number[]} data 柱状图系列数值。
 * @property {string | number} [barWidth] 柱体宽度。
 * @property {string} [stack] 堆叠分组或状态。
 */
export interface BarDataItem {
  /**
   * @description 系列名称
   */
  name: string
  /**
   * @description 数据值
   */
  data: number[]
  /**
   * @description 柱状图宽度
   */
  barWidth?: string | number
  /**
   * @description 堆叠分组名称
   */
  stack?: string
}

// 柱状图 Props 接口 - 统一柱状图配置
/**
 * @description 描述柱状图组件数据、坐标轴和样式属性。
 * @typedef {object} BarChartProps
 * @property {number[] | BarDataItem[]} data 单组数值或多组柱状图系列。
 * @property {string[]} [xAxisData] 横轴标签数据。
 * @property {string | number} [barWidth] 柱体宽度。
 * @property {boolean} [stack] 堆叠分组或状态。
 * @property {number | number[]} [borderRadius] 圆角配置。
 */
export interface BarChartProps extends BaseChartProps, AxisDisplayProps, InteractionProps {
  /**
   * @description 图表数据 - 支持单组数据或多组数据
   */
  data: number[] | BarDataItem[]
  /**
   * @description X轴标签数据
   */
  xAxisData?: string[]
  /**
   * @description 柱状图宽度
   */
  barWidth?: string | number
  /**
   * @description 是否堆叠显示
   */
  stack?: boolean
  /**
   * @description 圆角
   */
  borderRadius?: number | number[]
}

// 折线图数据项接口
/**
 * @description 描述一组折线图系列数据与线面样式。
 * @typedef {object} LineDataItem
 * @property {string} name 名称。
 * @property {number[]} data 折线图系列数值。
 * @property {number} [lineWidth] 线条宽度。
 * @property {boolean} [showAreaColor] 是否显示区域填充。
 * @property {{ /** 渐变开始透明度 * / startOpacity?: number /** 渐变结束透明度 * / endOpacity?: number /** 自定义 ECharts areaStyle 配置 * / custom?: any }} [areaStyle] 区域填充样式。
 * @property {number} [areaStyle.startOpacity] 区域渐变起始透明度。
 * @property {number} [areaStyle.endOpacity] 区域渐变结束透明度。
 * @property {any} [areaStyle.custom] 透传给 ECharts 的自定义区域样式。
 * @property {boolean} [smooth] 是否平滑折线。
 * @property {SymbolType} [symbol] 数据点符号。
 * @property {number} [symbolSize] 数据点大小。
 */
export interface LineDataItem {
  /**
   * @description 系列名称
   */
  name: string
  /**
   * @description 数据值
   */
  data: number[]
  /**
   * @description 线条宽度
   */
  lineWidth?: number
  /**
   * @description 是否显示区域填充
   */
  showAreaColor?: boolean
  /**
   * @description 区域样式配置
   */
  areaStyle?: {
    /**
     * @description 渐变开始透明度
     */
    startOpacity?: number
    /**
     * @description 渐变结束透明度
     */
    endOpacity?: number
    /**
     * @description 自定义 ECharts areaStyle 配置
     */
    custom?: any
  }
  /**
   * @description 是否平滑曲线
   */
  smooth?: boolean
  /**
   * @description 数据点符号
   */
  symbol?: SymbolType
  /**
   * @description 数据点大小
   */
  symbolSize?: number
}

// 折线图 Props 接口 - 统一折线图配置
/**
 * @description 描述折线图组件数据、坐标轴、符号和动画属性。
 * @typedef {object} LineChartProps
 * @property {number[] | LineDataItem[]} data 单组数值或多组折线图系列。
 * @property {string[]} [xAxisData] 横轴标签数据。
 * @property {number} [lineWidth] 线条宽度。
 * @property {boolean} [showAreaColor] 是否显示区域填充。
 * @property {boolean} [smooth] 是否平滑折线。
 * @property {SymbolType} [symbol] 数据点符号。
 * @property {number} [symbolSize] 数据点大小。
 * @property {number} [animationDelay] 动画延迟间隔。
 */
export interface LineChartProps extends BaseChartProps, AxisDisplayProps, InteractionProps {
  /**
   * @description 图表数据 - 支持单组数据或多组数据
   */
  data: number[] | LineDataItem[]
  /**
   * @description X轴标签数据
   */
  xAxisData?: string[]
  /**
   * @description 线条宽度
   */
  lineWidth?: number
  /**
   * @description 是否显示区域填充
   */
  showAreaColor?: boolean
  /**
   * @description 是否平滑曲线
   */
  smooth?: boolean
  /**
   * @description 数据点符号
   */
  symbol?: SymbolType
  /**
   * @description 数据点大小
   */
  symbolSize?: number
  /**
   * @description 多数据动画延迟间隔（毫秒）
   */
  animationDelay?: number
}

// 雷达图数据项接口
/**
 * @description 描述一组雷达图系列数据。
 * @typedef {object} RadarDataItem
 * @property {string} name 名称。
 * @property {number[]} value 数据值。
 */
export interface RadarDataItem {
  /**
   * @description 系列名称
   */
  name: string
  /**
   * @description 数据值
   */
  value: number[]
}

// 雷达图 Props 接口 - 统一雷达图配置
/**
 * @description 描述雷达图指标和系列数据。
 * @typedef {object} RadarChartProps
 * @property {Array<{ name: string; max: number }>} [indicator] 雷达图指标。
 * @property {RadarDataItem[]} [data] 雷达图系列列表。
 */
export interface RadarChartProps extends BaseChartProps, InteractionProps {
  /**
   * @description 雷达图指标配置
   */
  indicator?: Array<{ name: string; max: number }>
  /**
   * @description 图表数据
   */
  data?: RadarDataItem[]
}

// 饼图/环形图数据项接口
/**
 * @description 描述一个饼图扇区的数据值和名称。
 * @typedef {object} PieDataItem
 * @property {number} value 数据值。
 * @property {string} name 名称。
 */
export interface PieDataItem {
  /**
   * @description 数据值
   */
  value: number
  /**
   * @description 数据名称
   */
  name: string
}

// 环形图 Props 接口 - 统一环形图配置
/**
 * @description 描述环形图数据、半径、标签和中心文本。
 * @typedef {object} RingChartProps
 * @property {PieDataItem[]} data 饼图扇区列表。
 * @property {string[]} [radius] 内外半径。
 * @property {number} [borderRadius] 圆角配置。
 * @property {string} [centerText] 中心文字。
 * @property {boolean} [showLabel] 是否显示标签。
 */
export interface RingChartProps extends BaseChartProps, InteractionProps {
  /**
   * @description 图表数据
   */
  data: PieDataItem[]
  /**
   * @description 内外半径
   */
  radius?: string[]
  /**
   * @description 边框圆角
   */
  borderRadius?: number
  /**
   * @description 中心文本
   */
  centerText?: string
  /**
   * @description 是否显示标签
   */
  showLabel?: boolean
}

// K线图数据项接口
/**
 * @description 描述一个时间点的开盘、收盘、最高和最低价格。
 * @typedef {object} KLineDataItem
 * @property {string} time 时间标签。
 * @property {number} open 开盘价。
 * @property {number} close 收盘价。
 * @property {number} high 最高价。
 * @property {number} low 最低价。
 */
export interface KLineDataItem {
  /**
   * @description 时间标签
   */
  time: string
  /**
   * @description 开盘价
   */
  open: number
  /**
   * @description 收盘价
   */
  close: number
  /**
   * @description 最高价
   */
  high: number
  /**
   * @description 最低价
   */
  low: number
}

// K线图 Props 接口 - 统一K线图配置
/**
 * @description 描述 K 线图数据和缩放窗口。
 * @typedef {object} KLineChartProps
 * @property {KLineDataItem[]} [data] K 线数据列表。
 * @property {boolean} [showDataZoom] 是否显示缩放控件。
 * @property {number} [dataZoomStart] 缩放窗口起点。
 * @property {number} [dataZoomEnd] 缩放窗口终点。
 */
export interface KLineChartProps extends BaseChartProps {
  /**
   * @description 图表数据
   */
  data?: KLineDataItem[]
  /**
   * @description 是否显示数据缩放控件
   */
  showDataZoom?: boolean
  /**
   * @description 数据缩放初始开始位置
   */
  dataZoomStart?: number
  /**
   * @description 数据缩放初始结束位置
   */
  dataZoomEnd?: number
}

// 散点图数据项接口
/**
 * @description 描述一个散点坐标。
 * @typedef {object} ScatterDataItem
 * @property {number[]} value 数据值。
 */
export interface ScatterDataItem {
  /**
   * @description 坐标值 [x, y]
   */
  value: number[]
}

// 散点图 Props 接口 - 统一散点图配置
/**
 * @description 描述散点图数据和符号大小。
 * @typedef {object} ScatterChartProps
 * @property {ScatterDataItem[]} [data] 散点数据列表。
 * @property {number} [symbolSize] 数据点大小。
 */
export interface ScatterChartProps extends BaseChartProps, AxisDisplayProps, InteractionProps {
  /**
   * @description 图表数据
   */
  data?: ScatterDataItem[]
  /**
   * @description 散点大小
   */
  symbolSize?: number
}

// 双柱对比图 Props 接口 - 统一双柱对比图配置
/**
 * @description 描述上下双柱对比图的数据和样式。
 * @typedef {object} DualBarCompareChartProps
 * @property {number[]} topData 上方系列数据。
 * @property {number[]} bottomData 下方系列数据。
 * @property {string[]} xAxisData 横轴标签数据。
 * @property {string} [topColor] 上方系列颜色。
 * @property {string} [bottomColor] 下方系列颜色。
 * @property {number} [barWidth] 柱体宽度。
 */
export interface DualBarCompareChartProps extends BaseChartProps {
  /**
   * @description 上方数据
   */
  topData: number[]
  /**
   * @description 下方数据
   */
  bottomData: number[]
  /**
   * @description X轴标签数据
   */
  xAxisData: string[]
  /**
   * @description 上方柱子颜色
   */
  topColor?: string
  /**
   * @description 下方柱子颜色
   */
  bottomColor?: string
  /**
   * @description 柱状图宽度
   */
  barWidth?: number
}

// 地图图表 Props 接口 - 统一地图图表配置
/**
 * @description 描述地图图表的数据、选区、标签和散点显示。
 * @typedef {object} MapChartProps
 * @property {any[]} [mapData] 地图数据。
 * @property {string} [selectedRegion] 选中区域。
 * @property {boolean} [showLabels] 是否显示区域标签。
 * @property {boolean} [showScatter] 是否显示散点。
 */
export interface MapChartProps extends BaseChartProps {
  /**
   * @description 地图数据
   */
  mapData?: any[]
  /**
   * @description 选中区域
   */
  selectedRegion?: string
  /**
   * @description 是否显示标签
   */
  showLabels?: boolean
  /**
   * @description 是否显示散点
   */
  showScatter?: boolean
}

// 双向堆叠柱状图 Props 接口（人口金字塔样式）
/**
 * @description 描述双向堆叠柱状图的数据、坐标轴和样式。
 * @typedef {object} BidirectionalBarChartProps
 * @property {number[]} positiveData 正向数据。
 * @property {number[]} negativeData 负向数据。
 * @property {string[]} [xAxisData] 横轴标签数据。
 * @property {string} [positiveName] 正向系列名称。
 * @property {string} [negativeName] 负向系列名称。
 * @property {string | number} [barWidth] 柱体宽度。
 * @property {number} [yAxisMin] 纵轴最小值。
 * @property {number} [yAxisMax] 纵轴最大值。
 * @property {boolean} [showDataLabel] 是否显示数据标签。
 * @property {number | number[]} [positiveBorderRadius] 正向柱圆角。
 * @property {number | number[]} [negativeBorderRadius] 负向柱圆角。
 */
export interface BidirectionalBarChartProps
  extends BaseChartProps,
    AxisDisplayProps,
    InteractionProps {
  /**
   * @description 正向数据（向上显示）
   */
  positiveData: number[]
  /**
   * @description 负向数据（向下显示）
   */
  negativeData: number[]
  /**
   * @description X轴标签数据
   */
  xAxisData?: string[]
  /**
   * @description 正向数据名称
   */
  positiveName?: string
  /**
   * @description 负向数据名称
   */
  negativeName?: string
  /**
   * @description 柱状图宽度
   */
  barWidth?: string | number
  /**
   * @description Y轴最小值
   */
  yAxisMin?: number
  /**
   * @description Y轴最大值
   */
  yAxisMax?: number
  /**
   * @description 是否显示数据标签
   */
  showDataLabel?: boolean
  /**
   * @description 正向数据圆角配置
   */
  positiveBorderRadius?: number | number[]
  /**
   * @description 负向数据圆角配置
   */
  negativeBorderRadius?: number | number[]
}

// 图表配置生成器函数类型
/**
 * @description 定义生成 ECharts 配置的回调函数。
 * @typedef {() => EChartsOption} ChartOptionGenerator
 */
export type ChartOptionGenerator = () => EChartsOption

// 图表事件回调类型
/**
 * @description 定义处理 ECharts 事件参数的回调函数。
 * @typedef {(params: any) => void} ChartEventCallback
 */
export type ChartEventCallback = (params: any) => void

// 图表错误信息接口
/**
 * @description 描述图表运行错误的代码、消息和详情。
 * @typedef {object} ChartError
 * @property {string} code 错误码。
 * @property {string} message 提示或错误消息。
 * @property {any} [details] 错误详情。
 */
export interface ChartError {
  /**
   * @description 错误码
   */
  code: string
  /**
   * @description 错误信息
   */
  message: string
  /**
   * @description 错误详情
   */
  details?: any
}
