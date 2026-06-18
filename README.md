# MUChat Proxy

> 原仓库地址：https://github.com/Kenxu2022/MUChat

中央民族大学 [AI 民大](https://so.muc.edu.cn/aiqa/#/micro-app/ai-deepseek) 服务的 Cloudflare Worker 代理，提供 OpenAI 兼容聊天接口。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/hungryM0/MUChat-proxy)

## 一键部署

1. 点击上面的 `Deploy to Cloudflare` 按钮
2. 按部署页面提示填写：

```text
MUC_USERNAME=学号
MUC_PASSWORD=信息门户密码
API_KEYS=鉴权令牌
```

3. 接口路径：

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

项目运行在 Cloudflare Workers ，因此无需自备服务器

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
