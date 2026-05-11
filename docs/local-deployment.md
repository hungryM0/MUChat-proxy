# 本地部署

1. 安装依赖

```bash
npm install
```

2. 创建本地变量文件

```bash
cp .dev.vars.example .dev.vars
```

3. 填账号密码

```text
MUC_USERNAME=学号
MUC_PASSWORD=门户密码
```

4. 按需修改 `wrangler.jsonc` 里的 `API_KEYS`

```jsonc
"vars": {
  "API_KEYS": "sk-key-1,sk-key-2,sk-key-3"
}
```

5. 启动服务

```bash
npm run dev
```

默认地址通常是 `http://127.0.0.1:8787`。
