# store 的 loadWeather 没有世代机制,并发加载时数据会错配

Status: ready-for-agent
来源: 2026-09-03 geo 功能整分支终审的复审推演(超出该次修复范围,单独排期)

## 问题

`frontend/src/stores/weather.ts` 的 `loadWeather` 没有任何世代号或取消机制。同一时刻发出的
两次加载,谁后返回谁就写 `this.providers`,与谁是"用户最后选的那个城市"无关。

`App.vue` 已经用 `selectionSeq` 修掉了**标题**侧的同类竞态(迟到的坐标反查不再覆盖用户手选的
城市名),但**数据**侧没有对应的仲裁。

## 复现

1. 页面加载,定位成功,`loadWeather(北京)` 发出
2. 请求在途时用户打开搜索层选了"上海",`loadWeather(上海)` 发出
3. 上海的响应先到(命中缓存,9ms),北京的后到(冷启 1.1s)
4. `providers` 被北京的数据覆盖,而 `cityName` 是"上海"

结果:标题写着上海,卡片是北京的天气。与终审那条 Critical 症状相同,只是发生在数据侧。

后端缓存让这个时序完全现实:命中缓存约 9ms、冷启约 1.1s,两者差两个数量级。

## 建议

给 `loadWeather` 加与 `App.vue` 同款的世代号:action 开头 `const seq = ++this.loadSeq`,
写入 `providers`/`status`/`errorMessage` 之前检查 `seq === this.loadSeq`,过期的直接丢弃。
注意 `cityName` 的写入时机要和它保持一致,否则会制造新的错配。

补测试:构造两次并发 `loadWeather`,让第一次晚于第二次 resolve,断言 `providers` 是第二次的。
