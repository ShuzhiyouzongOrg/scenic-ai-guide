/**
 * @fileoverview 游客行为 Excel 导入、SQLite 缓存、看板指标和运营建议聚合服务。
 * @description 游客行为 Excel 导入、SQLite 缓存、看板指标和运营建议聚合服务。
 */

/**
 * @typedef {object} BehaviorRow
 * @description 规范化游客行为记录。
 * @property {string} touristId 游客标识。
 * @property {number|null} age 年龄。
 * @property {string} gender 规范化性别。
 * @property {string} attractionName 景点名称。
 * @property {string} visitDate `YYYY-MM-DD` 游览日期。
 * @property {number|null} stayDuration 停留分钟数。
 * @property {number} ticketCost 门票消费。
 * @property {number} foodCost 餐饮消费。
 * @property {number} shoppingCost 购物消费。
 * @property {number} transportCost 交通消费。
 * @property {number} entertainmentCost 娱乐消费。
 * @property {number|null} totalCost 总消费。
 * @property {number|null} groupSize 同行人数。
 * @property {number|null} satisfaction 1 至 5 分满意度。
 */

/**
 * @typedef {object} BehaviorDataset
 * @description 行为数据加载结果及其来源信息。
 * @property {string} source 数据来源标识。
 * @property {BehaviorRow[]} rows 规范化游客行为记录。
 * @property {string} [filePath] Excel 文件路径。
 * @property {string} [reason] 使用回退数据的原因。
 * @property {string} [error] 数据读取失败的脱敏错误信息。
 */
import * as fs from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import XLSX from "xlsx";
import { listAllMessages } from "./conversation.mjs";
import { listFeedback } from "./feedback.mjs";
import { listSavedRoutes } from "./routePlanner.mjs";
import { loadKnowledge } from "./knowledgeBuild.mjs";
import { getDb } from "../db/database.mjs";

/**
 * @description 定义官方游客行为分析 Excel 文件名。
 * @type {string} 官方游客行为分析 Excel 文件名。
 */
const EXCEL_FILE = "景点景区旅游数据行为分析数据.xlsx";
/**
 * @description 文件存在判断函数。
 * @type {typeof fs.existsSync} 文件存在判断函数。
 */
const { existsSync, readdirSync, statSync } = fs;
XLSX.set_fs(fs);
/**
 * @description 保存当前进程最近加载的游客行为数据集。
 * @type {BehaviorDataset|null} 当前进程最近加载的行为数据集。
 */
let cache = null;

/**
 * @description 清除行为数据集进程缓存，使演示批次等直接数据库写入能立即反映到看板。
 * @returns {void} 无返回值。
 * @example
 * invalidateBehaviorDatasetCache();
 */
export function invalidateBehaviorDatasetCache() {
  cache = null;
}

/**
 * @description 加载游客行为数据集，优先复用内存缓存和 SQLite；必要时解析官方 Excel 并持久化。
 * Excel 无有效灵山记录时生成稳定结构的种子数据。
 * @param {{force?: boolean}} [options={}] 加载选项。
 * @param {boolean} [options.force=false] 是否跳过缓存和 SQLite，强制重新解析 Excel。
 * @returns {BehaviorDataset} 行为数据集。
 * @throws {Error} 文件目录扫描出现未被内部解析流程捕获的文件系统错误时可能抛出。
 * @example
 * const dataset = loadBehaviorDataset({ force: true });
 */
export function loadBehaviorDataset({ force = false } = {}) {
  if (cache && !force) {
    return cache;
  }

  if (!force) {
    const persisted = readBehaviorFromDb();
    if (persisted.length) {
      cache = { source: "sqlite", rows: persisted };
      return cache;
    }
  }

  const parsed = parseBehaviorExcel();
  if (parsed.rows.length) {
    persistBehaviorRows(parsed.rows);
    cache = parsed;
  } else {
    cache = parsed.error ? parsed : buildSeedDataset(parsed.reason || "no_lingshan_rows");
  }
  return cache;
}

/**
 * @description 尝试从 SQLite 读取行为数据；数据库不可用时静默回退为空数组。
 * @private
 * @returns {BehaviorRow[]} 数据库行为行。
 */
function readBehaviorFromDb() {
  try {
    return getDb()
      .prepare("SELECT * FROM tourist_behavior")
      .all()
      .map((row) => ({
        touristId: row.tourist_id,
        age: row.age,
        gender: row.gender,
        attractionName: row.attraction_name,
        visitDate: row.visit_date,
        stayDuration: row.stay_duration,
        ticketCost: row.ticket_cost,
        foodCost: row.food_cost,
        shoppingCost: row.shopping_cost,
        transportCost: row.transport_cost,
        entertainmentCost: row.entertainment_cost,
        totalCost: row.total_cost,
        groupSize: row.group_size,
        satisfaction: row.satisfaction
      }));
  } catch {
    return [];
  }
}

/**
 * @description 尽力在单个事务中保存行为数据；失败时保留内存中的解析结果供看板使用。
 * @private
 * @param {BehaviorRow[]} rows 待保存行为行。
 * @returns {void} 无返回值。
 */
function persistBehaviorRows(rows) {
  try {
    const db = getDb();
    const insert = db.prepare(
      `INSERT INTO tourist_behavior
         (id, tourist_id, age, gender, attraction_name, visit_date, stay_duration,
          ticket_cost, food_cost, shopping_cost, transport_cost, entertainment_cost,
          total_cost, group_size, satisfaction)
       VALUES
         (@id, @tourist_id, @age, @gender, @attraction_name, @visit_date, @stay_duration,
          @ticket_cost, @food_cost, @shopping_cost, @transport_cost, @entertainment_cost,
          @total_cost, @group_size, @satisfaction)`
    );
    const tx = db.transaction((items) => {
      for (const row of items) {
        insert.run({
          id: `tb_${Date.now()}_${randomBytes(4).toString("hex")}`,
          tourist_id: row.touristId || "",
          age: numOrNull(row.age),
          gender: row.gender || "",
          attraction_name: row.attractionName || "",
          visit_date: row.visitDate || "",
          stay_duration: numOrNull(row.stayDuration),
          ticket_cost: numOrNull(row.ticketCost),
          food_cost: numOrNull(row.foodCost),
          shopping_cost: numOrNull(row.shoppingCost),
          transport_cost: numOrNull(row.transportCost),
          entertainment_cost: numOrNull(row.entertainmentCost),
          total_cost: numOrNull(row.totalCost),
          group_size: numOrNull(row.groupSize),
          satisfaction: numOrNull(row.satisfaction)
        });
      }
    });
    tx(rows);
  } catch {
    // Persistence is best-effort; the dashboard still works from the parsed rows.
  }
}

/**
 * @description 将有限数值转换为数字，其余值转换为 `null`。
 * @private
 * @param {*} value 候选值。
 * @returns {number|null} 有限数值或 `null`。
 */
function numOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * @description 重新解析官方 Excel，并在存在有效行时替换 SQLite 行为数据。
 * 供数据库初始化脚本和人工刷新使用。
 * @returns {{imported: number, source: string, filePath: string}} 导入数量和来源信息。
 * @throws {Error} 文件目录扫描出现未被解析流程捕获的文件系统错误时可能抛出。
 * @example
 * const result = importBehaviorFromExcel();
 */
export function importBehaviorFromExcel() {
  const parsed = parseBehaviorExcel();
  if (parsed.rows.length) {
    try {
      getDb().prepare("DELETE FROM tourist_behavior").run();
    } catch {
      // ignore
    }
    persistBehaviorRows(parsed.rows);
  }
  cache = parsed.rows.length ? { source: "excel", rows: parsed.rows } : buildSeedDataset(parsed.reason || "no_lingshan_rows");
  return { imported: parsed.rows.length, source: parsed.source, filePath: parsed.filePath };
}

/**
 * @description 解析 Excel 首个工作表、归一化列名并只保留灵山相关行。
 * @private
 * @returns {BehaviorDataset} Excel 数据集或带原因的空种子来源描述。
 */
function parseBehaviorExcel() {
  const filePath = findBehaviorExcelFile();
  if (!existsSync(filePath)) {
    return { source: "seed", reason: "excel_missing", rows: [], filePath };
  }
  try {
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    const normalized = rows.map(normalizeRow).filter((row) => isLingshanRelated(row));
    return { source: "excel", filePath, rows: normalized, reason: normalized.length ? "" : "no_lingshan_rows" };
  } catch (error) {
    return { source: "seed", reason: "excel_parse_failed", rows: [], filePath, error: error.message };
  }
}

/**
 * @description 按环境变量、固定资料目录和仓库递归扫描顺序查找行为 Excel。
 * @private
 * @returns {string} 找到的文件路径；未找到时返回最后一个预期路径。
 * @throws {Error} 递归目录读取或文件状态查询失败时透传文件系统异常。
 */
function findBehaviorExcelFile() {
  const fromEnv = process.env.BEHAVIOR_XLSX ? resolve(process.cwd(), process.env.BEHAVIOR_XLSX) : "";
  const candidatesFixed = [
    fromEnv,
    resolve(process.cwd(), "..", "docs", "scenic-materials", EXCEL_FILE),
    resolve(process.cwd(), "docs", "scenic-materials", EXCEL_FILE),
    resolve(process.cwd(), "..", "测试数据-示范景区公开资料包", EXCEL_FILE)
  ].filter(Boolean);
  for (const candidate of candidatesFixed) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const root = resolve(process.cwd(), "..");
  const candidates = [];
  collectFiles(root, candidates);
  return (
    candidates.find((file) => file.endsWith(EXCEL_FILE)) ||
    candidates.find((file) => file.toLowerCase().endsWith(".xlsx")) ||
    candidatesFixed[candidatesFixed.length - 1]
  );
}

/**
 * @description 递归收集目录中的文件，跳过 `node_modules` 和 `.git`。
 * @private
 * @param {string} dir 待扫描目录。
 * @param {string[]} out 收集结果的可变数组。
 * @returns {void} 无返回值。
 * @throws {Error} 目录读取或文件状态查询失败时透传文件系统异常。
 */
function collectFiles(dir, out) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (name === "node_modules" || name === ".git") continue;
      collectFiles(path, out);
    } else {
      out.push(path);
    }
  }
}

/**
 * @description 聚合筛选后的行为、问答、反馈、路线和知识库数据，生成运营看板。
 * @param {object} [filters={}] 行为筛选条件。
 * @param {string} [filters.gender] 性别筛选值。
 * @param {string} [filters.ageBand] 年龄区间筛选值。
 * @param {number|string} [filters.satisfactionMin] 最低满意度。
 * @returns {object} 指标、热点问题、景点关注、情绪趋势、消费、画像和建议。
 * @throws {Error} 数据集、数据库或知识库加载失败时透传异常。
 * @example
 * const dashboard = getDashboardAnalytics({ ageBand: "25-34", satisfactionMin: 4 });
 */
export function getDashboardAnalytics(filters = {}) {
  const dataset = loadBehaviorDataset();
  const rows = applyFilters(dataset.rows, filters);
  const messages = listAllMessages();
  const feedback = listFeedback();
  const routes = listSavedRoutes("");
  const knowledge = loadKnowledge();

  const metrics = {
    todayServiceCount: Math.max(estimateToday(rows), uniqueCount(messages.map((item) => item.sessionId))),
    weekServiceCount: rows.length,
    totalQuestions: messages.filter((item) => item.role === "user").length,
    averageSatisfaction: average([...rows.map((item) => item.satisfaction), ...feedback.map((item) => item.rating)].filter(Number.isFinite)),
    averageLatencyMs: Math.round(average(messages.map((item) => item.latencyMs).filter(Number.isFinite))) || 0,
    behaviorRows: rows.length
  };

  const hotQuestions = topN(messages.filter((item) => item.role === "user").map((item) => clusterQuestion(item.content)), 8);
  const spotFocus = buildSpotFocus({ messages, rows, spots: knowledge?.spots || [] });
  const emotionTrend = buildEmotionTrend({ messages, feedback, rows });
  const routePreference = topN(routes.map((item) => item.routeType || "unknown"), 8);
  const consumption = sumFields(rows, ["ticketCost", "foodCost", "shoppingCost", "transportCost", "entertainmentCost"]);
  const persona = buildPersona(rows);
  const stayRelation = buildStayRelation(rows);
  const suggestions = buildSuggestions({ spotFocus, consumption, feedback, rows, messages });

  return {
    source: dataset.source,
    generatedAt: new Date().toISOString(),
    filters,
    metrics,
    hotQuestions,
    spotFocus,
    emotionTrend,
    routePreference,
    consumption,
    persona,
    stayRelation,
    suggestions
  };
}

/**
 * @description 将 Excel 的中英文或模糊列名转换为统一行为数据结构。
 * @private
 * @param {Record<string, *>} row Excel 原始行。
 * @returns {BehaviorRow} 规范化行为行。
 */
function normalizeRow(row) {
  /**
   * @description 按精确列名或大小写不敏感的包含关系读取首个非空字段。
   * @param {...string} keys 候选列名或名称片段。
   * @returns {*} 单元格值；未找到时为空字符串。
   */
  const get = (...keys) => {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== "") return row[key];
    }
    const found = Object.keys(row).find((name) => keys.some((key) => String(name).toLowerCase().includes(String(key).toLowerCase())));
    return found ? row[found] : "";
  };

  const attractionName = String(get("attraction_name", "景点", "景区", "attraction", "name") || "");
  return {
    touristId: String(get("tourist_id", "用户", "游客", "id") || ""),
    age: numberOrNull(get("age", "年龄")),
    gender: normalizeGender(get("gender", "性别")),
    attractionName,
    visitDate: normalizeDate(get("visit_date", "日期", "游玩日期", "date")),
    stayDuration: numberOrNull(get("stay_duration", "停留", "游玩时长", "duration")),
    ticketCost: numberOrZero(get("ticket", "门票")),
    foodCost: numberOrZero(get("food", "餐饮")),
    shoppingCost: numberOrZero(get("shopping", "购物")),
    transportCost: numberOrZero(get("transport", "交通")),
    entertainmentCost: numberOrZero(get("entertainment", "娱乐")),
    totalCost: numberOrZero(get("total", "总消费", "消费")),
    groupSize: numberOrNull(get("group", "同行", "人数")),
    satisfaction: normalizeSatisfaction(get("satisfaction", "满意"))
  };
}

/**
 * @description 判断行为记录是否属于灵山相关景点。
 * @private
 * @param {BehaviorRow} row 行为行。
 * @returns {boolean} 景点名称命中灵山范围时为 `true`。
 */
function isLingshanRelated(row) {
  return /灵山胜境|灵山大佛|灵山|九龙灌浴|梵宫/.test(row.attractionName);
}

/**
 * @description 按性别、年龄段和最低满意度筛选行为行。
 * @private
 * @param {BehaviorRow[]} rows 行为行。
 * @param {Record<string, *>} filters 筛选条件。
 * @returns {BehaviorRow[]} 符合条件的行。
 */
function applyFilters(rows, filters) {
  return rows.filter((row) => {
    if (filters.gender && row.gender && filters.gender !== row.gender) return false;
    if (filters.ageBand && ageBand(row.age) !== filters.ageBand) return false;
    if (filters.satisfactionMin && Number(row.satisfaction) < Number(filters.satisfactionMin)) return false;
    return true;
  });
}

/**
 * @description 在 Excel 缺失或无灵山记录时生成 180 条结构完整的演示行为数据。
 * @private
 * @param {string} reason 使用种子数据的原因。
 * @returns {BehaviorDataset} 种子数据集。
 */
function buildSeedDataset(reason) {
  const names = ["灵山胜境", "灵山大佛", "九龙灌浴", "灵山梵宫", "五印坛城", "祥符禅寺"];
  const rows = Array.from({ length: 180 }, (_, index) => {
    const age = [22, 28, 35, 43, 51, 62][index % 6];
    const stayDuration = [55, 90, 130, 180, 240][index % 5];
    const satisfaction = [5, 4, 4, 3, 5, 4, 2][index % 7];
    return {
      touristId: `seed_${index + 1}`,
      age,
      gender: index % 2 === 0 ? "female" : "male",
      attractionName: names[index % names.length],
      visitDate: new Date(Date.now() - (index % 14) * 86400000).toISOString().slice(0, 10),
      stayDuration,
      ticketCost: 180,
      foodCost: 35 + (index % 5) * 8,
      shoppingCost: 20 + (index % 4) * 15,
      transportCost: 15 + (index % 3) * 10,
      entertainmentCost: index % 3 === 0 ? 60 : 25,
      totalCost: 0,
      groupSize: 1 + (index % 5),
      satisfaction
    };
  }).map((row) => ({ ...row, totalCost: row.ticketCost + row.foodCost + row.shoppingCost + row.transportCost + row.entertainmentCost }));
  return { source: `seed:${reason}`, filePath: "", rows };
}

/**
 * @description 合并行为记录和消息正文中的景点提及，计算关注度排行。
 * @private
 * @param {{messages: object[], rows: BehaviorRow[], spots: object[]}} input 聚合输入。
 * @returns {Array<{label: string, value: number}>} 景点关注排行。
 */
function buildSpotFocus({ messages, rows, spots }) {
  const names = spots.map((spot) => spot.name).filter(Boolean);
  const fromMessages = [];
  for (const message of messages) {
    for (const name of names) {
      if (message.content?.includes(name)) fromMessages.push(name);
    }
  }
  return topN([...rows.map((item) => item.attractionName), ...fromMessages], 10);
}

/**
 * @description 合并消息情绪、反馈情绪和满意度派生情绪，计算趋势排行。
 * @private
 * @param {{messages: object[], feedback: object[], rows: BehaviorRow[]}} input 聚合输入。
 * @returns {Array<{label: string, value: number}>} 情绪排行。
 */
function buildEmotionTrend({ messages, feedback, rows }) {
  const labels = [
    ...messages.map((item) => item.emotionLabel).filter(Boolean),
    ...feedback.map((item) => item.emotion).filter(Boolean),
    ...rows.map((item) => item.satisfaction >= 4 ? "满意" : item.satisfaction <= 2 ? "失望" : "疑惑")
  ];
  return topN(labels, 8);
}

/**
 * @description 构建年龄、性别、同行规模和满意度游客画像分布。
 * @private
 * @param {BehaviorRow[]} rows 行为行。
 * @returns {{ageBands: object[], genders: object[], groupSizes: object[], satisfaction: object[]}} 游客画像。
 */
function buildPersona(rows) {
  return {
    ageBands: topN(rows.map((row) => ageBand(row.age)), 8),
    genders: topN(rows.map((row) => row.gender || "unknown"), 4),
    groupSizes: topN(rows.map((row) => groupBand(row.groupSize)), 6),
    satisfaction: topN(rows.map((row) => `${row.satisfaction || 0}分`), 6)
  };
}

/**
 * @description 按停留时长统计人数、平均消费和平均满意度。
 * @private
 * @param {BehaviorRow[]} rows 行为行。
 * @returns {Array<{label: string, count: number, averageCost: number, averageSatisfaction: number}>} 停留时长关系数据。
 */
function buildStayRelation(rows) {
  const bands = ["0-1小时", "1-2小时", "2-4小时", "4小时以上"];
  return bands.map((band) => {
    const items = rows.filter((row) => stayBand(row.stayDuration) === band);
    return {
      label: band,
      count: items.length,
      averageCost: Math.round(average(items.map((item) => item.totalCost || sumCost(item)))),
      averageSatisfaction: Number(average(items.map((item) => item.satisfaction)).toFixed(1)) || 0
    };
  });
}

/**
 * @description 根据景点关注、消费结构、低满意反馈和数据规模生成运营建议。
 * @private
 * @param {{spotFocus: object[], consumption: object, feedback: object[], rows: BehaviorRow[], messages: object[]}} input 看板中间结果。
 * @returns {string[]} 最多五条建议。
 */
function buildSuggestions({ spotFocus, consumption, feedback, rows, messages }) {
  const suggestions = [];
  if (spotFocus[0]) suggestions.push(`游客最关注「${spotFocus[0].label}」，建议在入口与数字人欢迎语中突出该点位讲解入口。`);
  const lowFeedback = feedback.filter((item) => Number(item.rating) <= 2 || item.vote === "down");
  if (lowFeedback.length > 0) suggestions.push(`存在 ${lowFeedback.length} 条低满意反馈，建议后台优先复盘对应会话并补充 FAQ。`);
  const topCost = Object.entries(consumption).sort((a, b) => b[1] - a[1])[0];
  if (topCost) suggestions.push(`${costLabel(topCost[0])}占消费结构最高，可结合路线推荐加强相关服务提示。`);
  if (messages.filter((item) => item.role === "user").length === 0) suggestions.push("当前实时问答数据较少，已使用种子/Excel 行为数据保证大屏完整展示。");
  if (rows.length > 0 && average(rows.map((item) => item.satisfaction)) < 4) suggestions.push("行为数据平均满意度低于 4 分，建议聚焦排队、演出时间和路线长度问题。");
  return suggestions.slice(0, 5);
}

/**
 * @description 统计值频次并返回前 N 项。
 * @private
 * @param {Array<*>} values 待统计值。
 * @param {number} n 最大返回项数。
 * @returns {Array<{label: string, value: number}>} 按频次降序的统计项。
 */
function topN(values, n) {
  const counts = new Map();
  for (const value of values) {
    const label = String(value || "unknown").trim();
    if (!label) continue;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "zh-CN"))
    .slice(0, n);
}

/**
 * @description 分别汇总多行中的指定数值字段。
 * @private
 * @param {BehaviorRow[]} rows 行为行。
 * @param {string[]} fields 字段名。
 * @returns {Record<string, number>} 字段总和映射。
 */
function sumFields(rows, fields) {
  return Object.fromEntries(fields.map((field) => [field, rows.reduce((sum, row) => sum + Number(row[field] || 0), 0)]));
}

/**
 * @description 估算今日服务量；无今日记录时按两周数据日均向上取整。
 * @private
 * @param {BehaviorRow[]} rows 行为行。
 * @returns {number} 今日记录数或估算值。
 */
function estimateToday(rows) {
  const today = new Date().toISOString().slice(0, 10);
  return rows.filter((row) => row.visitDate === today).length || Math.ceil(rows.length / 14);
}

/**
 * @description 统计非空值的唯一数量。
 * @private
 * @param {Array<*>} values 候选值。
 * @returns {number} 唯一非空值数量。
 */
function uniqueCount(values) {
  return new Set(values.filter(Boolean)).size;
}

/**
 * @description 计算有限数值平均值。
 * @private
 * @param {Array<*>} values 候选值。
 * @returns {number} 平均值；无有效数值时为 `0`。
 */
function average(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
}

/**
 * @description 从含单位文本中提取有限数字。
 * @private
 * @param {*} value 候选值。
 * @returns {number|null} 数字或 `null`。
 */
function numberOrNull(value) {
  const number = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

/**
 * @description 从含单位文本中提取数字，无有效值时返回零。
 * @private
 * @param {*} value 候选值。
 * @returns {number} 数字或 `0`。
 */
function numberOrZero(value) {
  return numberOrNull(value) || 0;
}

/**
 * @description 将五分制或百分制满意度归一化为 1 至 5 的整数。
 * @private
 * @param {*} value 原始满意度。
 * @returns {number|null} 归一化评分；空值时为 `null`。
 */
function normalizeSatisfaction(value) {
  const number = numberOrNull(value);
  if (!number) return null;
  return Math.max(1, Math.min(5, number > 5 ? Math.round(number / 20) : Math.round(number)));
}

/**
 * @description 将中英文性别值归一化为 `female` 或 `male`。
 * @private
 * @param {*} value 原始性别。
 * @returns {string} 规范化性别或清理后的未知值。
 */
function normalizeGender(value) {
  const text = String(value || "").trim().toLowerCase();
  if (/女|female|f/.test(text)) return "female";
  if (/男|male|m/.test(text)) return "male";
  return text || "";
}

/**
 * @description 将 Date 或可解析日期转换为 `YYYY-MM-DD`。
 * @private
 * @param {*} value 原始日期。
 * @returns {string} 标准日期；无法解析时为空字符串。
 */
function normalizeDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value || "").trim();
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/**
 * @description 将年龄划分为看板年龄段。
 * @private
 * @param {*} age 年龄。
 * @returns {"18-24"|"25-34"|"35-44"|"45-59"|"60+"|"unknown"} 年龄段。
 */
function ageBand(age) {
  if (!Number.isFinite(Number(age))) return "unknown";
  if (age < 25) return "18-24";
  if (age < 35) return "25-34";
  if (age < 45) return "35-44";
  if (age < 60) return "45-59";
  return "60+";
}

/**
 * @description 将同行人数划分为独行、双人、家庭/小组或团队。
 * @private
 * @param {*} size 同行人数。
 * @returns {string} 同行规模标签。
 */
function groupBand(size) {
  if (!Number.isFinite(Number(size))) return "unknown";
  if (size <= 1) return "独行";
  if (size <= 2) return "双人";
  if (size <= 4) return "家庭/小组";
  return "团队";
}

/**
 * @description 将停留分钟数划分为四个时长区间。
 * @private
 * @param {*} duration 停留分钟数。
 * @returns {string} 时长区间。
 */
function stayBand(duration) {
  const value = Number(duration) || 0;
  if (value <= 60) return "0-1小时";
  if (value <= 120) return "1-2小时";
  if (value <= 240) return "2-4小时";
  return "4小时以上";
}

/**
 * @description 汇总行为行的五类消费。
 * @private
 * @param {BehaviorRow} row 行为行。
 * @returns {number} 总消费。
 */
function sumCost(row) {
  return row.ticketCost + row.foodCost + row.shoppingCost + row.transportCost + row.entertainmentCost;
}

/**
 * @description 将消费字段名转换为中文展示名称。
 * @private
 * @param {string} field 消费字段。
 * @returns {string} 中文标签或原字段名。
 */
function costLabel(field) {
  return {
    ticketCost: "门票",
    foodCost: "餐饮",
    shoppingCost: "购物",
    transportCost: "交通",
    entertainmentCost: "娱乐"
  }[field] || field;
}

/**
 * @description 通过关键词将用户问题归入热点主题。
 * @private
 * @param {*} text 问题文本。
 * @returns {string} 主题名或截断后的原问题。
 */
function clusterQuestion(text) {
  const value = String(text || "");
  if (/路线|怎么逛|游览|几小时/.test(value)) return "路线推荐";
  if (/大佛|多高|高度/.test(value)) return "灵山大佛";
  if (/九龙|灌浴|演出/.test(value)) return "九龙灌浴";
  if (/梵宫/.test(value)) return "灵山梵宫";
  if (/门票|开放|时间|几点/.test(value)) return "开放与票务";
  return value.slice(0, 18) || "其他问题";
}
