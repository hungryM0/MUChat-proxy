# MUChat Proxy

> 原仓库地址：https://github.com/Kenxu2022/MUChat

中央民族大学 [AI 民大](https://so.muc.edu.cn/aiqa/#/micro-app/ai-deepseek) 服务的 Cloudflare Worker 代理，提供 OpenAI 兼容聊天接口。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/hungryM0/MUChat-proxy)

## 一键部署

1. 点击上面的 `Deploy to Cloudflare` 按钮
2. 部署完成后进入 `Settings` -> `Variables and Secrets`
3. 在 `Variables` 里新增：

```text
API_KEYS=你的API Key
```

如果要放多个 Key，用英文逗号隔开：

```text
API_KEYS=sk-key-1,sk-key-2,sk-key-3
```

4. 在 `Secrets` 里分别新增两个密钥：

- `MUC_USERNAME`：学号
- `MUC_PASSWORD`：门户密码

5. 保存后，回到项目页面重新部署一次
6. 以后调用接口时，用这个地址拼接口路径：

```text
https://你的-worker-地址/v1/chat/completions
```

| 功能 | 本地部署 | Cloudflare 部署 |
| --- | --- | --- |
| 直接对外提供接口 | ❌ | ✅ |
| 适合长期运行 | ❌ | ✅ |
| 公网访问 | ❌ | ✅ |
| 环境依赖更少 | ❌ | ✅ |
| 配置管理更方便 | ❌ | ✅ |
| 账号密码保护更省心 | ❌ | ✅ |
| 多设备调用 | ❌ | ✅ |

## 功能

- Bearer API Key 鉴权
- 支持模型列表 ：
  - `deepseek-v3-minda`
  - `deepseek-r1-minda`
- 支持 `stream: true` 的 OpenAI 风格 SSE 流式输出
- `deepseek-r1-minda` **不返回思考内容**，只返回最终答案

## Serverless 架构

项目运行在 Cloudflare Workers 上，不需要自建服务器。Worker 负责接收 OpenAI 兼容请求，先校验 Bearer API Key，再把消息转换成 AI 民大上游接口需要的格式。

登录态由 Durable Object 缓存。请求到来时，Worker 会复用有效的 access token；token 过期后使用 `MUC_USERNAME` 和 `MUC_PASSWORD` 自动刷新，减少重复登录，避免把账密信息暴露给调用方。

## 接口

### 聊天接口

```text
POST /v1/chat/completions
Authorization: Bearer <your-key>
Content-Type: application/json
```

`curl` 调用示例：

```bash
curl https://你的-worker-地址/v1/chat/completions \
  -H "Authorization: Bearer 你的API Key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-v3-minda",
    "messages": [
      {
        "role": "user",
        "content": "你好"
      }
    ],
    "stream": false
  }'
```

成功时：

- `stream: false` 返回一整段 JSON
- `stream: true` 返回 OpenAI 风格的 SSE 数据流

### 健康检查

```text
GET /healthz
```

健康检查示例：

```bash
curl https://你的-worker-地址/healthz
```

## 本地部署

见 [docs/local-deployment.md](./docs/local-deployment.md)

## 许可证

GPL-3.0
