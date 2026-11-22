// Project-owned UI only. User messages, venue names and provider quotes keep their original text.
(() => {
  const words = new Map([
    ["会话已失效，请从应用重新打开导游。", ["This session has expired. Reopen the guide in the app.", "連線已失效，請從應用程式重新開啟導遊。"]],
    ["此导游暂时无法连接，请返回应用重试。", ["This guide is unavailable. Return to the app and try again.", "暫時無法連接此導遊，請回到應用程式重試。"]],
    ["灵山 AI 动态数字人", ["Lingshan virtual guide", "靈山 AI 虛擬導遊"]],
    ["讯飞动态数字人", ["iFlytek virtual guide", "訊飛虛擬導遊"]],
    ["灵山 AI 导游", ["Lingshan AI guide", "靈山 AI 導遊"]],
    ["正在准备安全会话…", ["Preparing a secure session…", "正在準備安全連線…"]],
    ["讯飞云端动态形象", ["iFlytek cloud avatar", "訊飛雲端虛擬導遊"]],
    ["启用声音", ["Enable sound", "啟用聲音"]],
    ["停止播报", ["Stop narration", "停止播報"]],
    ["和动态数字人一起游景区", ["Explore with your guide", "跟隨虛擬導遊遊覽"]],
    ["点击启动后，可以询问景点、路线和服务信息。", ["Start the guide to ask about places, routes and visitor services.", "啟動後可詢問景點、路線和服務資訊。"]],
    ["启动动态数字人", ["Start guide", "啟動虛擬導遊"]],
    ["想问导游什么？", ["What would you like to ask?", "想問導遊什麼？"]],
    ["例如：第一次来灵山怎么玩？", ["How should I plan my first visit to Lingshan?", "例如：第一次來靈山怎麼玩？"]],
    ["问问我", ["Ask", "提問"]],
    ["AI 导游回答", ["Guide’s answer", "AI 導遊回答"]],
    ["启动数字人后，回答会在这里同步显示并由形象播报。", ["After the guide starts, its answers appear here and are read aloud.", "啟動虛擬導遊後，回答會顯示於此並同步播報。"]],
    ["回答已收到，数字人就绪后将自动播报", ["Answer received. The guide will read it when ready.", "已收到回答，導遊就緒後將自動播報"]],
    ["播报已停止", ["Narration stopped", "播報已停止"]],
    ["声音已启用，可以开始提问", ["Sound enabled. You can ask a question.", "已啟用聲音，可以開始提問"]],
    ["请再次点击启用声音", ["Tap Enable sound again", "請再次點選啟用聲音"]],
    ["安全会话不存在，请返回应用重新打开数字人。", ["No active session. Return to the app and reopen the guide.", "找不到安全連線，請返回應用程式重新開啟虛擬導遊。"]],
    ["安全会话已就绪，正在自动启动", ["Session ready. Starting the guide…", "安全連線已就緒，正在自動啟動"]],
    ["安全会话已就绪，请点击启动", ["Session ready. Tap Start guide.", "安全連線已就緒，請點選啟動"]],
    ["正在连接讯飞数字人…", ["Connecting to iFlytek…", "正在連接訊飛虛擬導遊…"]],
    ["正在建立云端动态形象连接…", ["Connecting to the cloud avatar…", "正在連接雲端虛擬導遊…"]],
    ["数字人已连接，正在加载动态画面…", ["Connected. Loading the video…", "已連線，正在載入動態畫面…"]],
    ["动态形象已上线", ["The guide is ready", "虛擬導遊已就緒"]],
    ["数字人正在回答", ["The guide is answering", "虛擬導遊正在回答"]],
    ["数字人在线，随时为你服务", ["The guide is ready for your questions", "虛擬導遊在線，隨時可為你服務"]],
    ["数字人连接已中断", ["The guide was disconnected", "虛擬導遊連線中斷"]],
    ["请点击“启用声音”完成浏览器授权", ["Tap Enable sound to allow playback.", "請點選「啟用聲音」允許瀏覽器播放"]],
    ["AI 导游正在查找景区知识…", ["Looking up visitor information…", "AI 導遊正在查找景區資料…"]],
    ["正在思考你的问题…", ["Preparing your answer…", "正在思考你的問題…"]],
    ["AI 导游回答失败", ["The guide could not answer", "AI 導遊回答失敗"]],
    ["暂时没有找到合适的回答。", ["No answer is available yet.", "暫時找不到合適的回答。"]],
    ["回答失败，请稍后重试", ["Could not answer. Try again later.", "回答失敗，請稍後重試"]],
    ["数字人正在为你讲解", ["The guide is speaking", "虛擬導遊正在為你講解"]],
    ["重新启动动态数字人", ["Restart guide", "重新啟動虛擬導遊"]],
    ["自动重连已暂停，请点击重新启动", ["Reconnection paused. Tap Restart guide.", "自動重連已暫停，請點選重新啟動"]],
    ["自动重连", ["Reconnecting", "自動重連"]],
    ["{seconds} 秒后自动重连", ["Reconnecting in {seconds}s", "{seconds} 秒後自動重連"]],
    ["数字人服务错误", ["Guide service error", "虛擬導遊服務錯誤"]],
    ["数字人服务暂不可用", ["The guide is unavailable", "虛擬導遊服務暫時無法使用"]],
    ["Live2D 本地数字人", ["Local Live2D guide", "Live2D 本機虛擬導遊"]],
    ["正在加载 Live2D 模型", ["Loading the Live2D model", "正在載入 Live2D 模型"]],
    ["轻触启用数字人声音", ["Tap to enable guide audio", "輕觸以啟用導遊聲音"]],
    ["Live2D 模型加载失败", ["Could not load the Live2D model", "Live2D 模型載入失敗"]],
    ["Live2D 模型加载超时", ["The Live2D model took too long to load", "Live2D 模型載入逾時"]],
    ["当前 WebView 不支持 Live2D Cubism Core", ["This web view does not support Live2D Cubism Core", "目前的 WebView 不支援 Live2D Cubism Core"]],
    ["Live2D 初始化失败", ["Could not start Live2D", "Live2D 初始化失敗"]],
  ])
  const query = new URLSearchParams(location.search)
  const language = (query.get('locale') || navigator.language || 'zh-CN').toLowerCase()
  const locale = /^en(?:-|$)/.test(language) ? 'en' : /^zh-(hant|tw|hk|mo)(?:-|$)/.test(language) ? 'zh-TW' : 'zh-CN'
  const root = document.documentElement
  root.lang = locale
  const theme = query.get('theme')
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme
  if (query.get('motion') === 'reduce') root.dataset.motion = 'reduce'
  function text(original) {
    const pair = words.get(original)
    return pair && locale !== 'zh-CN' ? pair[locale === 'en' ? 0 : 1] : original
  }
  window.scenicStage = {locale, text}
  document.querySelectorAll('[data-stage-text]').forEach(element => {
    element.textContent = text(element.textContent.trim())
  })
  document.querySelectorAll('[data-stage-attr]').forEach(element => {
    const name = element.dataset.stageAttr
    element.setAttribute(name, text(element.getAttribute(name)))
  })
})()
