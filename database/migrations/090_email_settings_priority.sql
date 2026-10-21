-- 090_email_settings_priority.sql
-- #[20260828-1900] email_settings 增加 priority 优先级列
-- 多通道策略：发送时按 priority 升序（数值越小越优先）逐通道尝试，当前通道失败自动降级下一个。
-- 新增通道默认 priority=999（排在最后）；既有行迁移后默认 999，可手动调整。
alter table email_settings add column if not exists priority int default 999;

comment on column email_settings.priority is '通道优先级：数值越小越优先尝试（1=最高）。发送时按 priority, id 升序逐通道降级尝试';
