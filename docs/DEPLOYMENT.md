# 部署说明(nginx + PM2,子路径)

目标形态:

```
前端页面  https://<域名>/weather-app/
后端接口  https://<域名>/weather-app/api/weather
          https://<域名>/weather-app/api/geo/reverse|search|top
```

前后端**同域**,所以浏览器不会发起跨域请求,生产环境不需要 CORS。

## 为什么接口要多一层 `/api`

后端本身有一个叫 `/weather` 的接口。如果站点前缀也是 `/weather`,nginx 就无法区分"这是页面"还是"这是接口"。多加一层 `/api` 把两者彻底分开,同时后端日志里的路径也和外部路径对得上,便于排查。

## 一、前端构建

**站点前缀是构建时写死的**,不是运行时读的 —— 改了前缀必须重新构建。

```bash
cd frontend
npm ci
VITE_BASE_PATH=/weather-app/ VITE_API_BASE_URL=/weather-app/api npm run build
```

两个变量各管一件事:

| 变量 | 作用 | 漏了会怎样 |
|---|---|---|
| `VITE_BASE_PATH` | 产物里静态资源的引用前缀 | `index.html` 去根路径找 `/assets/*.js`,整页白屏 |
| `VITE_API_BASE_URL` | 前端请求后端的地址 | 前端去 `http://localhost:3000` 发请求,线上必然失败 |

`VITE_API_BASE_URL` 用的是**相对路径**(`/weather-app/api`,不带域名),这样同域请求不触发 CORS,换域名也不用重新构建。

构建完把 `frontend/dist/` 的内容传到服务器:

```bash
rsync -av --delete frontend/dist/ user@server:/var/www/weather-app/
```

验证产物前缀正确:

```bash
grep -o 'src="[^"]*"' frontend/dist/index.html
# 应输出 src="/weather-app/assets/index-xxxx.js"
```

## 二、后端部署

```bash
cd backend
npm ci
npm run build          # 产出 dist/
cp .env.example .env   # 填入真实凭据
```

`.env` 里生产环境需要额外设置:

```bash
API_PREFIX=api                       # 接口挂到 /api 下,与 nginx 的 proxy_pass 对应
CORS_ORIGIN=https://<域名>           # 同域时不生效,但配对了没坏处
```

`API_PREFIX` **默认为空**,所以本地开发不受影响(接口仍在 `/weather`、`/geo/*`)。只有生产才设成 `api`。

三个凭据(`QWEATHER_API_HOST`、`QWEATHER_API_KEY`、`CAIYUN_TOKEN`)缺任意一个会**启动即失败**,不会带着空凭据跑起来 —— 这是有意设计,部署流水线要确保它们已注入。

### 用 PM2 启动

```bash
cd backend
mkdir -p logs
pm2 start ecosystem.config.cjs --env production
pm2 save                 # 保存当前进程列表
pm2 startup              # 按它输出的命令执行一次(需要 root),实现开机自启
```

配置在 `backend/ecosystem.config.cjs`。**注意它必须叫 `.cjs`** —— `backend/package.json` 是 `"type": "module"`,而 PM2 用 `require()` 读配置,叫 `.js` 会直接报错。

### ⚠️ 不要开 cluster 或多实例

`instances` 必须保持 `1`。这个服务有两处**进程内状态**:

1. **限流** —— `@nestjs/throttler` 默认用内存计数。开 4 个进程,每个独立计数,`GEO_THROTTLE_LIMIT=20` 实际会变成 80。
2. **缓存** —— `@cacheable/memory` 的 LRU 也在进程内。多进程各持一份,命中率骤降,**打给和风/彩云的真实请求量翻几倍**,免费额度会被刷穿。

而且它是 IO 密集型(等第三方 API 返回)而非 CPU 密集型,多核收益本来就有限。真要横向扩展,得先把限流和缓存都迁到 Redis(`@nestjs/throttler` 有 Redis storage,cache-manager 可换 Keyv Redis)。

### 日志轮转(必做)

PM2 默认**不会**轮转日志,时间长了会撑爆磁盘:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14
```

## 三、nginx

配置片段见 [`deploy/nginx.conf.example`](../deploy/nginx.conf.example),两个 `location` 放进现有 server 块即可,可与同域名下的其他站点共存。

两个最容易出错的点:

**`proxy_pass` 末尾的斜杠不能少。** `proxy_pass http://127.0.0.1:3000/api/;` 会把匹配到的 `/weather-app/api/` **替换**成 `/api/`,后端收到 `/api/weather`,正好对应 `API_PREFIX=api`。写成 `proxy_pass http://127.0.0.1:3000;`(无末尾路径)则原样透传,后端收到 `/weather-app/api/weather` 而 404。

**必须转发 `X-Forwarded-For`。** 后端 `main.ts` 里设了 `trust proxy`,靠这个头拿真实客户端 IP。不转发的话所有请求都算到 nginx 的 IP 上,**按 IP 限流会退化成全站共享一个额度**。

改完:

```bash
nginx -t && systemctl reload nginx
```

## 四、部署后验证

```bash
# 页面能打开,且资源路径带前缀
curl -sI https://<域名>/weather-app/ | head -1
curl -s https://<域名>/weather-app/ | grep -o 'src="[^"]*"'

# 接口通
curl -s 'https://<域名>/weather-app/api/weather?lat=39.9042&lon=116.4074' | head -c 200
curl -s 'https://<域名>/weather-app/api/geo/reverse?lat=39.9042&lon=116.4074'

# 参数校验仍在(应返回 400)
curl -s -o /dev/null -w '%{http_code}\n' 'https://<域名>/weather-app/api/geo/search?q='

# 真实 IP 有没有透传:连打 31 次,第 31 次应为 429。
# 如果全是 200,说明 X-Forwarded-For 没配对,限流按 nginx 的 IP 在算
for i in $(seq 1 31); do
  curl -s -o /dev/null -w '%{http_code} ' "https://<域名>/weather-app/api/weather?lat=39.9042&lon=116.4074"
done; echo
```

最后一条是最容易被忽略、也最值得跑的 —— 限流失效在功能上完全看不出来,只会在月底账单或免费额度耗尽时才暴露。

## 五、更新发布

```bash
# 前端
cd frontend && npm ci && VITE_BASE_PATH=/weather-app/ VITE_API_BASE_URL=/weather-app/api npm run build
rsync -av --delete dist/ user@server:/var/www/weather-app/

# 后端
cd backend && npm ci && npm run build
pm2 reload weather-app-api
```

`pm2 reload` 比 `restart` 温和,但 fork 模式下仍有极短暂的中断 —— 这个应用可以接受。

## 常见故障对照

| 现象 | 多半是 |
|---|---|
| 页面白屏,控制台报 `/assets/*.js` 404 | 构建时漏了 `VITE_BASE_PATH` |
| 页面正常,但数据加载失败、请求打向 `localhost:3000` | 构建时漏了 `VITE_API_BASE_URL` |
| 接口 404 | `proxy_pass` 末尾少了 `/api/`,或后端没设 `API_PREFIX=api` |
| 接口 502 | 后端没起来 —— `pm2 logs weather-app-api` 看;多半是 `.env` 缺凭据导致启动即失败 |
| 限流从不触发 | nginx 没转发 `X-Forwarded-For` |
| 上游额度消耗异常快 | 检查 `instances` 是不是被改成了大于 1 |
