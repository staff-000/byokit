import type { CatalogData, PickerConfig, ModelOption, ModelList, Catalog } from './index.js';
declare const catalogData: CatalogData;
export default catalogData;
export const catalog: Catalog;
export function getModels(config?: PickerConfig): ModelOption[];
export function getModels(list: ModelList, config?: PickerConfig): ModelOption[];
export * from './index.js';
