/* global
functions, makeRequest, getUnix,
objects, moment
*/

/* Constants */

const URL_GET_USER_TRADE_BOUNDS = '/api/user-trade-bounds';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';
const URL_GET_CONSTANTS = '/api/strategies/priceJumps/constants';

// const WORK_AMOUNT = 10;
let TYPE_TRADE = 'PRICE_JUMP';

/* Variables */

let instrumentsDocs = [];

const startDate = moment().utc()
  .utc().startOf('day');
  // .add(-1, 'days');

const endDate = moment().utc()
  .startOf('minute');

const urlSearchParams = new URLSearchParams(window.location.search);
const params = Object.fromEntries(urlSearchParams.entries());

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

  const isTest = params.isTest && params.isTest === 'true';

  const resultGetUserTradeBounds = await makeRequest({
    method: 'GET',
    url: URL_GET_USER_TRADE_BOUNDS,
    query: {
      isTest,
      typeTrade: TYPE_TRADE,

      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
  });

  if (!resultGetUserTradeBounds || !resultGetUserTradeBounds.status) {
    alert(resultGetUserTradeBounds.message || 'Cant makeRequest URL_GET_USER_TRADE_BOUNDS');
    return true;
  }

  instrumentsDocs = resultGetInstruments.result;
  // const STOPLOSS_PERCENT = resultGetConstants.result.STOPLOSS_PERCENT;

  let mainPeriods = [];
  let commonProfitForRequest = 0;
  let commonProfitPercentForRequest = 0;

  instrumentsDocs.forEach(doc => {
    doc.user_trade_bounds = resultGetUserTradeBounds.result.filter(
      bound => bound.instrument_id === doc._id,
    );

    doc.user_trade_bounds.forEach(bound => {
      bound.trade_started_at_unix = getUnix(bound.trade_started_at);
      bound.trade_ended_at_unix = bound.is_active ? getUnix() : getUnix(bound.trade_ended_at);
    });

    let commonProfit = 0;
    let commonProfitPercent = 0;
    // const quantity = WORK_AMOUNT / doc.price;

    if (!doc.user_trade_bounds.length) {
      instrumentsDocs = instrumentsDocs.filter(d => d._id !== doc._id);
      return true;
    }

    doc.user_trade_bounds.forEach(bound => {
      const divider = bound.trade_started_at_unix % 86400;
      const startOfDayUnix = bound.trade_started_at_unix - divider;

      bound.start_of_day_unix = startOfDayUnix;

      if (!mainPeriods.includes(startOfDayUnix)) {
        mainPeriods.push(startOfDayUnix);
      }

      if (!bound.sell_price) {
        bound.sell_price = doc.price;
      }

      if (!bound.buy_price) {
        bound.buy_price = doc.price;
      }

      const profit = bound.sell_price - bound.buy_price;
      const differenceBetweenPrices = Math.abs(profit);
      let percentPerPrice = 100 / (bound.buy_price / differenceBetweenPrices);

      if (profit < 0) {
        percentPerPrice = -percentPerPrice;
      }

      bound.profit = (profit * bound.quantity);
      bound.profitPercent = percentPerPrice;

      commonProfit += bound.profit;
      commonProfitPercent += percentPerPrice;
    });

    doc.profit = commonProfit;
    doc.profitPercent = commonProfitPercent;

    commonProfitForRequest += doc.profit;
    commonProfitPercentForRequest += doc.profitPercent;
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
          <th>%</th>
          <th>Date</th>
        </tr>

        <tr>
          <td>*</td>
          <td></td>
          <td></td>
          <td>${validDate}</td>
        </tr>
      </table>
    </td>`;
  });

  const resultStr = `<tr class="result">
    <td>
      <table>
        <tr>
          <th class="instrument-name">#</th>
          <th>Profit</th>
          <th>%</th>
        </tr>

        <tr>
          <td class="instrument-name">*</td>
          <td>${commonProfitForRequest.toFixed(2)}</td>
          <td>${commonProfitPercentForRequest.toFixed(2)}</td>
        </tr>
      </table>
    </td>

    ${periodsResultStr}
  </tr>`;

  let instrumentsStr = '';

  instrumentsDocs
    .sort((a, b) => a.profitPercent > b.profitPercent ? -1 : 1)
    .forEach(doc => {
      let tdStr = '';

      for (let i = 0; i < lMainPeriods; i += 1) {
        tdStr += `<td class="period p-${mainPeriods[i]}"></td>`;
      }

      instrumentsStr += `<tr
        class="instrument"
        id="instrumentid-${doc._id}"
      >
        <td>
          <table>
            <tr>
              <th class="instrument-name">${doc.name.replace('PERP', '')}</th>
              <th>Profit</th>
              <th>%</th>
            </tr>

            <tr>
              <td>${doc.price}</td>
              <td>${doc.profit.toFixed(2)}</td>
              <td>${doc.profitPercent.toFixed(2)}</td>
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

  $profitContainer.empty()
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

        let tableStr = `<table>
          <tr>
            <th>#</th>
            <th>Profit</th>
            <th>%</th>
            <th>Time</th>
          </tr>
        `;

        let periodProfit = 0;
        let periodProfitPercent = 0;
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
              <td class="${classFillColor}">${bound.profitPercent.toFixed(2)}%</td>
              <td>${validTime}</td>
            </tr>`;

            periodProfit += bound.profit;
            periodProfitPercent += bound.profitPercent;
          });

        tableStr += `
          <tr>
            <td>${periodBounds.length}</td>
            <td>${periodProfit.toFixed(2)}</td>
            <td>${periodProfitPercent.toFixed(2)}%</td>
            <td></td>
          </tr>
        </table>`;

        $td.empty().append(tableStr);
      }
    });

  mainPeriods.forEach(period => {
    const targetBounds = [];
    const $elementsTds = $profitContainer.find(`tr.result td.period.p-${period} table td`);

    instrumentsDocs.forEach(doc => {
      targetBounds.push(...doc.user_trade_bounds
        .filter(bound => bound.start_of_day_unix === period));
    });

    let periodProfit = 0;
    let periodProfitPercent = 0;

    targetBounds.forEach(bound => {
      periodProfit += bound.profit;
      periodProfitPercent += bound.profitPercent;
    });

    $elementsTds.eq(1).text(periodProfit.toFixed(2));
    $elementsTds.eq(2).text(`${periodProfitPercent.toFixed(2)}%`);
  });
});
