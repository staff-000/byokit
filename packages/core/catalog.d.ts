import type {CatalogData,PickerConfig,ModelOption,ModelList} from './index.js';
declare const catalog:CatalogData;export default catalog;
export function getModels(config?:PickerConfig):ModelOption[];
export function getModels(list:ModelList,config?:PickerConfig):ModelOption[];
export * from './index.js';
