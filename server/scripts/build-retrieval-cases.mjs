import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const basePath = join(serverRoot, "data", "tests", "retrieval-cases.json");
const outputPath = join(serverRoot, "data", "tests", "retrieval-cases-expanded.json");
const answerOutputPath = join(serverRoot, "data", "tests", "answer-cases.json");
const baseCases = JSON.parse(readFileSync(basePath, "utf8"));

const STRUCTURED_DOCUMENT = {
  id: "doc_structured_lingshan_spots",
  file: "docs/scenic-materials/灵山胜境 景点结构化数据集.docx"
};
const GUIDE_DOCUMENT = {
  id: "doc_lingshan_guide",
  file: "docs/scenic-materials/灵山胜境：历史、文化、景点特色与个性化游览指南.docx"
};

const guideOnlyCaseIds = new Set([
  "performance_fangong_jixiangsong",
  "ticket_price",
  "route_family",
  "route_history",
  "route_nature",
  "culture_origin_xuanzang"
]);
const forbiddenFactsByCase = {
  fact_height_lingshan_buddha: ["建筑面积达72000㎡"],
  fact_location_lingshan_buddha: ["拈花湾禅意小镇"],
  performance_jiulong_time: ["10:35、11:30、14:00、16:00"],
  performance_fangong_jixiangsong: ["4-5场"],
  ticket_price: ["重12.8吨"],
  route_family: ["6小时深度游"],
  route_history: ["亲子家庭路线"],
  route_nature: ["210元"],
  highlight_fangong: ["88m"],
  culture_xiangfu_history: ["2003年"],
  culture_origin_xuanzang: ["1997年11月15日"],
  photo_checkin: ["210元"],
  open_five_wisdom_gate: ["10:35、11:30、14:00、16:00"],
  spot_baizi_mile: ["重12.8吨"],
  spot_wuyin_tancheng: ["建筑面积达72000㎡"],
  spot_manfeilong: ["88m"],
  spot_buddha_foot: ["210元"],
  spot_bodhi_road: ["重12.8吨"],
  spot_ashoka_pillar: ["建筑面积达72000㎡"],
  spot_wuming_bridge: ["88m"]
};
const chineseTemplates = [
  { style: "standard", render: (question) => question },
  { style: "polite", render: (question) => `请问，${question}？` },
  { style: "colloquial", render: (question) => `${question}，能讲讲吗？` },
  { style: "holdout_rewrite", render: (question) => `想了解一下：${question}。` }
];

const expanded = [];
for (const [baseIndex, item] of baseCases.entries()) {
  const documents = guideOnlyCaseIds.has(item.id) ? [GUIDE_DOCUMENT] : [STRUCTURED_DOCUMENT];
  const variantCount = baseIndex < 10 ? 4 : 3;
  chineseTemplates.slice(0, variantCount).forEach((template, index) => {
    expanded.push({
      ...item,
      id: `${item.id}_v${index + 1}`,
      question: template.render(item.question),
      locale: "zh",
      queryStyle: template.style,
      expectedDocumentIds: documents.map((document) => document.id),
      sourceFiles: documents.map((document) => document.file),
      forbiddenFacts: forbiddenFactsByCase[item.id],
      split: index === variantCount - 1 ? "holdout" : "tuning",
      shouldAnswer: true,
      shouldRefuse: false
    });
  });
}

expanded.push(
  ...localizedCases("en", "doc_lingshan_guide_en", "docs/scenic-materials/lingshan-guide.en.md", [
    ["buddha_height", "How tall is the Lingshan Grand Buddha and how much bronze was used?", "Lingshan Grand Buddha", ["LS-011"], ["88 meters", "101.5 meters", "725 metric tons"], ["72,000 square meters"]],
    ["cloud_steps", "What do the 216 steps on the Cloud Ascending Path symbolize?", "Lingshan Grand Buddha", ["LS-011"], ["216-step", "108 troubles", "108 wishes"], ["four to five performances per day"]],
    ["jiulong_schedule", "How often does Nine Dragons Bathing run, and where should I confirm today's time?", "Nine Dragons Bathing show", ["LS-006"], ["four to five performances per day", "official notice", "visitor center"], ["10:35, 11:30, 14:00, and 16:00"]],
    ["palace_highlights", "What are the main artistic highlights of the Lingshan Brahma Palace?", "Lingshan Brahma Palace", ["LS-013"], ["28-meter celestial dome", "148 flying apsaras", "Avatamsaka World"], ["88 meters high"]],
    ["jixiang_times", "When is the Ode to Auspiciousness performed and how long does it last?", "Lingshan Brahma Palace", ["LS-013"], ["10:35", "11:30", "14:00", "16:00", "20 minutes"], ["four to five performances per day"]],
    ["mandala_style", "What style is the Five Mudra Mandala and how large is it?", "Five Mudra Mandala", ["LS-014"], ["Tibetan Buddhist-style", "5,000 square meters"], ["72,000 square meters"]],
    ["xiangfu_bell", "How heavy is the Xiangfu Chan Bell?", "Xiangfu Chan Temple", ["LS-010"], ["12.8-metric-ton"], ["725 metric tons"]],
    ["nianhua_stops", "Which main places are listed for Nianhua Bay Zen Town?", "Nianhua Bay Zen Town", [], ["Nianhua Square", "Wudeng Lake", "Luming Valley"], ["12.8-metric-ton"]],
    ["ticket_prices", "What ticket and shuttle prices are listed in the current guide?", "Tickets, opening hours, dining, and etiquette", [], ["CNY 210", "CNY 105", "CNY 225", "CNY 40"], ["88 meters"]],
    ["family_route", "Which stops are included in the four-hour family-friendly route?", "Family-friendly route, about 4 hours", [], ["Nine Dragons Bathing", "First Palm", "Hundred Children Playing with Maitreya", "Five Mudra Mandala"], ["Enter through the south gate"]]
  ]),
  ...localizedCases("ja", "doc_lingshan_guide_ja", "docs/scenic-materials/lingshan-guide.ja.md", [
    ["buddha_height", "霊山大仏の高さと青銅の使用量を教えてください。", "霊山大仏", ["LS-011"], ["88メートル", "101.5メートル", "約725トン"], ["約7万2,000平方メートル"]],
    ["cloud_steps", "登雲道の216段は何を象徴していますか。", "霊山大仏", ["LS-011"], ["216段", "108の煩悩", "108の願い"], ["1日4～5回"]],
    ["jiulong_schedule", "九龍灌浴は1日何回上演され、当日の時刻はどこで確認しますか。", "九龍灌浴の上演", ["LS-006"], ["1日4～5回", "園内案内", "ビジターセンター"], ["10:35、11:30、14:00、16:00"]],
    ["palace_highlights", "霊山梵宮の主な芸術的な見どころは何ですか。", "霊山梵宮", ["LS-013"], ["高さ28メートルの星空ドーム", "148体の飛天", "華蔵世界"], ["88メートル"]],
    ["jixiang_times", "吉祥頌の上演時刻と所要時間を教えてください。", "霊山梵宮", ["LS-013"], ["10:35", "11:30", "14:00", "16:00", "約20分"], ["1日4～5回"]],
    ["mandala_style", "五印壇城はどのような様式で、面積はどのくらいですか。", "五印壇城", ["LS-014"], ["チベット仏教様式", "約5,000平方メートル"], ["約7万2,000平方メートル"]],
    ["xiangfu_bell", "祥符禅鐘の重さはどのくらいですか。", "祥符禅寺", ["LS-010"], ["12.8トン"], ["約725トン"]],
    ["nianhua_stops", "拈花湾禅意小鎮の主な場所を教えてください。", "拈花湾禅意小鎮", [], ["拈花広場", "五灯湖", "鹿鳴谷"], ["12.8トン"]],
    ["ticket_prices", "資料に記載された入場券と園内車の料金はいくらですか。", "入場券、営業時間、食事、参拝マナー", [], ["大人券210元", "割引券105元", "セット券225元", "園内車単独券40元"], ["88メートル"]],
    ["family_route", "約4時間のファミリールートにはどの場所が含まれますか。", "ファミリールート、約4時間", [], ["九龍灌浴", "天下第一掌", "百子戯弥勒", "五印壇城"], ["南門から入園"]]
  ]),
  ...localizedCases("ko", "doc_lingshan_guide_ko", "docs/scenic-materials/lingshan-guide.ko.md", [
    ["buddha_height", "링산대불의 높이와 사용된 청동의 양은 얼마인가요?", "링산대불", ["LS-011"], ["88미터", "101.5미터", "약 725톤"], ["약 7만 2천 제곱미터"]],
    ["cloud_steps", "등운도의 216개 계단은 무엇을 상징하나요?", "링산대불", ["LS-011"], ["216개 계단", "108번뇌", "108가지 소원"], ["하루 4~5회"]],
    ["jiulong_schedule", "구룡관욕은 하루 몇 회 공연하며 당일 시간은 어디서 확인하나요?", "구룡관욕 공연", ["LS-006"], ["하루 4~5회", "현장 공지", "관광안내센터"], ["10:35, 11:30, 14:00, 16:00"]],
    ["palace_highlights", "링산 범궁의 대표적인 예술 볼거리는 무엇인가요?", "링산 범궁", ["LS-013"], ["높이 28미터의 천상 돔", "148위의 비천상", "화장세계"], ["88미터"]],
    ["jixiang_times", "길상송 공연 시각과 소요 시간은 어떻게 되나요?", "링산 범궁", ["LS-013"], ["10:35", "11:30", "14:00", "16:00", "약 20분"], ["하루 4~5회"]],
    ["mandala_style", "오인단성은 어떤 양식이며 규모는 어느 정도인가요?", "오인단성", ["LS-014"], ["티베트 불교 양식", "약 5,000제곱미터"], ["약 7만 2천 제곱미터"]],
    ["xiangfu_bell", "상부선종의 무게는 얼마인가요?", "상부선사", ["LS-010"], ["12.8톤"], ["약 725톤"]],
    ["nianhua_stops", "녠화완 선의 마을의 주요 장소는 어디인가요?", "녠화완 선의 마을", [], ["녠화광장", "오등호", "녹명곡"], ["12.8톤"]],
    ["ticket_prices", "자료에 나온 입장권과 관광차 가격을 알려 주세요.", "입장권, 운영 시간, 식사와 관람 예절", [], ["성인권 210위안", "우대권 105위안", "결합권 225위안", "단독권 40위안"], ["88미터"]],
    ["family_route", "약 4시간 가족 경로에는 어떤 장소가 포함되나요?", "가족 경로, 약 4시간", [], ["구룡관욕", "천하제일장", "백자희미륵", "오인단성"], ["남문에서 입장"]]
  ]),
  ...localizedCases("th", "doc_lingshan_guide_th", "docs/scenic-materials/lingshan-guide.th.md", [
    ["buddha_height", "พระใหญ่หลิงซานสูงเท่าไรและใช้สัมฤทธิ์ประมาณเท่าไร", "พระใหญ่หลิงซาน", [], ["88 เมตร", "101.5 เมตร", "725 เมตริกตัน"], ["72,000 ตารางเมตร"]],
    ["cloud_steps", "บันไดเส้นทางสู่เมฆ 216 ขั้นสื่อถึงอะไร", "พระใหญ่หลิงซาน", [], ["216 ขั้น", "ความกังวล 108 ประการ", "ความปรารถนา 108 ประการ"], ["วันละสี่ถึงห้ารอบ"]],
    ["jiulong_schedule", "การแสดงเก้ามังกรสรงน้ำมีวันละกี่รอบและควรตรวจสอบเวลาได้ที่ไหน", "การแสดงเก้ามังกรสรงน้ำ", [], ["วันละสี่ถึงห้ารอบ", "ประกาศทางการ", "ศูนย์บริการนักท่องเที่ยว"], ["10:35 น., 11:30 น., 14:00 น. และ 16:00 น."]],
    ["palace_highlights", "จุดเด่นทางศิลปะของพระราชวังฝานกงหลิงซานมีอะไรบ้าง", "พระราชวังฝานกงหลิงซาน", [], ["โดมทิพย์สูง 28 เมตร", "นางอัปสรเหาะ 148 องค์", "โลกอวตังสกะ"], ["88 เมตร"]],
    ["jixiang_times", "บทเพลงแห่งสิริมงคลแสดงเวลาใดและใช้เวลากี่นาที", "พระราชวังฝานกงหลิงซาน", [], ["10:35", "11:30", "14:00", "16:00", "20 นาที"], ["วันละสี่ถึงห้ารอบ"]],
    ["mandala_style", "วิหารห้าตราประทับเป็นสถาปัตยกรรมแบบใดและมีพื้นที่เท่าไร", "วิหารห้าตราประทับ", [], ["พุทธศาสนาแบบทิเบต", "5,000 ตารางเมตร"], ["72,000 ตารางเมตร"]],
    ["xiangfu_bell", "ระฆังวัดเซียงฝูฉานหนักเท่าไร", "วัดเซียงฝูฉาน", [], ["12.8 เมตริกตัน"], ["725 เมตริกตัน"]],
    ["nianhua_stops", "สถานที่สำคัญในเมืองเซนเหนียนฮวาวานมีที่ใดบ้าง", "เมืองเซนเหนียนฮวาวาน", [], ["จัตุรัสเหนียนฮวา", "ทะเลสาบอู๋เติง", "หุบเขาลู่หมิง"], ["12.8 เมตริกตัน"]],
    ["ticket_prices", "ข้อมูลระบุราคาบัตรและรถรับส่งไว้เท่าไรบ้าง", "บัตรเข้าชม เวลาเปิด อาหาร และมารยาท", [], ["210 หยวน", "105 หยวน", "225 หยวน", "40 หยวน"], ["88 เมตร"]],
    ["family_route", "เส้นทางสำหรับครอบครัวประมาณ 4 ชั่วโมงผ่านสถานที่ใดบ้าง", "เส้นทางสำหรับครอบครัว ประมาณ 4 ชั่วโมง", [], ["เก้ามังกรสรงน้ำ", "ฝ่ามืออันดับหนึ่ง", "พระศรีอริยเมตไตรยกับเด็กหนึ่งร้อยคน", "วิหารห้าตราประทับ"], ["เข้าทางประตูทิศใต้"]]
  ]),
  ...localizedCases("zh-TW", "doc_lingshan_guide_zh_tw", "docs/scenic-materials/lingshan-guide.zh-TW.md", [
    ["buddha_height", "靈山大佛有多高，使用了多少青銅？", "靈山大佛", ["LS-011"], ["88 公尺", "101.5 公尺", "725 噸"], ["7.2 萬平方公尺"]],
    ["cloud_steps", "登雲道的 216 級代表什麼含義？", "靈山大佛", ["LS-011"], ["216 級", "108 種煩惱", "108 個願望"], ["每日演出 4 至 5 場"]],
    ["jiulong_schedule", "九龍灌浴每日演出幾場，當日時間要去哪裡確認？", "九龍灌浴表演", ["LS-006"], ["每日演出 4 至 5 場", "景區公告", "遊客服務中心"], ["10:35、11:30、14:00、16:00"]],
    ["palace_highlights", "靈山梵宮有哪些主要藝術看點？", "靈山梵宮", ["LS-013"], ["28 公尺高的穹頂天象圖", "148 尊飛天", "華藏世界"], ["88 公尺"]],
    ["jixiang_times", "吉祥頌的演出時間和每場時長是多少？", "靈山梵宮", ["LS-013"], ["10:35", "11:30", "14:00", "16:00", "約 20 分鐘"], ["每日演出 4 至 5 場"]],
    ["mandala_style", "五印壇城是什麼建築風格，面積多大？", "五印壇城", ["LS-014"], ["藏傳佛教風格", "5,000 平方公尺"], ["7.2 萬平方公尺"]],
    ["xiangfu_bell", "祥符禪鐘有多重？", "祥符禪寺", ["LS-010"], ["12.8 噸"], ["725 噸"]],
    ["nianhua_stops", "拈花灣禪意小鎮包含哪些主要景點？", "拈花灣禪意小鎮", [], ["拈花廣場", "五燈湖", "鹿鳴谷"], ["12.8 噸"]],
    ["ticket_prices", "資料列出的門票與觀光車價格是多少？", "門票、開放時間、餐飲與禮儀", [], ["210 元", "105 元", "225 元", "40 元"], ["88 公尺"]],
    ["family_route", "約 4 小時的親子輕鬆路線會經過哪些地方？", "親子輕鬆路線，約 4 小時", [], ["九龍灌浴", "天下第一掌", "百子戲彌勒", "五印壇城"], ["由南門入園"]]
  ])
);

const outOfScopePlaces = [
  "西湖", "故宫", "黄山", "泰山", "峨眉山", "普陀山", "九华山", "少林寺",
  "兵马俑", "长城", "迪士尼", "环球影城", "鼋头渚", "颐和园", "天坛"
];
outOfScopePlaces.forEach((place, index) => {
  for (const [variant, question] of [
    ["intro", `介绍一下${place}`],
    ["route", `${place}推荐什么游览路线`]
  ]) {
    expanded.push({
      id: `no_answer_${index + 1}_${variant}`,
      category: "跨景区负样本",
      question,
      locale: "zh",
      queryStyle: variant === "intro" ? "out_of_scope_intro" : "out_of_scope_route",
      expectedDocumentIds: [],
      expectedTopTitles: [],
      expectedSpotIds: [],
      expectedTerms: [],
      forbiddenFacts: ["88m", "210元"],
      sourceFiles: [],
      split: index % 3 === 0 ? "holdout" : "tuning",
      shouldAnswer: false,
      shouldRefuse: true
    });
  }
});

if (expanded.length !== 150) {
  throw new Error(`Expected 150 retrieval cases, got ${expanded.length}.`);
}

const answerCases = expanded.map((item) => ({
  id: item.id,
  category: item.category,
  question: item.question,
  locale: item.locale,
  split: item.split,
  shouldRefuse: item.shouldRefuse,
  expectedDocumentIds: item.expectedDocumentIds,
  expectedSectionTitles: item.expectedTopTitles,
  expectedSpotIds: item.expectedSpotIds,
  expectedFacts: item.expectedTerms,
  forbiddenFacts: item.forbiddenFacts,
  sourceFiles: item.sourceFiles
}));

writeFileSync(outputPath, `${JSON.stringify(expanded, null, 2)}\n`, "utf8");
writeFileSync(answerOutputPath, `${JSON.stringify(answerCases, null, 2)}\n`, "utf8");
console.log(`Wrote ${expanded.length} retrieval cases to ${outputPath}`);
console.log(`Wrote ${answerCases.length} answer cases to ${answerOutputPath}`);

function localizedCases(locale, documentId, sourceFile, definitions) {
  return definitions.map((definition, index) => {
    const [suffix, question, title, spotIds, expectedTerms, forbiddenFacts] = definition;
    return {
      id: `${locale.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${suffix}`,
      category: "多语言",
      question,
      locale,
      queryStyle: "source_aligned",
      expectedDocumentIds: [documentId],
      expectedTopTitles: [title],
      expectedSpotIds: spotIds,
      expectedTerms,
      forbiddenFacts,
      sourceFiles: [sourceFile],
      split: index >= 8 ? "holdout" : "tuning",
      shouldAnswer: true,
      shouldRefuse: false
    };
  });
}
