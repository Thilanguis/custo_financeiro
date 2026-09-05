const test = require('node:test');
const assert = require('node:assert/strict');
const temporaryIncome = require('../docs/temporary-income.js');

const normal = { month: '2026-11', gabriel: 4200, luana: 3900 };
const leave = {
  enabled: true,
  gabrielStartDate: '2026-08-20',
  gabrielEndDate: '2026-10-12',
  gabrielAmount: 2100,
  luanaStartDate: '2026-08-20',
  luanaEndDate: '2027-04-30',
  luanaAmount: 1950,
};

test('aplica a renda temporária de cada pessoa nos meses compartilhados', () => {
  const result = temporaryIncome.getEffectiveIncome(normal, '2026-09', leave);
  assert.equal(result.gabriel, 2100);
  assert.equal(result.luana, 1950);
  assert.deepEqual(result.temporaryPeople, ['gabriel', 'luana']);
});

test('restaura Gabriel e mantém Luana temporária depois do fim do congé dele', () => {
  const result = temporaryIncome.getEffectiveIncome(normal, '2026-11', leave);
  assert.equal(result.gabriel, 4200);
  assert.equal(result.luana, 1950);
  assert.deepEqual(result.temporaryPeople, ['luana']);
});

test('restaura as duas rendas normais depois dos dois períodos', () => {
  assert.equal(temporaryIncome.getEffectiveIncome(normal, '2027-05', leave), normal);
});

test('considera por inteiro os meses inicial e final de cada período', () => {
  assert.equal(temporaryIncome.isPersonActiveForMonth('2026-08', 'gabriel', leave), true);
  assert.equal(temporaryIncome.isPersonActiveForMonth('2026-10', 'gabriel', leave), true);
  assert.equal(temporaryIncome.isPersonActiveForMonth('2026-11', 'gabriel', leave), false);
});

test('lê o formato temporário anterior sem perder valores', () => {
  const legacy = { enabled: true, startDate: '2026-08-20', endDate: '2026-10-12', gabriel: 2100, luana: 1950 };
  const result = temporaryIncome.getEffectiveIncome(normal, '2026-09', legacy);
  assert.equal(result.gabriel, 2100);
  assert.equal(result.luana, 1950);
});

test('converte pagamento bisemanal para o valor mensal considerado', () => {
  assert.equal(temporaryIncome.convertBiweeklyToMonthly(1432.64), 3104.05);
});

test('preserva o valor bisemanal informado para preencher o formulário novamente', () => {
  const data = {
    ...leave,
    gabrielAmount: temporaryIncome.convertBiweeklyToMonthly(1432.64),
    gabrielIsBiweekly: true,
    gabrielBiweeklyAmount: 1432.64,
  };
  const gabriel = temporaryIncome.getPersonData('gabriel', data);
  assert.equal(gabriel.amount, 3104.05);
  assert.equal(gabriel.biweeklyAmount, 1432.64);
  assert.equal(gabriel.isBiweekly, true);
});

test('permite renda temporária somente para uma pessoa', () => {
  const onlyLuana = { ...leave, gabrielEnabled: false, luanaEnabled: true };
  const result = temporaryIncome.getEffectiveIncome(normal, '2026-09', onlyLuana);
  assert.equal(result.gabriel, 4200);
  assert.equal(result.luana, 1950);
  assert.deepEqual(result.temporaryPeople, ['luana']);
});
