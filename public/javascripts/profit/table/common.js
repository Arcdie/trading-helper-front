/* global
functions, makeRequest, getUnix,
objects, moment
*/

/* Constants */

const URL_GET_USER_TRADE_BOUNDS = '/api/user-trade-bounds';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';
const URL_GET_CONSTANTS = '/api/strategies/priceJumps/constants';

let TYPE_TRADE = 'PRICE_JUMP';
const WORK_AMOUNT = 10;
const BINANCE_COMMISSION = 0.04;

/* Variables */

let instrumentsDocs = [];
let targetInstruments = [];

let startDate = moment().utc()
  .add(-2, 'months')
  .startOf('year');
  // .add(-1, 'days');

let endDate = moment().utc();

const urlSearchParams = new URLSearchParams(window.location.search);
const params = Object.fromEntries(urlSearchParams.entries());

const isTest = params.isTest && params.isTest === 'true';
const isStatistics = params.isStatistics && params.isStatistics === 'true';

if (params.startDate) {
  startDate = moment.unix(parseInt(params.startDate, 10));
}

if (params.endDate) {
  endDate = moment.unix(parseInt(params.endDate, 10));
}

/* JQuery */

const $profitContainer = $('.container');

$(document).ready(async () => {
  if (params.typeTrade) {
    TYPE_TRADE = params.typeTrade;
  }

  const resultGetConstants = await makeRequest({
    method: 'GET',
    url: URL_GET_CONSTANTS,
  });

  if (!resultGetConstants || !resultGetConstants.status) {
    alert(resultGetConstants.message || 'Cant makeRequest URL_GET_CONSTANTS');
    return true;
  }

  const resultGetInstruments = await makeRequest({
    method: 'GET',
    url: URL_GET_ACTIVE_INSTRUMENTS,
    query: { isOnlyFutures: true },
  });

  if (!resultGetInstruments || !resultGetInstruments.status) {
    alert(resultGetInstruments.message || 'Cant makeRequest URL_GET_ACTIVE_INSTRUMENTS');
    return true;
  }

  const query = {
    isTest,
    isStatistics,
    typeTrade: TYPE_TRADE,

    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };

  if (params.isLong) {
    query.isLong = params.isLong;
  }

  const resultGetUserTradeBounds = await makeRequest({
    method: 'GET',
    url: URL_GET_USER_TRADE_BOUNDS,
    query,
  });

  if (!resultGetUserTradeBounds || !resultGetUserTradeBounds.status) {
    alert(resultGetUserTradeBounds.message || 'Cant makeRequest URL_GET_USER_TRADE_BOUNDS');
    return true;
  }

  instrumentsDocs = resultGetInstruments.result;

  instrumentsDocs.forEach(doc => {
    doc.user_trade_bounds = resultGetUserTradeBounds.result.filter(
      bound => bound.instrument_id === doc._id,
    );

    doc.user_trade_bounds.forEach(bound => {
      bound.trade_started_at_unix = getUnix(bound.trade_started_at);
      bound.trade_ended_at_unix = bound.is_active ? getUnix() : getUnix(bound.trade_ended_at);
    });

    if (!doc.user_trade_bounds.length) {
      instrumentsDocs = instrumentsDocs.filter(d => d._id !== doc._id);
      return true;
    }

    let commonProfit = 0;
    let commonResultPercent = 0;
    let commonSumCommissions = 0;

    doc.user_trade_bounds.forEach(bound => {
      const divider = bound.trade_started_at_unix % 86400;
      const startOfDayUnix = bound.trade_started_at_unix - divider;

      bound.start_of_day_unix = startOfDayUnix;

      if (!bound.sell_price) {
        bound.sell_price = doc.price;
      }

      if (!bound.buy_price) {
        bound.buy_price = doc.price;
      }

      const sumBuyPrice = bound.buy_price * bound.quantity;
      const sumSellPrice = bound.sell_price * bound.quantity;

      const sumBuyCommissions = (sumBuyPrice * (BINANCE_COMMISSION / 100));
      const sumSellCommissions = (sumSellPrice * (BINANCE_COMMISSION / 100));

      const sumCommissions = (sumBuyCommissions + sumSellCommissions);

      const profit = bound.sell_price - bound.buy_price;
      const startPrice = bound.is_long ? bound.buy_price : bound.sell_price;

      const result = (profit * bound.quantity) - sumCommissions;

      let profitPercentPerPrice = 100 / (startPrice / Math.abs(profit));
      const resultPercentPerPrice = 100 / (WORK_AMOUNT / result);

      if (profit < 0) {
        profitPercentPerPrice = -profitPercentPerPrice;
      }

      bound.result = result;
      bound.profit = (profit * bound.quantity);
      bound.profitPercent = profitPercentPerPrice;
      bound.resultPercent = resultPercentPerPrice;
      bound.sumCommissions = sumCommissions;

      commonProfit += bound.profit;
      commonResultPercent += bound.resultPercent;
      commonSumCommissions += bound.sumCommissions;
    });

    doc.profit = commonProfit;
    doc.resultPercent = commonResultPercent;
    doc.sumCommissions = commonSumCommissions;
    doc.result = commonProfit - commonSumCommissions;
  });

  /*
  if (isStatistics) {
    instrumentsDocs.forEach(doc => {
      doc.numberGreenPeriods = 0;

      if (doc.resultPercent < -2) {
        doc.is_active = false;
      }
    });
  }
  */

  render(instrumentsDocs, true);
  // render(instrumentsDocs);

  $profitContainer
    .on('change', 'input.instrument-show', function () {
      const $tr = $(this).closest('tr.instrument');
      const instrumentId = $tr.data('instrument');

      const instrumentDoc = instrumentsDocs.find(
        doc => doc._id === instrumentId,
      );

      instrumentDoc.is_active = this.checked;

      render(instrumentsDocs);
    });
});

const render = (instrumentsDocs = [], isFirstRender = false) => {
  let mainPeriods = [];

  let commonProfitForRequest = 0;
  let commonResultPercentForRequest = 0;
  let commonSumCommissionsForRequest = 0;

  instrumentsDocs.forEach(doc => {
    let commonProfit = 0;
    let commonResultPercent = 0;
    let commonSumCommissions = 0;

    doc.profit = 0;
    doc.resultPercent = 0;
    doc.sumCommissions = 0;
    doc.result = 0;

    doc.user_trade_bounds.forEach(bound => {
      if (!mainPeriods.includes(bound.start_of_day_unix)) {
        mainPeriods.push(bound.start_of_day_unix);
      }

      commonProfit += bound.profit;
      commonResultPercent += bound.resultPercent;
      commonSumCommissions += bound.sumCommissions;
    });

    doc.profit = commonProfit;
    doc.resultPercent = commonResultPercent;
    doc.sumCommissions = commonSumCommissions;
    doc.result = commonProfit - commonSumCommissions;

    if (doc.is_active) {
      commonProfitForRequest += doc.profit;
      commonResultPercentForRequest += doc.resultPercent;
      commonSumCommissionsForRequest += doc.sumCommissions;
    }
  });

  let periodsResultStr = '';
  const lMainPeriods = mainPeriods.length;

  mainPeriods = mainPeriods.sort((a, b) => a < b ? -1 : 1);

  mainPeriods.forEach(period => {
    const validDate = moment(period * 1000).format('DD.MM');

    periodsResultStr += `<td class="period p-${period}">
      <table>
        <tr>
          <th>#</th>
          <th>Profit</th>
          <th>-</th>
          <th>=</th>
          <th>%</th>
          <th>Date</th>
        </tr>

        <tr>
          <td>*</td>
          <td class="commonProfit">0</td>
          <td class="commonSumCommissions">0</td>
          <td class="commonResult">0</td>
          <td class="commonResultPercent">0%</td>
          <td>${validDate}</td>
        </tr>
      </table>
    </td>`;
  });

  const commonResultForRequest = commonProfitForRequest - commonSumCommissionsForRequest;

  const resultStr = `<tr class="result">
    <td>
      <table>
        <tr>
          <th class="instrument-name">#</th>
          <th>Profit</th>
          <th>-</th>
          <th>=</th>
          <th>%</th>
        </tr>

        <tr>
          <td class="instrument-name">*</td>
          <td class="commonProfit">${commonProfitForRequest.toFixed(2)}</td>
          <td class="commonSumCommissions">${commonSumCommissionsForRequest.toFixed(2)}</td>
          <td class="commonResult">${commonResultForRequest.toFixed(2)}</td>
          <td class="commonResultPercent ${commonResultPercentForRequest > 0 ? 'green' : 'red'}">${commonResultPercentForRequest.toFixed(2)}%</td>
        </tr>
      </table>
    </td>

    ${periodsResultStr}
  </tr>`;

  let instrumentsStr = '';

  instrumentsDocs
    .sort((a, b) => a.resultPercent > b.resultPercent ? -1 : 1)
    .forEach(doc => {
      let tdStr = '';

      for (let i = 0; i < lMainPeriods; i += 1) {
        tdStr += `<td class="period p-${mainPeriods[i]}"></td>`;
      }

      instrumentsStr += `<tr
        data-instrument=${doc._id}
        class="instrument ${doc.is_active ? 'is_active' : ''}"
        id="instrumentid-${doc._id}"
      >
        <td>
          <table>
            <tr>
              <th class="instrument-name">
                <input class="instrument-show" type="checkbox" id="instrument-${doc._id}" ${doc.is_active ? 'checked' : ''}>
                <label for="instrument-${doc._id}">${doc.name.replace('PERP', '')}</label>
              </th>
              <th>Profit</th>
              <th>-</th>
              <th>=</th>
              <th>%</th>
            </tr>

            <tr>
              <td>${doc.price}</td>
              <td>${doc.profit.toFixed(2)}</td>
              <td>${doc.sumCommissions.toFixed(2)}</td>
              <td>${doc.result.toFixed(2)}</td>
              <td class="${doc.resultPercent > 0 ? 'green' : 'red'}">${doc.resultPercent.toFixed(2)}% </td>
            </tr>
          </table>
        </td>
        ${tdStr}
      </tr>`;
    });

  const mainTableStr = `<table class="main-table">
    ${resultStr}
    ${instrumentsStr}
  </table>`;

  $profitContainer
    .empty()
    .append(mainTableStr);

  instrumentsDocs
    .forEach(doc => {
      const periods = new Map();
      const $instrument = $(`#instrumentid-${doc._id}`);

      doc.user_trade_bounds.forEach(bound => {
        const startOfDayUnix = bound.start_of_day_unix;

        let periodData = periods.get(startOfDayUnix);

        if (!periodData) {
          periodData = [];
          periods.set(startOfDayUnix, periodData);
        }

        periodData.push(bound);
        periods.set(startOfDayUnix, periodData);
      });

      const periodsKeys = [...periods.keys()];

      for (let i = 0; i < periodsKeys.length; i += 1) {
        const periodKey = periodsKeys[i];
        const $td = $instrument.find(`td.period.p-${periodKey}`);

        let tableStr = '';

        let periodProfit = 0;
        let periodResultPercent = 0;
        let periodSumCommissions = 0;
        const periodBounds = periods.get(periodKey);

        periodBounds
          .sort((a, b) => a.trade_started_at_unix > b.trade_started_at_unix ? -1 : 1)
          .forEach((bound, index) => {
            const validTime = moment(bound.trade_started_at_unix * 1000).format('HH:mm');

            let classFillColor = '';

            if (!bound.is_active) {
              classFillColor = bound.profitPercent > 0 ? 'green' : 'red';
            }

            tableStr += `<tr>
              <td>${index + 1}</td>
              <td>${bound.profit.toFixed(2)}</td>
              <td>${bound.sumCommissions.toFixed(2)}</td>
              <td>${bound.result.toFixed(2)}</td>
              <td class="${classFillColor}">${bound.profitPercent.toFixed(2)}%</td>
              <td>${validTime}</td>
            </tr>`;

            periodProfit += bound.profit;
            periodResultPercent += bound.resultPercent;
            periodSumCommissions += bound.sumCommissions;
          });

        const periodResult = periodProfit - periodSumCommissions;

        if (isFirstRender && periodResult > 0) {
          doc.numberGreenPeriods += 1;
        }

        $td.empty().append(`<table>
          <tr>
            <th>#</th>
            <th>Profit</th>
            <th>-</th>
            <th>=</th>
            <th>%</th>
            <th>Time</th>
          </tr>

          <tr>
            <td>${periodBounds.length}</td>
            <td>${periodProfit.toFixed(2)}</td>
            <td>${periodSumCommissions.toFixed(2)}</td>
            <td>${periodResult.toFixed(2)}</td>
            <td class="${periodResultPercent > 0 ? 'green' : 'red'}">${periodResultPercent.toFixed(2)}%</td>
            <td></td>
          </tr>

          ${tableStr}
        </table>`);
      }

      if (doc.numberGreenPeriods < (periodsKeys.length - 2)) {
        doc.is_active = false;
      }
    });

  mainPeriods.forEach(period => {
    const targetBounds = [];
    const $period = $profitContainer.find(`tr.result td.period.p-${period}`);

    instrumentsDocs.forEach(doc => {
      if (!doc.is_active) {
        return true;
      }

      targetBounds.push(...doc.user_trade_bounds
        .filter(bound => bound.start_of_day_unix === period));
    });

    let periodProfit = 0;
    let periodResultPercent = 0;
    let periodSumCommissions = 0;

    targetBounds.forEach(bound => {
      periodProfit += bound.profit;
      periodResultPercent += bound.resultPercent;
      periodSumCommissions += bound.sumCommissions;
    });

    const periodResult = periodProfit - periodSumCommissions;

    $period.find('.commonProfit').text(periodProfit.toFixed(2));
    $period.find('.commonResult').text(periodResult.toFixed(2));
    $period.find('.commonSumCommissions').text(periodSumCommissions.toFixed(2));

    $period.find('.commonResultPercent')
      .attr('class', 'commonResultPercent')
      .addClass(periodResultPercent > 0 ? 'green' : 'red')
      .text(`${periodResultPercent.toFixed(2)}%`);
  });

  targetInstruments = instrumentsDocs
    .filter(doc => doc.is_active)
    .map(doc => ({
      instrumentId: doc._id,
      instrumentName: doc.name,
    }));
};
