import * as byokit from 'byokit/catalog';
const models = byokit.getModels();
console.log(
  JSON.stringify(
    models.map((model) => model.provider.id),
    null,
    2,
  ),
);
