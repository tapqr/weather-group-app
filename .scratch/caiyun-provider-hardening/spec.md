# 彩云 Provider 健壮性与可观测性对齐

2026-09-03,对照彩云天气 API v2.6 官方文档(realtime / minutely / hourly / daily / weather /
errors / unit / skycon / precip / coverage / auth 各页)对 `caiyun.provider.ts` 做了逐字段核查。

## 核查结论:数值正确性没有问题

以下全部核对无误,**不需要改**:

- `unit=metric:v2` 的风速单位确为 km/h(单位制表:`metric:v1 = metric:v2 = metric = 公里/小时`),
  代码直接透传不乘 3.6 是对的。历史上那次误乘 3.6 已在 `5f7db39` 修掉
- `humidity` 文档写明 0~1,代码 `Math.round(humidity * 100)` 正确
- `skycon` 完整枚举正好 20 项,与 `SKYCON_TEXT` **逐项一一对应**,中文文案也与文档一致,
  不会出现把英文枚举名当中文显示给用户的情况
- daily 温度结构 `{date, max, min, avg}`,代码取 `min`/`max` 正确
- 请求地址、API 版本、**经度在前纬度在后**、`hourlysteps=24`(文档要求 24 的整数倍)、
  `dailysteps=3`(文档允许 1~16)全部正确
- 时间格式:hourly `datetime`、daily `date` 都带目标地点时区偏移,`slice(0,10)` 截出的是当地日期,正确
- `precipitation` 的 `local`/`nearest` 结构和 `intensity` 单位核对无误(代码没用到这组字段)

## 一个曾被怀疑、已实测证伪的点

`daily.precipitation[].probability` 的取值范围**官方文档中英文两版都没写**(hourly 页写明了
0~100,daily 页只说"每项包含 max、min、avg、probability")。v2.5 的 daily 里根本没有这个字段,
没有历史文档可参照。

2026-09-03 用真实 token 实测多个城市:

```
广州  daily=[0, 70, 60]   hourly 最大 80
昆明  daily=[60, 0, 60]   hourly 70
厦门  daily=[70, 80, 80]  hourly 52/60/80/70   skycon=LIGHT_RAIN
北京  daily=[0, 0, 0]     全晴,无效样本
```

出现 60/70/80 这样的值,**证明它就是 0~100,和 hourly 同量纲,现有代码是对的**。

建议在代码里加一行注释锁死这个结论 —— 文档没写,下一个人还会怀疑。
现有测试 `caiyun.provider.spec.ts` 用的 `probability: 10` 在两种量纲下都"看起来正常",
测不出问题,可以换成 70 这类只可能是百分数的值。

## 真正要修的四条

见 `issues/` 下的 01~04。前两条的共同点是:**和风侧都做了,彩云侧没做** ——
同一个聚合服务里两个 Provider 的健壮性和可观测性不在一个水平线上,这种不对称本身就是缺陷。
