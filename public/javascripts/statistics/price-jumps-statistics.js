/* global
functions, makeRequest, getUnix, sleep, saveAs,
objects, moment, ChartCandles, IndicatorVolume, IndicatorSuperTrend
*/

/* Constants */

const URL_GET_CANDLES = '/api/candles';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';

const AVAILABLE_PERIODS = new Map([
  ['1M', '1m'],
]);

const DEFAULT_PERIOD = AVAILABLE_PERIODS.get('1M');

let limiterLifetime = 0;
let limiterDistance = 1;
let limiterNumberTouches = 1;
let considerBtcMircoTrend = false;
let considerFuturesMircoTrend = true;
let stopLossPercent = 0.3;

const windowHeight = window.innerHeight;

let choosenInstrumentId;

let instrumentsDocs = [];

const startTime = moment().utc()
  .startOf('day');
  // .add(-1, 'days');
  // .add(-3, 'days');

const endTime = moment()
  .startOf('minute');

/* JQuery */
const $report = $('.report table');
const $chartsContainer = $('.charts-container');

const $instrumentsContainer = $('.instruments-container');
const $instrumentsList = $instrumentsContainer.find('.instruments-list .list');

const $settings = $('.settings');

$(document).ready(async () => {
  // start settings

  $instrumentsContainer
    .css({ maxHeight: windowHeight });

  $settings.find('.lifetime').val(limiterLifetime);
  $settings.find('.distance').val(limiterDistance);
  $settings.find('.stoploss-percent').val(stopLossPercent);
  $settings.find('.number-touches').val(limiterNumberTouches);
  $settings.find('#consider-btc-mirco-trend').prop('checked', considerBtcMircoTrend);
  $settings.find('#consider-futures-mirco-trend').prop('checked', considerFuturesMircoTrend);

  const urlSearchParams = new URLSearchParams(window.location.search);
  const params = Object.fromEntries(urlSearchParams.entries());

  // loading data

  const resultGetInstruments = await makeRequest({
    method: 'GET',
    url: URL_GET_ACTIVE_INSTRUMENTS,
    query: {
      isOnlyFutures: true,
    },
  });

  if (!resultGetInstruments || !resultGetInstruments.status) {
    alert(resultGetInstruments.message || 'Cant makeRequest URL_GET_ACTIVE_INSTRUMENTS');
    return true;
  }

  instrumentsDocs = resultGetInstruments.result;

  const btcDoc = instrumentsDocs.find(doc => doc.name === 'BTCUSDTPERP');

  btcDoc.original_data = await getCandlesData({
    period: DEFAULT_PERIOD,
    instrumentId: btcDoc._id,
    endTime: endTime.toISOString(),
    startTime: startTime.toISOString(),
  });
  // */

  // main logic
  renderListInstruments(instrumentsDocs);

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

      $instrumentsList
        .find('.instrument')
        .removeClass('is_active');

      $instrument.addClass('is_active');

      choosenInstrumentId = instrumentId;

      await loadCharts({ instrumentId });
      drawPriceJumps({ instrumentId });
    });

  $settings
    .find('input[type="text"]')
    .on('change', function () {
      const className = $(this).attr('class');
      const newValue = parseFloat($(this).val());

      if (!newValue || Number.isNaN(newValue)) {
        return true;
      }

      switch (className) {
        case 'lifetime': limiterLifetime = newValue; break;
        case 'distance': limiterDistance = newValue; break;
        case 'stoploss-percent': stopLossPercent = newValue; break;
        case 'number-touches': limiterNumberTouches = newValue; break;
        default: break;
      }

      if (choosenInstrumentId) {
        const instrumentId = choosenInstrumentId;
        drawPriceJumps({ instrumentId });
      }
    });

  $settings
    .find('input[type="checkbox"]')
    .on('change', function () {
      const id = $(this).attr('id');
      const newValue = $(this).is(':checked');

      switch (id) {
        case 'consider-btc-mirco-trend': considerBtcMircoTrend = newValue; break;
        case 'consider-futures-mirco-trend': considerFuturesMircoTrend = newValue; break;
        default: break;
      }

      if (choosenInstrumentId) {
        const instrumentId = choosenInstrumentId;
        drawPriceJumps({ instrumentId });
      }
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

const renderListInstruments = (instrumentsDocs) => {
  let appendInstrumentsStr = '';

  instrumentsDocs = instrumentsDocs.filter(doc => doc.is_futures);

  instrumentsDocs
    .forEach(doc => {
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

const loadCharts = async ({
  instrumentId,
}) => {
  $chartsContainer.empty();

  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  if (!futuresDoc.original_data || !futuresDoc.original_data.length) {
    futuresDoc.original_data = await getCandlesData({
      period: DEFAULT_PERIOD,
      instrumentId: futuresDoc._id,
      endTime: endTime.toISOString(),
      startTime: startTime.toISOString(),
    });
  }

  const chartKeys = ['futures', 'btc'];

  let appendStr = '';

  chartKeys.forEach(chartKey => {
    appendStr += `<div class="chart-container ${chartKey}">
      <div class="charts-nav">
        <div class="legend">
          <p class="values">ОТКР<span class="open">0</span>МАКС<span class="high">0</span>МИН<span class="low">0</span>ЗАКР<span class="close">0</span><span class="percent">0%</span></p>
        </div>
        <div class="row">
          <div class="chart-periods">
            <div class="1m is_worked is_active" data-period="1m"><span>1M</span></div>
          </div>
        </div>
        <div class="actions-menu">
          <div class="chart-slider ${chartKey}">
            <button class="previous"><</button>
            <p><span class="current-slide">0</span>/<span class="amount-slides">0</span></p>
            <button class="next">></button>
          </div>
        </div>
      </div>
      <span class="ruler">0%</span>
      <div class="charts" style="height: ${windowHeight}px"></div>
    </div>`;
  });

  $chartsContainer.append(appendStr);

  const listCharts = [];

  chartKeys.forEach(chartKey => {
    const $chartContainer = $chartsContainer.find(`.chart-container.${chartKey}`);
    const $rootContainer = $chartContainer.find('.charts');

    let chartKeyDoc;

    switch (chartKey) {
      case 'futures': { chartKeyDoc = futuresDoc; break; }

      case 'btc': {
        const btcDoc = instrumentsDocs.find(doc => doc.name === 'BTCUSDTPERP');
        chartKeyDoc = btcDoc;
        break;
      }

      default: break;
    }

    const chartCandles = new ChartCandles($rootContainer, DEFAULT_PERIOD, chartKeyDoc);
    const indicatorVolume = new IndicatorVolume($rootContainer);

    /*
    const indicatorMicroSuperTrend = new IndicatorSuperTrend(chartCandles.chart, {
      factor: 3,
      artPeriod: 10,
      candlesPeriod: DEFAULT_PERIOD,
    });

    const indicatorMacroSuperTrend = new IndicatorSuperTrend(chartCandles.chart, {
      factor: 5,
      artPeriod: 20,
      candlesPeriod: DEFAULT_PERIOD,
    });
    */

    chartCandles.chartKey = chartKey;
    chartCandles.setOriginalData(chartKeyDoc.original_data, false);
    chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);
    indicatorVolume.drawSeries(chartCandles.originalData);
    // const calculatedData = indicatorMicroSuperTrend.calculateAndDraw(chartCandles.originalData);

    // indicatorMacroSuperTrend.calculateAndDraw(chartCandles.originalData);

    chartKeyDoc.chart_candles = chartCandles;
    chartKeyDoc.indicator_volume = indicatorVolume;
    // chartKeyDoc.indicator_micro_supertrend = indicatorMicroSuperTrend;
    // chartKeyDoc.indicator_macro_supertrend = indicatorMacroSuperTrend;

    // chartKeyDoc.indicator_micro_supertrend_data = calculatedData;

    const $ruler = $chartContainer.find('span.ruler');
    const $legend = $chartContainer.find('.legend');
    const $low = $legend.find('span.low');
    const $high = $legend.find('span.high');
    const $open = $legend.find('span.open');
    const $close = $legend.find('span.close');
    const $percent = $legend.find('span.percent');

    chartCandles.chart.subscribeCrosshairMove((param) => {
      if (param.point) {
        const coordinateToPrice = chartCandles.mainSeries.coordinateToPrice(param.point.y);
        const differenceBetweenInstrumentAndCoordinatePrices = Math.abs(chartKeyDoc.price - coordinateToPrice);
        const percentPerPrice = 100 / (chartKeyDoc.price / differenceBetweenInstrumentAndCoordinatePrices);

        $ruler
          .text(`${percentPerPrice.toFixed(1)}%`)
          .css({
            top: param.point.y - 25,
            left: param.point.x + 15,
          });
      }

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

    listCharts.push(chartCandles, indicatorVolume);
  });

  let isCrossHairMoving = false;

  listCharts.forEach(elem => {
    const otherCharts = listCharts.filter(chart => chart.chartKey !== elem.chartKey);

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

  listCharts.forEach(chartWrapper => {
    chartWrapper.chart.applyOptions({
      timeScale: {
        timeVisible: true,
      },
    });
  });
};

const drawPriceJumps = ({ instrumentId }, priceJumps = []) => {
  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const futuresChartCandles = futuresDoc.chart_candles;

  futuresChartCandles.extraSeries.forEach(series => {
    futuresChartCandles.removeSeries(series, false);
  });

  if (!priceJumps.length) {
    return true;
  }

  const lPriceJumps = priceJumps.length;

  /*
  priceJumps.forEach(jump => {
    const newExtraSeries = futuresChartCandles.addExtraSeries({
      lastValueVisible: false,
    });

    futuresChartCandles.drawSeries(newExtraSeries, [{
      value: bound.price,
      time: bound.volume_started_at_unix,
    }, {
      value: bound.price,
      time: bound.volume_ended_at_unix,
    }]);
  });

  const $slider = $chartsContainer.find('.chart-slider.spot');

  $slider
    .find('span.amount-slides')
    .text(lTargetInstrumentVolumeBounds);

  scrollToVolume('next', { instrumentId }, targetInstrumentVolumeBounds);
  */
};

const calculatePriceJumps = ({ instrumentId }) => {
  const btcDoc = instrumentsDocs.find(doc => doc.name === 'BTCUSDTPERP');
  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const priceJumps = [];
  const futuresChartCandles = futuresDoc.chart_candles;

  return priceJumps;
};

const getCandlesData = async ({
  instrumentId,
  period,
  startTime,
  endTime,
}) => {
  console.log('start loading');

  if (!endTime) {
    endTime = new Date().toISOString();
  }

  if (!startTime) {
    startTime = moment().utc().startOf('day').toISOString();
  }

  const resultGetCandles = await makeRequest({
    method: 'GET',
    url: `${URL_GET_CANDLES}/${period}`,
    query: {
      instrumentId,
      startTime,
      endTime,
      // isFirstCall: true,
    },
  });

  if (!resultGetCandles || !resultGetCandles.status) {
    alert(resultGetCandles.message || `Cant makeRequest ${URL_GET_CANDLES}`);
    return [];
  }

  console.log('end loading');

  return resultGetCandles.result;
};
