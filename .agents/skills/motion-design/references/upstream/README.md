# 动效资料原始快照

两份 ZIP 保存上游仓库在指定提交的全部 Git 跟踪文件。打开文档前可以解压到临时目录，保持其内部目录结构。日常移动端工作直接读取项目动效规范即可。上游建议的库、命令、联网字体和宿主级配置均没有接入 App；ZIP 中的 Skill 不会额外注册到 Codex。

| 离线档案 | 来源和许可 | 优先阅读 |
| --- | --- | --- |
| [emil-skills-64eb3deb9a5f.zip](emil-skills-64eb3deb9a5f.zip) | Emil Kowalski，MIT，内含原始 LICENSE。[固定提交](https://github.com/emilkowalski/skills/tree/64eb3deb9a5fbfa041faf783e0bc3fd635872e9c) | `skills/animate/SKILL.md`、同目录 `RECIPES.md`、相邻的 `pick-ui-library` 和 `choreograph` |
| [design-motion-principles-4a9ca879f24a.zip](design-motion-principles-4a9ca879f24a.zip) | Kyle Zantos，MIT，内含原始 LICENSE。[固定提交](https://github.com/kylezantos/design-motion-principles/tree/4a9ca879f24a361f4dca4174fe2da0f67b5ddee3) | `skills/design-motion-principles/SKILL.md` → `workflows/create.md` 或 `workflows/audit.md` → 所需 `references/` |

运行 `python .agents/skills/motion-design/scripts/verify_upstream.py`。脚本可离线运行，使用 Python 3 标准库校验 ZIP 的 SHA-256、全部路径、字节数、Git blob 哈希、LICENSE 和审计表中的引用端点。档案包含 36 和 18 个文件。两个 ZIP 均在 visitor-app 目录之外，移动端安装包没有新增这部分体积。

维护单次更新时，一同调整 ZIP、校验摘要、上游文件清单和规则适配记录。清单和处理方法见[完整性审计](../../../../../docs/design-system/audit/skill-integrity-audit.md)。
