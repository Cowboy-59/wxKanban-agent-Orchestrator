export type SettingType = "boolean" | "default" | "report_header" | "image";

export interface Setting {
  name: string;
  type: SettingType;
  value: string;
  description?: string;
}
