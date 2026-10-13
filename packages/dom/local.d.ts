import type {Offering,LocalRuntime} from '@byokit/core';
export function discoverLocal(endpoint:string,options?:{runtime?:LocalRuntime;fetch?:typeof fetch;signal?:AbortSignal;allowRemote?:boolean}):Promise<Offering[]>;
