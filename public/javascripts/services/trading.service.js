class Trading {
  constructor() {
    this.$tradingForm = $('.trading-form');
  }

  init() {
    const $searchBlock = $('.instruments-container .search');

    if (!$searchBlock.length) {
      alert(`No block for appending button (${Trading.name})`);
      return;
    }

    $searchBlock.append(Trading.getShowTradingFormButton());
    this.$tradingForm.width($searchBlock.width());
  }

  loadInstrumentData(instrumentDoc) {
    if (!instrumentDoc) {
      return;
    }

    this.$tradingForm.find('.action-block .buy input').val(instrumentDoc.price);
    this.$tradingForm.find('.action-block .sell input').val(instrumentDoc.price);
  }

  static getShowTradingFormButton() {
    return '<button id="show-trading-form"><img src="/images/settings.png" alt="settings" /></button>';
  }
}
