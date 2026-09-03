# Domain Docs

工程类技能在探索本仓库代码前,应该如何消费领域文档。

## 探索前先读这些

- 根目录的 **`CONTEXT.md`**
- **`docs/adr/`** —— 读与你即将改动的区域相关的 ADR

如果这些文件还不存在,**静默继续**。不要提示它们缺失,也不要主动建议创建。`/domain-modeling` 技能(经由 `/grill-with-docs` 和 `/improve-codebase-architecture` 触达)会在术语或决策真正需要落定时按需创建它们。

## 文件布局

本仓库是**单上下文**布局:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-xxx.md
│   └── 0002-xxx.md
├── backend/     ← NestJS 聚合服务
└── frontend/    ← Vite + Vue3 H5
```

`backend/` 和 `frontend/` 虽然是两个独立部署单元(各自 `package.json`,不共享 npm 包),但共享同一套领域词汇 —— 数据源(provider)、归一化天气(normalized weather)、降级(degradation)在两端指的是同一件事,前端的类型定义本身就是后端契约的手抄副本。因此它们共用根目录的一份 `CONTEXT.md`,而不是各自维护一份。

## 使用词汇表里的说法

当你的输出提到某个领域概念(issue 标题、重构提案、假设、测试名),使用 `CONTEXT.md` 里定义的术语,不要漂移到词汇表明确回避的同义词。

如果你需要的概念还不在词汇表里,这是一个信号 —— 要么你在发明这个项目并不使用的语言(请重新考虑),要么确实存在缺口(记下来交给 `/domain-modeling`)。

## 标记 ADR 冲突

如果你的输出与已有 ADR 相矛盾,明确指出来,而不是悄悄覆盖:

> _与 ADR-0007(事件溯源的订单)相矛盾 —— 但值得重新讨论,因为……_
