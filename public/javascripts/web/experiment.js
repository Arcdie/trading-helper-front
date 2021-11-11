/* global
functions, makeRequest, initPopWindow,
objects, windows, moment, user, wsClient, ChartCandles, ChartVolume, LightweightCharts
*/

/* Constants */

const URL_GET_TRADES = '/api/trades';
const URL_GET_CANDLES = '/api/candles';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';

const AVAILABLE_PERIODS = new Map([
  ['1M', '1m'],
  ['5M', '5m'],
  ['1H', '1h'],
  ['4H', '4h'],
  ['1D', '1d'],
]);

const WORKING_PERIODS = [
  AVAILABLE_PERIODS.get('1M'),
  AVAILABLE_PERIODS.get('5M'),
  // AVAILABLE_PERIODS.get('1H'),
  // AVAILABLE_PERIODS.get('4H'),
  // AVAILABLE_PERIODS.get('1D'),
];

const windowWidth = window.innerWidth;
const windowHeight = window.innerHeight;

let LIMITER_FOR_AGGREGATE_TRADES = 3;
const DEFAULT_PERIOD = AVAILABLE_PERIODS.get('1M');

let choosenInstrumentId;
let choosenPeriod = DEFAULT_PERIOD;

let chartVolume = {};
let chartCandles = {};

let robots = [];
let instrumentsDocs = [];
let instrumentRobotBounds = [];

/* JQuery */
const $rootContainer = $('.charts');
const $chartPeriods = $('.chart-periods div');
const $instrumentsContainer = $('.instruments-container');
const $instrumentsList = $instrumentsContainer.find('.instruments-list .list');

const $legend = $('.legend');
const $low = $legend.find('span.low');
const $high = $legend.find('span.high');
const $open = $legend.find('span.open');
const $close = $legend.find('span.close');
const $percent = $legend.find('span.percent');

const $tradesSlider = $('.trades-slider');
const $tradesAggregate = $('.trades-aggregate input');

$(document).ready(async () => {
  $rootContainer.css({ height: windowHeight - 20 });

  const resultGetInstruments = await makeRequest({
    method: 'GET',
    url: `${URL_GET_ACTIVE_INSTRUMENTS}?doesExistRobot=true`,
  });

  if (!resultGetInstruments || !resultGetInstruments.status) {
    alert(resultGetInstruments.message || 'Cant makeRequest URL_GET_ACTIVE_INSTRUMENTS');
    return true;
  }

  instrumentsDocs = resultGetInstruments.result;

  $instrumentsContainer
    .css({ maxHeight: windowHeight });

  $instrumentsList
    .css({ maxHeight: windowHeight });

  renderListInstruments(instrumentsDocs);

  WORKING_PERIODS.forEach(period => {
    const $period = $chartPeriods.parent().find(`.${period}`);

    $period.addClass('is_worked');

    if (period === DEFAULT_PERIOD) {
      $period.addClass('is_active');
    }
  });

  $chartPeriods
    .on('click', async function () {
      const $period = $(this);
      const period = $period.data('period');

      $chartPeriods.removeClass('is_active');
      $period.addClass('is_active');

      choosenPeriod = period;

      if (choosenInstrumentId) {
        await loadChart({
          instrumentId: choosenInstrumentId,
        });

        loadMarkers(instrumentRobotBounds);
      }
    });

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
    .on('click', '.instrument', async function () {
      const $instrument = $(this);
      const instrumentId = $instrument.data('instrumentid');

      if (choosenInstrumentId === instrumentId) {
        return true;
      }

      $instrumentsList
        .find('.instrument')
        .removeClass('is_active');

      $instrument.addClass('is_active');
      $tradesSlider.find('span.current-tick').text(0);

      choosenInstrumentId = instrumentId;

      const resultGetTrades = await makeRequest({
        method: 'GET',
        url: `${URL_GET_TRADES}?instrumentId=${instrumentId}`,
      });

      if (!resultGetTrades || !resultGetTrades.status) {
        alert(resultGetInstruments.message || 'Cant makeRequest URL_GET_TRADES');
        return true;
      }

      if (choosenInstrumentId !== instrumentId) {
        return true;
      }

      instrumentRobotBounds = resultGetTrades.result;

      await loadChart({ instrumentId });
      loadMarkers(instrumentRobotBounds);
    });

  $tradesSlider
    .find('button')
    .on('click', function () {
      if (!choosenInstrumentId) {
        return true;
      }

      scrollTo($(this).attr('class'));
    });

  $tradesAggregate
    .on('keyup', function () {
      const newValue = parseInt($(this).val(), 10);

      if (!Number.isNaN(newValue)
        && newValue !== LIMITER_FOR_AGGREGATE_TRADES) {
        LIMITER_FOR_AGGREGATE_TRADES = newValue;

        if (choosenInstrumentId) {
          $tradesSlider.find('span.current-tick').text(0);
          loadMarkers(instrumentRobotBounds);
        }
      }
    });
});

const loadChart = async ({
  instrumentId,
}) => {
  console.log('start loading');

  const endTime = new Date().toISOString();

  const resultGetCandles = await makeRequest({
    method: 'GET',
    url: `${URL_GET_CANDLES}/${choosenPeriod}?instrumentId=${instrumentId}&&endTime=${endTime}`,
  });

  if (!resultGetCandles || !resultGetCandles.status) {
    alert(resultGetCandles.message || `Cant makeRequest ${URL_GET_CANDLES}`);
    return true;
  }

  console.log('end loading');

  chartCandles = {};
  chartVolume = {};

  $rootContainer.empty();

  if (!resultGetCandles.result || !resultGetCandles.result.length) {
    return true;
  }

  choosenInstrumentId = instrumentId;
  const targetDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  chartCandles = new ChartCandles($rootContainer, choosenPeriod, targetDoc);
  chartVolume = new ChartVolume($rootContainer);

  chartCandles.setOriginalData(resultGetCandles.result, false);

  const listCharts = [chartCandles, chartVolume];

  chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);
  chartVolume.drawSeries(chartCandles.originalData);

  if (['1m', '5m'].includes(choosenPeriod)) {
    listCharts.forEach(chartWrapper => {
      chartWrapper.chart.applyOptions({
        timeScale: {
          timeVisible: true,
        },
      });
    });
  } else {
    listCharts.forEach(chartWrapper => {
      chartWrapper.chart.applyOptions({
        timeScale: {
          timeVisible: false,
        },
      });
    });
  }

  chartCandles.chart.subscribeCrosshairMove((param) => {
    if (param.time) {
      const price = param.seriesPrices.get(chartCandles.mainSeries);

      if (price) {
        const differenceBetweenHighAndLow = price.high - price.low;
        const percentPerPrice = 100 / (price.open / differenceBetweenHighAndLow);

        $open.text(price.open);
        $close.text(price.close);
        $low.text(price.low);
        $high.text(price.high);
        $percent.text(`${percentPerPrice.toFixed(1)}%`);
      }
    }
  });

  chartCandles.chart.subscribeClick((param) => {
    if (param.time) {
      const indexRobots = robots.findIndex(robot => robot.time === param.time);

      if (~indexRobots) {
        $tradesSlider
          .find('span.current-tick')
          .text(indexRobots + 1);
      }
    }
  });

  let isCrossHairMoving = false;

  listCharts.forEach(elem => {
    const otherCharts = listCharts.filter(chart => chart.containerName !== elem.containerName);

    elem.chart.subscribeCrosshairMove(param => {
      if (!param.point || !param.time || isCrossHairMoving) {
        return true;
      }

      isCrossHairMoving = true;

      otherCharts.forEach(innerElem => {
        innerElem.chart.moveCrosshair(param.point);
      });

      isCrossHairMoving = false;

      elem.chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        otherCharts.forEach(innerElem => {
          innerElem.chart.timeScale().setVisibleLogicalRange(range);
        });
      });
    });
  });
};

const loadMarkers = (trades) => {
  robots = [];
  const newMarkers = [];
  chartCandles.removeMarkers();

  const divider = choosenPeriod === AVAILABLE_PERIODS.get('1M') ? 60 : 300;

  trades.forEach(trade => {
    const timeUnix = moment(trade.time).utc().unix();
    const targetInterval = timeUnix - (timeUnix % divider);

    const keyMarker = `i${targetInterval}`;
    const direction = trade.is_long ? 'long' : 'short';

    if (!newMarkers[keyMarker]) {
      newMarkers[keyMarker] = {};
    }

    if (!newMarkers[keyMarker][`q${trade.quantity}-${direction}`]) {
      newMarkers[keyMarker][`q${trade.quantity}-${direction}`] = [];
    }

    newMarkers[keyMarker][`q${trade.quantity}-${direction}`].push({
      ...trade,
      targetInterval,
    });
  });

  Object.keys(newMarkers).forEach(keyInterval => {
    Object.keys(newMarkers[keyInterval]).forEach(keyQuantity => {
      const workTrades = newMarkers[keyInterval][keyQuantity];

      if (workTrades.length < LIMITER_FOR_AGGREGATE_TRADES) {
        return true;
      }

      let color, shape;

      if (workTrades[0].is_long) {
        color = '#4CAF50';
        shape = 'arrowUp';
      } else {
        color = '#FF5252';
        shape = 'arrowDown';
      }

      robots.push({
        shape,
        color,
        time: workTrades[0].targetInterval,
        text: `${workTrades[0].quantity}: ${workTrades.length}`,
      });
    });
  });

  $tradesSlider
    .find('span.amount-ticks')
    .text(robots.length);

  if (robots.length) {
    robots
      .sort((a, b) => a.time < b.time ? -1 : 1)
      .forEach(newMarker => {
        chartCandles.addMarker(newMarker);
      });

    chartCandles.drawMarkers();
    scrollTo('next');
  }
};

const renderListInstruments = targetDocs => {
  let appendInstrumentsStr = '';

  targetDocs.forEach(doc => {
    appendInstrumentsStr += `<div
      id="instrument-${doc._id}"
      class="instrument"
      data-instrumentid=${doc._id}>
      <span class="instrument-name">${doc.name}</span>
    </div>`;
  });

  $instrumentsList
    .empty()
    .append(appendInstrumentsStr);
};

const scrollTo = (action) => {
  const $currentTick = $tradesSlider.find('span.current-tick');

  let currentTick = parseInt($currentTick.text(), 10);
  const amountTicks = parseInt($tradesSlider.find('span.amount-ticks').text(), 10);

  if (action === 'next') {
    currentTick += 1;
  } else {
    currentTick -= 1;
  }

  if (currentTick === 0) {
    currentTick = amountTicks;
  }

  if (currentTick === amountTicks + 1) {
    currentTick = 1;
  }

  $currentTick.text(currentTick);

  let candlesToTargetRobot = 0;
  const targetRobot = robots[currentTick - 1];

  for (let i = chartCandles.originalData.length - 1; i >= 0; i -= 1) {
    if (chartCandles.originalData[i].originalTimeUnix === targetRobot.time) {
      candlesToTargetRobot = chartCandles.originalData.length - i; break;
    }
  }

  chartCandles.chart
    .timeScale()
    .scrollToPosition(-candlesToTargetRobot, false);
};
