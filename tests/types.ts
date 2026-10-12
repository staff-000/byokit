import {Catalog,checkFit,PickerConfig,FeatureName} from '@byokit/core';
import {mountByok} from '@byokit/dom';
const config:PickerConfig={preset:'china',filters:{input:['image'],requiredFeatures:['functionCalling']},ui:{maxProviders:8}};
declare const catalog:Catalog;
checkFit(catalog.get('test/model'),{inputTokens:1000});
mountByok(document.createElement('div'),{catalog,config,onSave:selection=>{console.log(selection.credentialRef)}});
// @ts-expect-error invalid known feature names are rejected
const bad:FeatureName='magic';
