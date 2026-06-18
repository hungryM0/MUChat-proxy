# 本地部署

1. 安装依赖

```bash
npm install
```

2. 创建本地变量文件

```bash
cp .dev.vars.example .dev.vars
```

3. 在 `.dev.vars` 里填信息门户密码

```text
MUC_PASSWORD=门户密码
```

4. 按需修改 `wrangler.jsonc` 里的 `MUC_USERNAME` 和 `API_KEYS`

```jsonc
"vars": {
  "MUC_USERNAME": "学号",
  "API_KEYS": "sk-key"
}
```

5. 启动服务

```bash
npm run dev
```

默认端口号为 `8787`。
