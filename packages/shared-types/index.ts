export type SupportedBrand = "QQ88" | "78WIN" | "SC88" | "C168" | "CM88" | "F8BET";
export interface LinkedAccount { tk: string; miniCode: string; }
export interface UserProfile { id: string; name: string; balance: number; voucher: number; }
export interface AppRelease {
  id: string;
  platform: string;
  version: string;
  file_name: string;
  file_size: number;
  release_notes: string;
  released_at: string;
}
export interface ApiError { error: string; requestId?: string; }