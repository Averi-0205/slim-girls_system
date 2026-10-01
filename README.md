# 轻盈 · 体重管理系统

这是一个部署在 GitHub Pages 上的静态单页应用，使用 Supabase Auth 登录，并将每位用户的数据保存到 Supabase PostgreSQL。

## Supabase 配置

1. 在 Supabase Dashboard 打开 SQL Editor，执行仓库中的 `schema.sql`。
2. 打开 `Authentication` → `Providers`，确认 `Email` 已启用。
3. 打开 `Authentication` → `URL Configuration`，将 Site URL 设置为：

   `https://averi-0205.github.io/slim-girls_system/slim%20girls_system.html`

4. 在 Redirect URLs 中加入同一地址，并按需加入本地开发地址。
5. 如果启用了邮箱确认，注册后需要先在邮箱中点击确认链接。

## 文件说明

- `slim girls_system.html`：页面结构与样式。
- `app.js`：登录、数据读写和界面交互。
- `supabase.js`：固定版本的 Supabase 浏览器 SDK。
- `schema.sql`：数据库表、权限和 RLS 策略。

Supabase Project URL 和 publishable key 只用于前端公开访问；不要将 `service_role` key 写入前端文件。
