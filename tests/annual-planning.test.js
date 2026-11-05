const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const AnnualPlanning = require('../docs/annual-planning.js');

test('eventos recorrentes aparecem em qualquer ano selecionado e ignoram ano antigo', () => {
  const recurring = { id: 'annual', name: 'IPTU', monthTarget: '02', isOneOff: false, targetYear: '2025' };
  assert.deepEqual(AnnualPlanning.filterEventsForYear([recurring], 2026), [recurring]);
  assert.deepEqual(AnnualPlanning.filterEventsForYear([recurring], 2027), [recurring]);
});

test('evento único preserva o ano e aparece somente nele', () => {
  const saved = AnnualPlanning.prepareAnnualEventForSave({ name: 'Academia' }, { isOneOff: true, targetYear: '2027' });
  assert.equal(saved.targetYear, '2027');
  assert.deepEqual(AnnualPlanning.filterEventsForYear([saved], 2026), []);
  assert.deepEqual(AnnualPlanning.filterEventsForYear([saved], 2027), [saved]);
});

test('evento recorrente remove um ano antigo ao salvar', () => {
  const saved = AnnualPlanning.prepareAnnualEventForSave({ name: 'IPTU', targetYear: '2027' }, { isOneOff: false, targetYear: '2027' });
  assert.equal(saved.isOneOff, false);
  assert.equal(Object.hasOwn(saved, 'targetYear'), false);
});

test('evento único antigo sem ano não é migrado por adivinhação', () => {
  const legacy = { id: 'legacy', name: 'Academia', isOneOff: true };
  assert.equal(AnnualPlanning.isLegacyOneOffWithoutYear(legacy), true);
  assert.deepEqual(AnnualPlanning.filterEventsForYear([legacy], 2026), [legacy]);
  assert.deepEqual(AnnualPlanning.filterEventsForYear([legacy], 2027), [legacy]);
  assert.throws(() => AnnualPlanning.prepareAnnualEventForSave(legacy, { isOneOff: true, targetYear: '' }), /ano é obrigatório/i);
});

test('parcelamentos concluídos permanecem consultáveis até serem arquivados', () => {
  const active = { id: 'active', installments: [{ status: 'paid' }, { status: 'pending' }] };
  const completed = { id: 'completed', installments: [{ status: 'paid' }, { status: 'paid' }] };
  const archived = { id: 'archived', archivedAt: '2026-11-04T10:00:00.000Z', installments: [{ status: 'paid' }] };
  const result = AnnualPlanning.partitionInstallmentPlans([active, completed, archived]);
  assert.deepEqual(result.active.map((plan) => plan.id), ['active']);
  assert.deepEqual(result.completed.map((plan) => plan.id), ['completed']);
});

test('remoção de concluído arquiva o plano sem apagar Notas ou Orçamento', () => {
  const source = fs.readFileSync(path.join(__dirname, '../docs/app.js'), 'utf8');
  const start = source.indexOf('window.archiveCompletedInstallmentPlan');
  const end = source.indexOf('window.startEditInstallmentPlan', start);
  const implementation = source.slice(start, end);
  assert.match(implementation, /FinanceAPI\.saveInstallmentPlan/);
  assert.match(implementation, /archivedAt/);
  assert.doesNotMatch(implementation, /deleteReceipt|deletePlanned|deleteInstallmentPlan/);
});
