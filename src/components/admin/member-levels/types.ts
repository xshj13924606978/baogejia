export interface FieldPermission {
  field_key: string;
  field_label: string;
  has_permission: boolean;
  sort_order: number;
}

export interface ModulePermission {
  module_key: string;
  module_label: string;
  has_permission: boolean;
  sort_order: number;
}

export interface MemberLevel {
  level_code: string;
  level_name: string;
  required_points: number;
  sort_order: number;
  is_default: boolean;
  is_enabled: boolean;
  daily_quota: number;
  max_files: number;
  max_chat_messages: number;
  description: string | null;
  field_permissions: FieldPermission[];
  module_permissions: ModulePermission[];
  created_at?: string;
  updated_at?: string;
}

export interface ChangeLogEntry {
  id: string;
  level_code: string | null;
  action: string;
  change_summary: string | null;
  changed_by: string | null;
  created_at: string;
}

export interface BatchUpdateItem {
  level_code: string;
  level_name: string;
  enabled: boolean;
  daily_quota: number;
  max_files: number;
  max_chat_messages: number;
  field_permissions: Record<string, boolean>;
  module_permissions: Record<string, boolean>;
}
