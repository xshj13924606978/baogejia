-- 088_email_settings.sql
-- #[20260828-1345]-1 邮件发送通道配置（数据库动态驱动，不硬编码）
-- SMTP 凭据入库后由服务端读取，动态生效；未配置时 fallback 到 Supabase 内置邮件通道。
create table if not exists email_settings (
  id int primary key default 1 check (id = 1),
  provider text not null default 'supabase' check (provider in ('smtp', 'supabase')),
  smtp_host text,
  smtp_port int default 465,
  smtp_secure boolean default true,
  smtp_user text,
  smtp_password text,
  from_email text,
  from_name text default '报价查询系统',
  enabled boolean default true,
  updated_at timestamptz not null default now()
);

alter table email_settings enable row level security;

create policy "email_settings_service_role_only"
  on email_settings
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 默认一行（provider=supabase，即使用 Supabase 内置邮件通道）
insert into email_settings (id, provider)
values (1, 'supabase')
on conflict (id) do nothing;

comment on table email_settings is '邮件发送通道配置（单行，id=1）。provider=smtp 时使用自定义 SMTP 发送验证邮件；provider=supabase 时使用 Supabase 内置邮件通道';
