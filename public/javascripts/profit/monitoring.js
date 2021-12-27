/* global
functions, makeRequest,
objects, ChartBaseline, moment, constants
*/

/* Constants */

const URL_GET_USER_TRADE_BOUNDS = '/api/user-trade-bounds';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';

/* Variables */

let chartTotalIncome = {};
let chartHourlyIncome = {};

let instrumentsDocs = [];

let choosenInstrumentId;
const windowHeight = window.innerHeight;

const startDate = moment().utc()
  .add(-1, 'days');

const endDate = moment().utc()
  .startOf('minute');

const urlSearchParams = new URLSearchParams(window.location.search);
const params = Object.fromEntries(urlSearchParams.entries());

/* JQuery */
const $chartsContainer = $('.charts-container');
const $instrumentsContainer = $('.instruments-container');
const $instrumentsList = $instrumentsContainer.find('.instruments-list .list');

const $chartTotalIncome = $chartsContainer.find('.chart-container.total-income');
const $chartHourlyIncome = $chartsContainer.find('.chart-container.hourly-income');

$(document).ready(async () => {
  // start settings

  $chartsContainer
    .css({ height: windowHeight });

  $instrumentsContainer
    .css({ maxHeight: windowHeight });

  // loading data

  const resultGetInstruments = await makeRequest({
    method: 'GET',
    url: URL_GET_ACTIVE_INSTRUMENTS,
    query: { isOnlyFutures: true },
  });

  if (!resultGetInstruments || !resultGetInstruments.status) {
    alert(resultGetInstruments.message || 'Cant makeRequest URL_GET_ACTIVE_INSTRUMENTS');
    return true;
  }

  const queryParams = {
    endDate: endDate.toISOString(),
    startDate: startDate.toISOString(),
    isTest: params.isTest && params.isTest === 'true',
  };

  if (params.typeTrade) {
    queryParams.typeTrade = params.typeTrade;
  }

  const resultGetUserTradeBounds = await makeRequest({
    method: 'GET',
    url: URL_GET_USER_TRADE_BOUNDS,
    query: queryParams,
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
  });

  // main logic
  renderListInstruments(instrumentsDocs);

  chartTotalIncome = new ChartBaseline($chartTotalIncome.find('.charts'));
  chartHourlyIncome = new ChartBaseline($chartHourlyIncome.find('.charts'));

  $('.search input')
    .on('keyup', function () {
      const value = $(this).val().toLowerCase();

      let targetDocs = instrumentsDocs;

      if (value) {
        targetDocs = targetDocs.filter(doc => doc.name
          .toLowerCase()
          .includes(value),
        );
      }

      renderListInstruments(targetDocs);
    });

  $instrumentsList
    .on('click', '.instrument', async function (elem) {
      const $instrument = elem.type ? $(this) : $(elem);
      const instrumentId = $instrument.data('instrumentid');

      if (choosenInstrumentId === instrumentId) {
        return true;
      }

      choosenInstrumentId = instrumentId;
    });

  if (params.symbol) {
    const instrumentDoc = instrumentsDocs.find(doc => doc.name === params.symbol);

    if (!instrumentDoc) {
      alert('No doc with this symbol');
    } else {
      await $._data($($instrumentsList)
        .get(0), 'events').click[0]
        .handler(`#instrument-${instrumentDoc._id}`);
    }
  }
});

/* Functions */

const renderListInstruments = (instrumentsDocs) => {
  let appendInstrumentsStr = '';

  instrumentsDocs = instrumentsDocs
    .filter(doc => doc.user_trade_bounds.length)
    .sort((a, b) => a.user_trade_bounds.length > b.user_trade_bounds.length ? -1 : 1);

  instrumentsDocs
    .forEach(doc => {
      appendInstrumentsStr += `<div
        id="instrument-${doc._id}"
        class="instrument"
        data-instrumentid=${doc._id}>
        <span class="instrument-name">${doc.name}</span>
        <span class="amount">${doc.user_trade_bounds.length}</span>
      </div>`;
    });

  $instrumentsList
    .empty()
    .append(appendInstrumentsStr);
};

const splitDays = ({ instrumentId }) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const chartCandles = instrumentDoc.chart_candles;
  let { originalData } = chartCandles;

  if (!originalData || !originalData.length) {
    return [];
  }

  const firstCandle = originalData[0];

  // skip not full hour
  const divider = firstCandle.originalTimeUnix % 86400;

  if (divider !== 0) {
    const startOfNextDayUnix = (firstCandle.originalTimeUnix - divider) + 86400;

    let increment = 1;
    let startIndex = false;

    while (1) {
      const candle = originalData[increment];

      if (!candle) {
        break;
      }

      if (candle.originalTimeUnix === startOfNextDayUnix) {
        startIndex = increment;
        break;
      }

      increment += 1;
    }

    if (!startIndex) {
      return [];
    }

    originalData = originalData.slice(startIndex, originalData.length);
  }

  const intervals = [];
  let newInterval = [originalData[0]];
  const lOriginalData = originalData.length;

  let day = new Date(originalData[0].originalTime).getUTCDate();

  for (let i = 1; i < lOriginalData; i += 1) {
    const dayOfCandle = new Date(originalData[i].originalTime).getUTCDate();

    if (dayOfCandle !== day) {
      day = dayOfCandle;

      intervals.push({
        startOfPeriodUnix: newInterval[0].originalTimeUnix,
        endOfPeriodUnix: newInterval[newInterval.length - 1].originalTimeUnix,
      });

      newInterval = [originalData[i]];
      continue;
    }

    newInterval.push(originalData[i]);
  }

  intervals.push({
    startOfPeriodUnix: newInterval[0].originalTimeUnix,
    endOfPeriodUnix: newInterval[newInterval.length - 1].originalTimeUnix,
  });

  intervals.forEach(interval => {
    const newCandleExtraSeries = chartCandles.addExtraSeries({
      lastValueVisible: false,
    });

    chartCandles.drawSeries(newCandleExtraSeries, [{
      value: 0,
      time: interval.startOfPeriodUnix,
    }, {
      value: instrumentDoc.price * 5,
      time: interval.startOfPeriodUnix,
    }]);
  });

  return intervals;
};
