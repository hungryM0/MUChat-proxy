# 本地部署

1. 安装依赖

```bash
npm install
```

2. 按需修改 `wrangler.jsonc` 里的变量

```jsonc
"vars": {
  "MUC_USERNAME": "学号",
  "MUC_PASSWORD": "信息门户密码",
  "API_KEYS": "sk-key"
}
```

3. 启动服务

```bash
npm run dev
```

默认端口号为 `8787`。
