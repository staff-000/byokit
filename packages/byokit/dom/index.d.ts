import type {
  Catalog,
  CatalogData,
  PickerConfig,
  Selection,
  CredentialStore,
  Offering,
  LocalApi,
  Locale,
} from '../index.js';
export interface ByokOptions {
  catalog: Catalog | CatalogData;
  config?: PickerConfig;
  value?: Selection;
  credentialStore?: CredentialStore;
  credentialRef?: string;
  locale?: Locale;
  labels?: Record<string, string>;
  title?: string;
  assets?: Record<string, string>;
  onSave: (selection: Selection) => void | Promise<void>;
  onChange?: (selection: Selection) => void;
  checkTimeoutMs?: number;
  onCheck?: (
    request: Selection & { apiKey: string; signal: AbortSignal },
  ) => Promise<{ ok: boolean; message?: string }>;
  discoverLocal?: (
    endpoint: string,
    signal: AbortSignal,
    options: { api: import('../index.js').LocalApi },
  ) => Promise<Offering[]>;
}
export function mountByok(
  container: HTMLElement,
  options: ByokOptions,
): { destroy(): void; getSelection(): Selection };

export * from '../index.js';
export { discoverLocal } from './local.js';
