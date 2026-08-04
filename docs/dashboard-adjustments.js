// Ajustes do painel Livre e da separação entre cartões pendentes e pagos.
(() => {
  const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

  getCreditCardPaymentInfo = function (snapshot, paymentRecords = creditCardPayments) {
    const statement = snapshot.statement || findCardStatement(snapshot.card.id, snapshot.dueMonth);
    const totals = snapshot?.state?.closedTotals || CardStatements.getStatementTotals(statement || { calculatedAmount: snapshot.total });
    const record = paymentRecords[snapshot.card.id] || null;
    const dueDate = getCreditCardInvoiceDueDate(snapshot.card, snapshot.dueMonth);
    const paidAmount = roundMoney(totals.paid);
    const remaining = roundMoney(totals.remaining);
    const creditAmount = roundMoney(totals.credit);
    const billedAmount = roundMoney(Math.max(0, (Number(totals.openingApplied) || 0) + (Number(totals.amount) || 0)));

    let status = 'Sem fatura';
    let statusClass = 'is-empty';

    if (billedAmount > 0.005 || paidAmount > 0.005 || remaining > 0.005) {
      if (remaining <= 0.005) {
        status = creditAmount > 0.005 ? 'Paga · crédito' : 'Paga';
        statusClass = 'is-paid';
      } else if (paidAmount > 0.005) {
        status = 'Paga parcialmente';
        statusClass = 'is-partial';
      } else {
        status = 'A pagar';
        statusClass = dueDate && getTodayISO() > dueDate ? 'is-overdue' : 'is-pending';
      }
    } else if (creditAmount > 0.005) {
      status = 'Crédito';
      statusClass = 'is-paid';
    }

    return { record, statement, dueDate, billedAmount, paidAmount, remaining, creditAmount, status, statusClass };
  };

  getCreditCardInvoicesForMonth = function (month) {
    return paymentMethods
      .filter((method) => method.type === 'credito')
      .map((card) => {
        const invoice = getCreditCardInvoiceSnapshot(card, month);
        return { ...invoice, payment: getCreditCardPaymentInfo(invoice) };
      })
      .filter(
        (invoice) =>
          invoice.state.isClosed &&
          (invoice.payment.billedAmount > 0.005 || invoice.payment.paidAmount > 0.005 || invoice.payment.remaining > 0.005 || invoice.payment.creditAmount > 0.005),
      );
  };

  renderFreeProjectionDetails = function (month, pendingItems, projectedBalance) {
    const details = document.getElementById('summary-fixed-details');
    const freeCard = document.querySelector('.dash-item-free');
    const arrow = document.getElementById('summary-free-projection-arrow');
    const afterFixed = document.getElementById('summary-free-after-fixed');
    const oldCardsDue = document.getElementById('summary-credit-cards-due');
    const hasPendingItems = pendingItems.length > 0;
    const cardInvoices = getCreditCardInvoicesForMonth(month);
    const pendingCardInvoices = cardInvoices.filter((invoice) => invoice.payment.remaining > 0.005);
    const paidCardInvoices = cardInvoices.filter((invoice) => invoice.payment.remaining <= 0.005);
    const hasCreditCards = cardInvoices.length > 0;
    const hasDetails = hasPendingItems || hasCreditCards;
    const cardsRemainingTotal = roundMoney(pendingCardInvoices.reduce((sum, invoice) => sum + invoice.payment.remaining, 0));
    const projectedAfterFixedAndCards = roundMoney(projectedBalance - cardsRemainingTotal);

    if (!summaryFreeProjectionToggle || !details || !freeCard || !arrow) return;

    if (oldCardsDue) {
      oldCardsDue.textContent = '';
      oldCardsDue.classList.remove('visible');
    }

    if (!hasDetails) isFreeProjectionExpanded = false;

    summaryFreeProjectionToggle.classList.toggle('is-available', hasDetails);
    summaryFreeProjectionToggle.setAttribute('aria-disabled', String(!hasDetails));
    summaryFreeProjectionToggle.setAttribute('aria-expanded', String(hasDetails && isFreeProjectionExpanded));
    summaryFreeProjectionToggle.title = hasDetails ? 'Ver fixos pendentes e faturas de cartões' : 'Nenhum compromisso pendente';
    arrow.textContent = isFreeProjectionExpanded ? '▼' : '▶';

    if (afterFixed) {
      afterFixed.textContent = hasDetails ? `Após fixos e cartões: ${formatCurrency(projectedAfterFixedAndCards)}` : '';
      afterFixed.classList.toggle('visible', hasDetails);
    }

    if (!hasDetails || !isFreeProjectionExpanded) {
      details.innerHTML = '';
      details.classList.remove('visible');
      freeCard.classList.remove('is-expanded');
      return;
    }

    const projectionEnd = hasPendingItems ? getPendingFixedProjectionEnd(month, pendingItems) : '';
    const fixedRows = [...pendingItems]
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .map((item) => {
        const percent = (item.actualAmount / item.amount) * 100;
        const visualPercent = Math.min(percent, 100);
        const roundedPercent = Math.round(percent * 100) / 100;
        const progressClass = roundedPercent < 100 ? 'progress-safe' : roundedPercent === 100 ? 'progress-warning' : 'progress-danger';
        const differenceAmount = roundMoney(item.amount - item.actualAmount);
        const differenceClass = differenceAmount > 0 ? 'positive' : differenceAmount === 0 ? 'neutral' : 'negative';
        const actualDisplay = item.actualAmount === 0 ? formatCurrency(0) : `- ${formatCurrency(item.actualAmount)}`;

        return `
          <tr>
            <td class="dash-fixed-name">
              <span>${escapeCardDetail(item.description)}</span>
              <div class="dash-fixed-progress"><span class="${progressClass}" style="width: ${visualPercent}%;"></span></div>
            </td>
            <td>${formatCurrency(item.amount)}</td>
            <td class="dash-fixed-real ${item.actualAmount === 0 ? 'is-zero' : ''}">${actualDisplay}</td>
            <td class="dash-fixed-difference ${differenceClass}">${formatCurrency(differenceAmount)}</td>
          </tr>`;
      })
      .join('');

    const renderCardRows = (invoices) =>
      invoices
        .map((invoice) => {
          const payment = invoice.payment;
          const dueLabel = payment.dueDate ? payment.dueDate.split('-').reverse().join('/') : '—';

          return `<tr>
            <td class="dash-fixed-name"><span>${escapeCardDetail(invoice.card.name)}</span><small>Vence em ${dueLabel}</small></td>
            <td>${formatCurrency(payment.billedAmount)}</td>
            <td>${formatCurrency(payment.paidAmount)}</td>
            <td>${formatCurrency(payment.remaining)}</td>
            <td><span class="credit-card-status ${payment.statusClass}">${payment.status}</span></td>
          </tr>`;
        })
        .join('');

    const pendingCardRows = renderCardRows(pendingCardInvoices);
    const paidCardRows = renderCardRows(paidCardInvoices);
    const cardTableHead = '<thead><tr><th>Cartão</th><th>Fatura</th><th>Pago</th><th>Restante</th><th>Situação</th></tr></thead>';

    details.innerHTML = `
      ${
        hasPendingItems
          ? `<div class="dash-free-details-title">Fixos pendentes até ${formatShortDate(projectionEnd)}</div>
             <table class="dash-fixed-table"><thead><tr><th>Fixo</th><th>Prev.</th><th>Real</th><th>Diferença</th></tr></thead><tbody>${fixedRows}</tbody></table>`
          : ''
      }
      ${
        hasCreditCards
          ? `<div class="dash-free-details-title dash-card-invoices-title">Cartões do mês <small>Pendentes entram na projeção; pagos ficam apenas no histórico.</small></div>
             <div class="dash-card-group-title is-pending"><span>Pendentes</span><strong>${formatCurrency(cardsRemainingTotal)}</strong></div>
             ${pendingCardRows ? `<div class="dash-card-table-scroll"><table class="dash-fixed-table dash-card-invoices-table">${cardTableHead}<tbody>${pendingCardRows}</tbody></table></div>` : '<div class="dash-card-empty">Nenhuma fatura pendente.</div>'}
             <div class="dash-card-group-title is-paid"><span>Pagos</span><strong>${paidCardInvoices.length}</strong></div>
             ${paidCardRows ? `<div class="dash-card-table-scroll"><table class="dash-fixed-table dash-card-invoices-table">${cardTableHead}<tbody>${paidCardRows}</tbody></table></div>` : '<div class="dash-card-empty">Nenhuma fatura paga neste mês.</div>'}`
          : ''
      }
    `;

    details.classList.add('visible');
    freeCard.classList.add('is-expanded');
  };
})();
