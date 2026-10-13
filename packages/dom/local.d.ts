import type {Offering,LocalRuntime,LocalApi} from '@byokit/core';
export function discoverLocal(endpoint:string,options?:{runtime?:LocalRuntime;api?:LocalApi;runningOnly?:boolean;fetch?:typeof fetch;signal?:AbortSignal;allowRemote?:boolean}):Promise<Offering[]>;
