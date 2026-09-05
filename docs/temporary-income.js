(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TemporaryIncomeRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const BIWEEKLY_MONTHLY_FACTOR = 26 / 12;

  function convertBiweeklyToMonthly(amount) {
    return Math.round((Number(amount) || 0) * BIWEEKLY_MONTHLY_FACTOR * 100) / 100;
  }

  function getPersonData(person, data) {
    if (!data) return { enabled: false, startDate: '', endDate: '', amount: 0, isBiweekly: false, biweeklyAmount: null, title: person === 'gabriel' ? 'Gabriel' : 'Luana' };
    const startDate = data[`${person}StartDate`] || data.startDate || '';
    const endDate = data[`${person}EndDate`] || data.endDate || '';
    const amount = Number(data[`${person}Amount`] ?? data[person]) || 0;
    const isBiweekly = Boolean(data[`${person}IsBiweekly`]);
    const hasLegacyPersonData = Boolean(startDate && endDate && (data[`${person}Amount`] !== undefined || data[person] !== undefined));
    return {
      enabled: data[`${person}Enabled`] !== undefined ? Boolean(data[`${person}Enabled`]) : hasLegacyPersonData,
      startDate,
      endDate,
      amount,
      isBiweekly,
      biweeklyAmount: isBiweekly ? Number(data[`${person}BiweeklyAmount`]) || Math.round((amount / BIWEEKLY_MONTHLY_FACTOR) * 100) / 100 : null,
      title: person === 'gabriel' ? 'Gabriel' : 'Luana',
    };
  }

  function isPersonActiveForMonth(month, person, data) {
    if (!data?.enabled || !/^\d{4}-\d{2}$/.test(String(month || ''))) return false;
    const personData = getPersonData(person, data);
    if (!personData.enabled) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(personData.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(personData.endDate)) return false;
    return month >= personData.startDate.substring(0, 7) && month <= personData.endDate.substring(0, 7);
  }

  function getActivePeople(month, data) {
    return ['gabriel', 'luana'].filter((person) => isPersonActiveForMonth(month, person, data));
  }

  function getEffectiveIncome(normalIncome, month, data) {
    const normal = normalIncome || {};
    const activePeople = getActivePeople(month, data);
    if (activePeople.length === 0) return normalIncome || null;

    return {
      month,
      gabriel: activePeople.includes('gabriel') ? getPersonData('gabriel', data).amount : Number(normal.gabriel) || 0,
      luana: activePeople.includes('luana') ? getPersonData('luana', data).amount : Number(normal.luana) || 0,
      temporaryPeople: activePeople,
      isTemporary: true,
    };
  }

  return { convertBiweeklyToMonthly, getPersonData, isPersonActiveForMonth, getActivePeople, getEffectiveIncome };
});
