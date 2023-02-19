/* global
functions, saveAs,
objects, moment,
classes, TradingDemo
*/

class TradingDemoList {
  constructor(pageKey = 'localhost') {
    this.$tradingList = $('.trading-list');
    this.$tradingStatistics = $('.trading-statistics');

    this.trading = false;
    this.filterValue = '';
    this.lastStrategyId = this.filterValue;
    this.localStorageKey = `trading-helper:${pageKey}:transactions`;
  }

  init(tradingObj) {
    this.loadTradingListHandlers();

    this.trading = tradingObj;
    this.trading.transactions = this.getTransactions();
    this.trading.transactions.forEach(transaction => this.addTradesToTradeList(transaction, transaction.trades));
    this.updateCommonStatistics();
  }

  clear() {
    this.setTransactions([]);

    this.trading.transactions = [];
    this.$tradingList.find('tr.trade').remove();

    this.updateCommonStatistics();
  }

  export() {
    if (!this.trading.transactions.length) {
      return true;
    }

    const todayDate = moment().format('DD.MM.YYYY');

    const file = new File(
      [JSON.stringify(this.trading.transactions)],
      `${todayDate}.json`,
      { type: 'text/plain;charset=utf-8' },
    );

    saveAs(file);
  }

  import() {}

  addTradesToTradeList(transaction, trades = []) {
    let appendStr = '';

    let currentIndex = 1;
    const $firstElement = this.$tradingList.find('table tr.trade:first');

    if ($firstElement.length) {
      const transactionId = $firstElement.data('transactionid');
      const index = parseInt($firstElement.find('.index').text(), 10);
      currentIndex = transactionId === transaction.id ? index : index + 1;
    }

    trades.forEach(trade => {
      const profit = TradingDemo.calculateTradeProfit(trade);
      const profitPercent = TradingDemo.calculateTradeProfitPercent(transaction, trade);

      appendStr += `<tr class="trade transaction-${transaction.id}" data-transactionid="${transaction.id}" id="trade-${trade.id}">
        <td class="index">${currentIndex}</td>
        <td class="strategy"><input type="text" placeholder="${transaction.strategyId || ''}"></td>
        <td class="name">${transaction.instrumentName || ''}</td>
        <td class="number-trades"><span>1</span></td>
        <td class="profit"><span>${profit.toFixed(2)}</span>$</td>
        <td class="profit-percent"><span>${profitPercent}</span>%</td>
        <td class="type ${transaction.isLong ? 'long' : ''}">${transaction.isLong ? 'long' : 'short'}</td>
        <td class="status ${trade.isActive ? 'is_active' : ''}"></td>
        <td class="commission">${trade.sumCommissions.toFixed(4)}</td>
        <td>${moment.unix(trade.startedAtUnix).utc().format('DD.MM.YY HH:mm')}</td>
        <td class="end-at">${trade.endedAtUnix ? moment.unix(trade.endedAtUnix).utc().format('DD.MM.YY HH:mm') : ''}</td>
      </tr>`;
    });

    this.$tradingList.find('table tr:first').after(appendStr);
  }

  removeTradesFromTradeList(transactions = []) {
    transactions.forEach(transaction => {
      this.$tradingList.find(`.transaction-${transaction.id}`).remove();
    });
  }

  updateTradesInTradeList(transaction, trades = []) {
    trades.forEach(trade => {
      const $trade = $(`#trade-${trade.id}`);

      const profit = TradingDemo.calculateTradeProfit(trade);
      const profitPercent = TradingDemo.calculateTradeProfitPercent(transaction, trade);

      // $transaction.find('.number-trades span').text(transaction.trades.length);
      $trade.find('.profit span').text(profit.toFixed(2));
      $trade.find('.profit-percent span').text(profitPercent);

      $trade.find('.commission').text(trade.sumCommissions.toFixed(4));

      if (trade.endedAtUnix) {
        const endedAt = moment.unix(trade.endedAtUnix).utc().format('DD.MM.YY HH:mm');
        $trade.find('.end-at').text(endedAt);
      }

      if (trade.isActive) {
        $trade.find('.status').addClass('is_active');
      } else {
        $trade.find('.status').removeClass('is_active');
      }
    });
  }

  updateCommonStatistics() {
    let profit = 0;
    let sumCommissions = 0;
    const transactionsRelation = [0, 0]; // [win, lose]

    let minProfit = 0;
    let maxProfit = 0;

    this.trading.transactions
      .filter(transaction => !transaction.isActive)
      .sort((a, b) => a.startedAtUnix > b.startedAtUnix ? 1 : -1)
      .forEach(transaction => {
        const transactionProfit = TradingDemo.calculateTransactionProfit(transaction);
        const transactionSumCommissions = TradingDemo.calculateTransactionSumCommissions(transaction);

        profit += transactionProfit;
        sumCommissions += transactionSumCommissions;

        if (profit > maxProfit) {
          maxProfit = profit;
        } else if (profit < minProfit) {
          minProfit = profit;
        }

        if (transaction.isManuallyFinished || transactionProfit === 0) {
          return true;
        }

        if (transactionProfit > 0) {
          transactionsRelation[0] += 1;
        } else {
          transactionsRelation[1] += 1;
        }
      });

    let transactionsRelationPercent = transactionsRelation[0] === 0 ? 0 : transactionsRelation[1] / transactionsRelation[0];

    profit = Number.isInteger(profit)
      ? parseInt(profit, 10) : profit.toFixed(2);

    sumCommissions = Number.isInteger(sumCommissions)
      ? parseInt(sumCommissions, 10) : sumCommissions.toFixed(4);

    minProfit = Number.isInteger(minProfit)
      ? parseInt(minProfit, 10) : minProfit.toFixed(2);

    maxProfit = Number.isInteger(maxProfit)
      ? parseInt(maxProfit, 10) : maxProfit.toFixed(2);

    transactionsRelationPercent = Number.isInteger(transactionsRelationPercent)
      ? parseInt(transactionsRelationPercent, 10) : transactionsRelationPercent.toFixed(2);

    this.$tradingStatistics.find('.profit span').text(profit);
    this.$tradingStatistics.find('.min-profit span').text(minProfit);
    this.$tradingStatistics.find('.max-profit span').text(maxProfit);
    this.$tradingStatistics.find('.sum-commissions span').text(sumCommissions);

    this.$tradingStatistics.find('.number-trades span.win').text(transactionsRelation[0]);
    this.$tradingStatistics.find('.number-trades span.lose').text(transactionsRelation[1]);
    this.$tradingStatistics.find('.number-trades span.relation').text(transactionsRelationPercent);
  }

  setTransactions(transactions = []) {
    localStorage.setItem(this.localStorageKey, JSON.stringify(transactions));
  }

  getTransactions() {
    const transactions = localStorage.getItem(this.localStorageKey);

    if (!transactions) {
      return [];
    }

    return JSON.parse(transactions);
  }

  loadTradingListHandlers() {
    const _this = this;

    this.$tradingList
      .on('click', '.trade .index', function () {
        const $parent = $(this).parent();
        const transactionId = $parent.data('transactionid');
        const transaction = _this.trading.transactions.find(t => t.id === transactionId);

        _this.removeTradesFromTradeList([transaction]);

        _this.trading.transactions = _this.trading.transactions.filter(t => t.id !== transaction.id);
        _this.setTransactions(_this.trading.transactions);

        _this.updateCommonStatistics();
      });

    this.$tradingList
      .on('click', '.trade .type', function () {
        const $parent = $(this).parent();
        const transactionId = $parent.data('transactionid');
        const transaction = _this.trading.transactions.find(t => t.id === transactionId);

        transaction.isManuallyFinished = !transaction.isManuallyFinished;
        _this.setTransactions(_this.trading.transactions);
        _this.updateCommonStatistics();
      });

    this.$tradingList
      .on('click', '.trade .profit', function () {
        const $parent = $(this).parent();
        const transactionId = $parent.data('transactionid');
        const transaction = _this.trading.transactions.find(t => t.id === transactionId);

        const transactionProfit = TradingDemo.calculateTransactionProfit(transaction);

        let returnMessage = `${transactionProfit.toFixed(2)}$`;
        const key = transaction.isLong ? 'buyPrice' : 'sellPrice';
        const sortedTrades = transaction.trades.filter((a, b) => a.startedAtUnix < b.startedAtUnix ? 1 : -1);
        const sumLoss = Math.abs((transaction.originalStopLossPrice - sortedTrades[0][key]) * sortedTrades[0].quantity);
        const tradesWithTheSameStartTime = sortedTrades.filter(t => t.startedAtUnix === sortedTrades[0].startedAtUnix);
        console.log('sumLoss', sumLoss);

        if (transactionProfit > sumLoss) {
          returnMessage += `(${(transactionProfit / (sumLoss * tradesWithTheSameStartTime.length)).toFixed(2)})`;
        }

        alert(returnMessage);
      });

    // this.$tradingList
    //   .on('click', '.trade .profit', function () {
    //     const $trade = $(this).closest('.trade');
    //     const $index = $trade.find('td.index');
    //     const index = parseInt($index.text(), 10);
    //
    //     _this.flipTradesProfit(index);
    //   });

    // this.$tradingList
    //   .on('change', '.trade .strategy input', function () {
    //     const value = $(this).val();
    //     const $trade = $(this).closest('.trade');
    //     const $index = $trade.find('td.index');
    //     const index = parseInt($index.text(), 10);
    //
    //     const targetTrades = _this.trades.filter(t => t.index === index);
    //
    //     targetTrades.forEach(t => {
    //       t.strategyId = value;
    //     });
    //
    //     _this.lastStrategyId = value;
    //
    //     _this.removeTradesFromHistory(targetTrades);
    //     _this.addTradesToHistory(targetTrades);
    //   });
  }
}
