/* global
functions, makeRequest, initPopWindow,
objects, windows, moment, user, wsClient, ChartCandles, IndicatorVolume, LightweightCharts
*/

/* Constants */

const URL_GET_TRADES = '/api/trades';
const URL_GET_CANDLES = '/api/candles';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';
const URL_GET_INSTRUMENT_ROBOT_BOUNDS = '/api/instrument-robot-bounds';

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

let isLoading = false;
let choosenInstrumentId;
let choosenPeriod = DEFAULT_PERIOD;

let chartCandles = {};
let indicatorVolume = {};

let robots = [];
let trades = [];
let instrumentsDocs = [];
let instrumentRobotBounds = [];

/* JQuery */
const $rootContainer = $('.charts');
const $chartPeriods = $('.chart-periods div');
const $instrumentsContainer = $('.instruments-container');
const $instrumentsList = $instrumentsContainer.find('.instruments-list .list');

const $loader = $('.loader');

const $legend = $('.legend');
const $low = $legend.find('span.low');
const $high = $legend.find('span.high');
const $open = $legend.find('span.open');
const $close = $legend.find('span.close');
const $percent = $legend.find('span.percent');

const $tradesSlider = $('.trades-slider');
const $tradesAggregate = $('.trades-aggregate input');

const $robotsContainer = $('.robots-container');

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
      if (isLoading) {
        return true;
      }

      const $period = $(this);
      const period = $period.data('period');

      $chartPeriods.removeClass('is_active');
      $period.addClass('is_active');

      choosenPeriod = period;

      if (choosenInstrumentId) {
        isLoading = true;
        $loader.addClass('is_active');

        await loadChart({
          instrumentId: choosenInstrumentId,
        });

        loadMarkers(trades);
        fillRobotsInfo(instrumentRobotBounds, robots);

        $loader.removeClass('is_active');
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

      if (isLoading) {
        return true;
      }

      isLoading = true;
      $loader.addClass('is_active');

      $instrumentsList
        .find('.instrument')
        .removeClass('is_active');

      $instrument.addClass('is_active');
      $tradesSlider.find('span.current-tick').text(0);

      choosenInstrumentId = instrumentId;

      const resultGetInstrumentRobotBounds = await makeRequest({
        method: 'GET',
        url: `${URL_GET_INSTRUMENT_ROBOT_BOUNDS}?instrumentId=${instrumentId}`,
      });

      if (!resultGetInstrumentRobotBounds || !resultGetInstrumentRobotBounds.status) {
        isLoading = false;
        $loader.removeClass('is_active');
        alert(resultGetInstrumentRobotBounds.message || 'Cant makeRequest URL_GET_INSTRUMENT_ROBOT_BOUNDS');
        return true;
      }

      const resultGetTrades = await makeRequest({
        method: 'GET',
        url: `${URL_GET_TRADES}?instrumentId=${instrumentId}`,
      });

      if (!resultGetTrades || !resultGetTrades.status) {
        isLoading = false;
        $loader.removeClass('is_active');
        alert(resultGetInstruments.message || 'Cant makeRequest URL_GET_TRADES');
        return true;
      }

      if (choosenInstrumentId !== instrumentId) {
        isLoading = false;
        $loader.removeClass('is_active');
        return true;
      }

      trades = resultGetTrades.result;
      instrumentRobotBounds = resultGetInstrumentRobotBounds.result;

      await loadChart({ instrumentId });
      loadMarkers(trades);
      fillRobotsInfo(instrumentRobotBounds, robots);
    });

  $tradesSlider
    .find('button')
    .on('click', function () {
      if (!choosenInstrumentId) {
        return true;
      }

      const $amountTicks = $tradesSlider.find('span.amount-ticks');
      const amountTicks = parseInt($amountTicks.text(), 10);

      if (amountTicks === 0) {
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
          loadMarkers(trades);
          fillRobotsInfo(instrumentRobotBounds, robots);
        }
      }
    });

  $robotsContainer
    .on('change', '.checkbox', function () {
      const boundId = $(this).closest('tr').data('boundid');

      const targetBound = instrumentRobotBounds.find(bound => bound._id === boundId);
      targetBound.is_active = this.checked;

      loadMarkers(trades);
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
    isLoading = false;
    $loader.removeClass('is_active');
    alert(resultGetCandles.message || `Cant makeRequest ${URL_GET_CANDLES}`);
    return true;
  }

  console.log('end loading');

  chartCandles = {};
  indicatorVolume = {};

  $rootContainer.empty();

  if (!resultGetCandles.result || !resultGetCandles.result.length) {
    isLoading = false;
    $loader.removeClass('is_active');
    return true;
  }

  choosenInstrumentId = instrumentId;
  const targetDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  chartCandles = new ChartCandles($rootContainer, choosenPeriod, targetDoc);
  indicatorVolume = new IndicatorVolume($rootContainer);

  chartCandles.setOriginalData(resultGetCandles.result, false);

  const listCharts = [chartCandles, indicatorVolume];

  chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);

  indicatorVolume.drawSeries(indicatorVolume.mainSeries, chartCandles.originalData.map(e => ({
    value: e.volume,
    time: e.time,
  })));

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

  isLoading = false;
  $loader.removeClass('is_active');
};

const loadMarkers = (trades) => {
  robots = [];
  const newMarkers = [];
  chartCandles.removeMarkers();

  const divider = choosenPeriod === AVAILABLE_PERIODS.get('1M') ? 60 : 300;
  const startTimeFirstCandle = chartCandles.originalData[0].originalTimeUnix;

  trades
    .forEach(trade => {
      const timeUnix = moment(trade.time).utc().unix();

      if (timeUnix < startTimeFirstCandle) {
        return true;
      }

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

      const quantity = workTrades[0].quantity;
      const isLong = workTrades[0].is_long;

      const targetBound = instrumentRobotBounds.find(
        bound => bound.quantity === quantity && bound.is_long === isLong,
      );

      let color, shape;

      if (workTrades[0].is_long) {
        color = '#4CAF50';
        shape = 'arrowUp';
      } else {
        color = '#FF5252';
        shape = 'arrowDown';
      }

      const lTrades = workTrades.length;

      robots.push({
        shape,
        color,
        time: workTrades[0].targetInterval,
        text: `${workTrades[0].quantity}: ${lTrades}`,
        quantity,
        is_long: isLong,
        is_active: targetBound.is_active,
      });
    });
  });

  const activeRobots = robots.filter(robot => robot.is_active);

  $tradesSlider
    .find('span.amount-ticks')
    .text(activeRobots.length);

  if (activeRobots.length) {
    activeRobots
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

const fillRobotsInfo = (bounds, robots) => {
  let appendStr = `<table>
    <tr>
      <th>Название</th>
      <th>К-во</th>
      <th>Показать</th>
    </tr>
  `;

  bounds
    .sort((a, b) => a.quantity > b.quantity ? -1 : 1)
    .forEach(bound => {
      const numberRobots = robots.filter(
        robot => robot.quantity === bound.quantity && robot.is_long === bound.is_long,
      ).length;

      appendStr += `<tr data-boundid=${bound._id}>
        <td>${bound.quantity} ${bound.is_long ? 'long' : 'short'}</td>
        <td>${numberRobots}</td>
        <td><input class="checkbox" type="checkbox" ${bound.is_active ? 'checked' : ''}></td>
      </tr>`;
    });

  appendStr += '</table>';
  $robotsContainer.empty().append(appendStr);
};
