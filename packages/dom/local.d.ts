import type {Offering} from '@byokit/core';
export function discoverLocal(endpoint:string,options?:{runtime?:'ollama'|'openai-compatible';fetch?:typeof fetch;signal?:AbortSignal;allowRemote?:boolean}):Promise<Offering[]>;
