# Design

## Selection Model
保留现有 `selectedHotspot` 作为“当前查看/聚焦”的候选，保留 `selectedHotspotIds` 作为“参与生成”的候选集合。RSS 抓取成功后可以设置 `selectedHotspot` 方便详情区展示，但必须清空 `selectedHotspotIds`，并清除旧议程和旧草稿。

手动点击单条热点时继续切换 `selectedHotspotIds`。如果只是打开来源或查看详情，不应改变生成集合。

## Category Generation
分类概览需要为每个分类提供生成动作。点击“从此分类生成圆桌”时：
- 取当前分类对象中的全部 `articles`，映射出对应 `hotspot.id`。
- 将这些 id 写入 `selectedHotspotIds`。
- 将该分类第一篇文章设为 `selectedHotspot`，只用于详情/上下文展示。
- 复用现有 `generationHotspot` 的 `mergeHotspots(...)` 流程生成一个合并热点，再调用现有 `generatePlan()`。

该行为只影响前端选择集合，不要求新增后端 API。

## Draft Page Audit
圆桌稿页按用户路径拆成以下状态检查：
- `draft === null`：只显示清晰空状态，不能出现保存、导出、状态切换等无效动作。
- `job.status === "running"` 且 `job.type === "draft"`：展示生成中反馈，禁用会导致重复生成或保存半成品的动作；互动模式保留必要的打断能力。
- 互动圆桌：`running`、`interrupted`、`awaiting_user`、`finished` 状态分别对应打断、输入、继续和结束按钮，不让按钮悬空。
- 保存和导出：无草稿时给出页内错误；有草稿时保留来源、事实核查和状态字段。
- 状态切换：只允许对当前草稿切换 `draft/reviewed/published`，并确保历史详情和当前草稿同步。
- 来源打开：优先使用草稿来源，回退到生成热点来源；没有来源时给出可见反馈。

## Verification
优先补充可在 Node 环境运行的纯逻辑测试，避免引入浏览器测试基础设施：
- RSS 抓取成功后 `selectedHotspotIds` 为空。
- 分类生成选择包含该分类全部文章。
- 合并热点时分类全量选择不会丢失来源。

如果需要手动 UI 验证，启动本地前端并检查首页、热点库、圆桌议程、圆桌稿四条路径在桌面宽度和窄屏下不出现按钮重叠或文本溢出。
