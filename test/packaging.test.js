import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Alexa interaction model and ASK CLI package stay in sync', async () => {
  const manualModel = JSON.parse(await readFile('alexa/interaction-model.json', 'utf8'));
  const packagedModel = JSON.parse(await readFile('skill-package/interactionModels/custom/en-US.json', 'utf8'));
  assert.deepEqual(packagedModel, manualModel);
});
test('ASK CLI package has placeholder endpoint that docs tell users to replace', async () => {
  const skill = JSON.parse(await readFile('skill-package/skill.json', 'utf8'));
  assert.equal(skill.manifest.apis.custom.endpoint.uri, 'https://YOUR_DOMAIN/alexa');
  assert.equal(skill.manifest.apis.custom.endpoint.sslCertificateType, 'Trusted');
});
