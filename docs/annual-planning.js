(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AnnualPlanning = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeYear(value) {
    const year = String(value || '').trim();
    return /^\d{4}$/.test(year) ? year : '';
  }

  function isLegacyOneOffWithoutYear(event) {
    return Boolean(event?.isOneOff && !normalizeYear(event.targetYear));
  }

  function filterEventsForYear(events, selectedYear) {
    const year = normalizeYear(selectedYear);
    return (events || []).filter((event) => {
      if (!event?.isOneOff && !event?.installmentPlanId) return true;
      const targetYear = normalizeYear(event?.targetYear);
      // Recorrentes e eventos únicos antigos sem ano continuam visíveis.
      // Os antigos recebem um aviso na interface até serem editados uma vez.
      return !targetYear || targetYear === year;
    });
  }

  function prepareAnnualEventForSave(event, { isOneOff, targetYear }) {
    const prepared = { ...(event || {}), isOneOff: Boolean(isOneOff) };
    if (isOneOff) {
      const normalizedYear = normalizeYear(targetYear);
      if (!normalizedYear) throw new Error('O ano é obrigatório para um evento único.');
      prepared.targetYear = normalizedYear;
    } else {
      delete prepared.targetYear;
    }
    return prepared;
  }

  function partitionInstallmentPlans(plans) {
    const active = [];
    const completed = [];
    (plans || []).forEach((plan) => {
      const installments = Array.isArray(plan?.installments) ? plan.installments : [];
      if (!installments.length) return;
      const hasFuture = installments.some((entry) => !['paid', 'cancelled'].includes(entry.status));
      if (hasFuture) active.push(plan);
      else if (!plan.archivedAt) completed.push(plan);
    });
    return { active, completed };
  }

  return {
    filterEventsForYear,
    isLegacyOneOffWithoutYear,
    normalizeYear,
    partitionInstallmentPlans,
    prepareAnnualEventForSave,
  };
});
