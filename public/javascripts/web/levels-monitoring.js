/* global
functions, makeRequest, initPopWindow,
objects, windows, moment, user, wsClient, ChartCandles, IndicatorVolume, IndicatorSuperTrend, LightweightCharts
*/

/* Constants */

const URL_UPDATE_USER = '/api/users';
const URL_GET_CANDLES = '/api/candles';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';
const URL_GET_USER_LEVEL_BOUNDS = '/api/user-level-bounds';
const URL_ADD_USER_LEVELS_BOUNDS = '/api/user-level-bounds/add-levels';

const AVAILABLE_PERIODS = new Map([
  ['1M', '1m'],
  ['5M', '5m'],
  ['1H', '1h'],
  ['4H', '4h'],
  ['1D', '1d'],
  // ['MONTH', 'month'],
]);

const WORKING_PERIODS = [
  AVAILABLE_PERIODS.get('1M'),
  AVAILABLE_PERIODS.get('5M'),
  AVAILABLE_PERIODS.get('1H'),
  AVAILABLE_PERIODS.get('4H'),
  AVAILABLE_PERIODS.get('1D'),
  // AVAILABLE_PERIODS.get('MONTH'),
];

const windowWidth = window.innerWidth;
const windowHeight = window.innerHeight;

// const userTimezone = 0;
const userTimezone = -(new Date().getTimezoneOffset());

const LIMIT_GET_CANDLES = 320;
// const LIMIT_GET_CANDLES = Math.ceil(windowWidth / 6);
const DEFAULT_PERIOD = AVAILABLE_PERIODS.get('5M');

let choosenInstrumentId;
let choosenPeriod = DEFAULT_PERIOD;

let isLoading = false;
let instrumentsDocs = [];

let chartCandles = {};
let indicatorVolume = {};
let indicatorMicroSuperTrend = {};
let indicatorMacroSuperTrend = {};

/* JQuery */
const $instrumentsContainer = $('.instruments-container');
const $instrumentsList = $instrumentsContainer.find('.instruments-list .list');

const $ruler = $('span.ruler');
const $chartsNav = $('.charts-nav');
const $rootContainer = $('.charts');
const $chartPeriods = $('.chart-periods div');
const $settings = $chartsNav.find('.settings');

const $legend = $('.legend');
const $low = $legend.find('span.low');
const $high = $legend.find('span.high');
const $open = $legend.find('span.open');
const $close = $legend.find('span.close');
const $percent = $legend.find('span.percent');

/* Functions */
wsClient.onmessage = async data => {
  const parsedData = JSON.parse(data.data);

  if (parsedData.actionName) {
    switch (parsedData.actionName) {
      case 'newFuturesInstrumentPrice': {
        const {
          newPrice,
          instrumentName,
        } = parsedData.data;

        const targetDoc = instrumentsDocs.find(doc => doc.name === instrumentName);

        if (targetDoc) {
          targetDoc.price = newPrice;
        }

        break;
      }

      case 'candle1mData': updateLastCandle(parsedData.data, '1m'); break;
      case 'candle5mData': updateLastCandle(parsedData.data, '5m'); break;
      case 'candle1hData': updateLastCandle(parsedData.data, '1h'); break;
      case 'candle4hData': updateLastCandle(parsedData.data, '4h'); break;
      case 'candle1dData': updateLastCandle(parsedData.data, '1d'); break;

      case 'levelsLoaded': {
        const $amountLoadedLevels = $('#amount-loaded-levels');
        const currentAmount = parseInt($amountLoadedLevels.text(), 10);
        $amountLoadedLevels.text(currentAmount + 1);
        break;
      }

      case 'userLevelBoundsCreated': {
        location.reload(true);
        break;
      }

      case 'levelWasWorked': {
        const {
          boundId,
          instrumentId,
        } = parsedData.data;

        const targetDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

        if (!targetDoc) {
          break;
        }

        const targetBound = targetDoc.user_level_bounds.find(
          bound => bound.bound_id === boundId,
        );

        if (!targetBound) {
          break;
        }

        targetDoc.worked_user_level_bounds.push({
          worked_at: new Date(),
          ...targetBound,
        });

        const targetSeries = chartCandles.extraSeries.find(
          series => series.options().boundId === boundId,
        );

        if (targetSeries) {
          targetSeries.applyOptions({
            lineType: LightweightCharts.LineType.Simple,
            lineStyle: LightweightCharts.LineStyle.LargeDashed,
          });
        }

        targetDoc.user_level_bounds = targetDoc.user_level_bounds.filter(
          bound => bound.bound_id !== boundId,
        );

        break;
      }

      default: break;
    }
  }
};

$(document).ready(async () => {
  $rootContainer.css({ height: windowHeight - 20 });

  const resultGetInstruments = await makeRequest({
    method: 'GET',
    url: `${URL_GET_ACTIVE_INSTRUMENTS}?isOnlyFutures=true`,
  });

  if (!resultGetInstruments || !resultGetInstruments.status) {
    alert(resultGetInstruments.message || 'Cant makeRequest URL_GET_ACTIVE_INSTRUMENTS');
    return true;
  }

  const resultGetLevels = await makeRequest({
    method: 'GET',
    url: `${URL_GET_USER_LEVEL_BOUNDS}?userId=${user._id}`,
  });

  if (!resultGetLevels || !resultGetLevels.status) {
    alert(resultGetLevels.message || 'Cant makeRequest URL_GET_USER_LEVEL_BOUNDS');
    return true;
  }

  instrumentsDocs = resultGetInstruments.result;

  $instrumentsContainer
    .css({ maxHeight: windowHeight });

  $instrumentsList
    .css({ maxHeight: windowHeight });

  renderListInstruments(instrumentsDocs);

  if (resultGetLevels.result.length) {
    instrumentsDocs.forEach(instrumentDoc => {
      if (!instrumentDoc.user_level_bounds) {
        instrumentDoc.user_level_bounds = [];
      }

      if (!instrumentDoc.worked_user_level_bounds) {
        instrumentDoc.worked_user_level_bounds = [];
      }

      const targetBounds = resultGetLevels.result.filter(
        bound => bound.instrument_id === instrumentDoc._id,
      );

      if (targetBounds && targetBounds.length) {
        targetBounds.forEach(bound => {
          if (!bound.is_worked) {
            instrumentDoc.user_level_bounds.push({
              bound_id: bound._id,
              level_price: bound.level_price,
              level_timeframe: bound.level_timeframe,
              level_start_candle_time: bound.level_start_candle_time,
            });
          } else {
            instrumentDoc.worked_user_level_bounds.push({
              bound_id: bound._id,
              worked_at: bound.worked_at,
              level_price: bound.level_price,
              level_timeframe: bound.level_timeframe,
              level_start_candle_time: bound.level_start_candle_time,
            });
          }
        });
      }
    });

    intervalCalculateLevels(10 * 1000);
  }

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

        await loadChart({
          instrumentId: choosenInstrumentId,
        });
      }
    });

  $settings
    .on('click', () => {
      initPopWindow(windows.getLevelsMonitoringSettings(user.levels_monitoring_settings || {}));
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

      $instrumentsList
        .find('.instrument')
        .removeClass('is_active');

      $instrument.addClass('is_active');

      choosenInstrumentId = instrumentId;
      await loadChart({ instrumentId });
    });

  $('.md-content')
    .on('click', '.levels-settings #save-settings', async function () {
      const isDrawLevelsFor1hCandles = $('#is_draw_levels_for_1h_candles').is(':checked');
      const isDrawLevelsFor4hCandles = $('#is_draw_levels_for_4h_candles').is(':checked');
      const isDrawLevelsForDayCandles = $('#is_draw_levels_for_1d_candles').is(':checked');

      const numberCandlesForCalculate1hLevels = parseInt($('#number_candles_for_calculate_1h_levels input').val(), 10);
      const numberCandlesForCalculate4hLevels = parseInt($('#number_candles_for_calculate_4h_levels input').val(), 10);
      const numberCandlesForCalculateDayLevels = parseInt($('#number_candles_for_calculate_1d_levels input').val(), 10);

      if (!numberCandlesForCalculate1hLevels || Number.isNaN(numberCandlesForCalculate1hLevels)) {
        alert('Неправильно заполнено поле "К-во свечей для расчета часовых уровней"');
        return false;
      }

      if (!numberCandlesForCalculate4hLevels || Number.isNaN(numberCandlesForCalculate4hLevels)) {
        alert('Неправильно заполнено поле "К-во свечей для расчета 4х-часовых уровней"');
        return false;
      }

      if (!numberCandlesForCalculateDayLevels || Number.isNaN(numberCandlesForCalculateDayLevels)) {
        alert('Неправильно заполнено поле "К-во свечей для расчета дневных уровней"');
        return false;
      }

      $(this).prop('disabled', true);

      const resultUpdate = await makeRequest({
        method: 'PATCH',
        url: `${URL_UPDATE_USER}/${user._id}`,
        body: {
          isDrawLevelsFor1hCandles,
          isDrawLevelsFor4hCandles,
          isDrawLevelsForDayCandles,
          numberCandlesForCalculate1hLevels,
          numberCandlesForCalculate4hLevels,
          numberCandlesForCalculateDayLevels,
        },
      });

      if (!resultUpdate || !resultUpdate.status) {
        alert(resultUpdate.message || 'Couldnt makeRequest URL_UPDATE_USER');
        return false;
      }

      user.levels_monitoring_settings = {
        is_draw_levels_for_1h_candles: isDrawLevelsFor1hCandles,
        is_draw_levels_for_4h_candles: isDrawLevelsFor4hCandles,
        is_draw_levels_for_1d_candles: isDrawLevelsForDayCandles,
        number_candles_for_calculate_1h_levels: numberCandlesForCalculate1hLevels,
        number_candles_for_calculate_4h_levels: numberCandlesForCalculate4hLevels,
        number_candles_for_calculate_1d_levels: numberCandlesForCalculateDayLevels,
      };

      $('.shadow').click();

      initPopWindow(windows.getLevelsLoadingPage(instrumentsDocs.length));

      await makeRequest({
        method: 'POST',
        url: URL_ADD_USER_LEVELS_BOUNDS,

        body: {
          userId: user._id,
        },
      });
    });
});

const renderListInstruments = targetDocs => {
  let appendInstrumentsStr = '';

  targetDocs.forEach(doc => {
    appendInstrumentsStr += `<div
      id="instrument-${doc._id}"
      class="instrument"
      data-instrumentid=${doc._id}>
      <span class="instrument-name">${doc.name}</span>
      <span class="levels"></span>
    </div>`;
  });

  $instrumentsList
    .empty()
    .append(appendInstrumentsStr);
};

const drawLevelLines = ({
  instrumentId,
  period,
}) => {
  chartCandles.extraSeries.forEach(series => {
    chartCandles.removeSeries(series, false);
  });

  const instrumentData = chartCandles.originalData;

  if (!instrumentData || !instrumentData.length) {
    return true;
  }

  let validEndTime;
  const endTime = moment
    .unix(instrumentData[instrumentData.length - 1].originalTimeUnix)
    .add(1, 'M');

  if (['1m', '5m', '1h', '4h'].includes(choosenPeriod)) {
    validEndTime = endTime.unix();
  } else {
    validEndTime = endTime.format('YYYY-MM-DD');
  }

  const targetInstrumentDoc = instrumentsDocs.find(doc => instrumentId === doc._id);

  if (!targetInstrumentDoc.user_level_bounds || !targetInstrumentDoc.user_level_bounds.length) {
    return true;
  }

  targetInstrumentDoc.user_level_bounds
    .forEach(bound => {
      let startCandleTime = moment(bound.level_start_candle_time).utc();

      switch (period) {
        case '1d': startCandleTime = startCandleTime.startOf('day'); break;
        case '4h': startCandleTime = startCandleTime.startOf('day'); break;
        // case 'month': startCandleTime = startCandleTime.startOf('month'); break;
        default: startCandleTime = startCandleTime.startOf('hour'); break;
      }

      let validTime;

      if (['1m', '5m', '1h', '4h'].includes(choosenPeriod)) {
        validTime = startCandleTime.unix();
      } else {
        validTime = startCandleTime.format('YYYY-MM-DD');
      }

      const newExtraSeries = chartCandles.addExtraSeries({
        boundId: bound.bound_id,
        priceScaleId: 'level',
      });

      chartCandles.drawSeries(newExtraSeries, [{
        value: bound.level_price,
        time: validTime,
      }, {
        value: bound.level_price,
        time: validEndTime,
      }]);
    });

  targetInstrumentDoc.worked_user_level_bounds
    .forEach(bound => {
      let startCandleTime = moment(bound.level_start_candle_time).utc();
      let endCandleTime = moment(bound.worked_at).utc();

      switch (period) {
        case '1d': {
          startCandleTime = startCandleTime.startOf('day');
          endCandleTime = endCandleTime.endOf('day'); break;
        }

        case '4h': {
          startCandleTime = startCandleTime.startOf('day');
          endCandleTime = endCandleTime.endOf('day'); break;
        }

        default: {
          startCandleTime = startCandleTime.startOf('hour');
          endCandleTime = endCandleTime.endOf('hour'); break;
        }
      }

      let validTime;

      if (['1m', '5m', '1h', '4h'].includes(choosenPeriod)) {
        validTime = startCandleTime.unix();
        validEndTime = endCandleTime.unix();
      } else {
        validTime = startCandleTime.format('YYYY-MM-DD');
        validEndTime = endCandleTime.format('YYYY-MM-DD');
      }

      const newExtraSeries = chartCandles.addExtraSeries({
        priceScaleId: 'level',
        boundId: bound.bound_id,
        lineType: LightweightCharts.LineType.Simple,
        lineStyle: LightweightCharts.LineStyle.LargeDashed,
      });

      chartCandles.drawSeries(newExtraSeries, [{
        value: bound.level_price,
        time: validTime,
      }, {
        value: bound.level_price,
        time: validEndTime,
      }]);
    });
};

const loadChart = async ({
  instrumentId,
}) => {
  console.log('start loading');

  const endTime = new Date().toISOString();

  const resultGetCandles = await makeRequest({
    method: 'GET',
    url: `${URL_GET_CANDLES}/${choosenPeriod}`,
    query: {
      endTime,
      instrumentId,
      isFirstCall: true,
      limit: LIMIT_GET_CANDLES,
    },
  });

  if (!resultGetCandles || !resultGetCandles.status) {
    alert(resultGetCandles.message || `Cant makeRequest ${URL_GET_CANDLES}`);
    isLoading = false;
    return true;
  }

  console.log('end loading');

  chartCandles = {};
  indicatorVolume = {};
  indicatorMicroSuperTrend = {};
  indicatorMacroSuperTrend = {};

  $rootContainer.empty();

  if (!resultGetCandles.result || !resultGetCandles.result.length) {
    isLoading = false;
    return true;
  }

  choosenInstrumentId = instrumentId;
  const targetDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  chartCandles = new ChartCandles($rootContainer, choosenPeriod, targetDoc);
  indicatorVolume = new IndicatorVolume($rootContainer);

  indicatorMicroSuperTrend = new IndicatorSuperTrend(chartCandles.chart, {
    factor: 3,
    artPeriod: 10,
    candlesPeriod: choosenPeriod,
  });

  indicatorMacroSuperTrend = new IndicatorSuperTrend(chartCandles.chart, {
    factor: 5,
    artPeriod: 20,
    candlesPeriod: choosenPeriod,
  });

  chartCandles.setOriginalData(resultGetCandles.result);

  const listCharts = [chartCandles, indicatorVolume];

  chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);
  indicatorVolume.drawSeries(chartCandles.originalData);
  indicatorMicroSuperTrend.calculateAndDraw(chartCandles.originalData);
  indicatorMacroSuperTrend.calculateAndDraw(chartCandles.originalData);

  wsClient.send(JSON.stringify({
    actionName: 'subscribe',
    data: {
      subscriptionName: `candle${choosenPeriod}Data`,
      instrumentId: targetDoc._id,
    },
  }));

  wsClient.send(JSON.stringify({
    actionName: 'subscribe',
    data: { subscriptionName: 'newFuturesInstrumentPrice' },
  }));

  drawLevelLines({
    instrumentId,
    period: choosenPeriod,
  });

  if (['1m', '5m', '1h', '4h'].includes(choosenPeriod)) {
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
    if (param.point) {
      const coordinateToPrice = chartCandles.mainSeries.coordinateToPrice(param.point.y);
      const differenceBetweenInstrumentAndCoordinatePrices = Math.abs(targetDoc.price - coordinateToPrice);
      const percentPerPrice = 100 / (targetDoc.price / differenceBetweenInstrumentAndCoordinatePrices);

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

  let isEndHistory = false;
  let isStartedLoad = false;

  chartCandles.chart
    .timeScale()
    .subscribeVisibleLogicalRangeChange(async newVisibleLogicalRange => {
      if (isStartedLoad || isEndHistory) {
        return true;
      }

      const barsInfo = chartCandles.mainSeries.barsInLogicalRange(newVisibleLogicalRange);

      if (barsInfo !== null && barsInfo.barsBefore < -5) {
        isStartedLoad = true;

        if (!chartCandles.originalData.length) {
          isLoading = false;
          return true;
        }

        isLoading = true;

        const endTime = new Date(chartCandles.originalData[0].originalTimeUnix * 1000).toISOString();

        console.log('start loading');

        const resultGetCandles = await makeRequest({
          method: 'GET',
          url: `${URL_GET_CANDLES}/${choosenPeriod}?instrumentId=${instrumentId}&limit=${LIMIT_GET_CANDLES}&endTime=${endTime}`,
        });

        if (!resultGetCandles || !resultGetCandles.status) {
          alert(resultGetCandles.message || `Cant makeRequest ${URL_GET_CANDLES}`);
          isLoading = false;
          return true;
        }

        console.log('end loading');

        if (!resultGetCandles.result || !resultGetCandles.result.length) {
          isEndHistory = true;
          isLoading = false;
          return true;
        }

        chartCandles.setOriginalData(resultGetCandles.result);

        chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);
        indicatorVolume.drawSeries(chartCandles.originalData);
        indicatorMicroSuperTrend.calculateAndDraw(chartCandles.originalData);
        indicatorMacroSuperTrend.calculateAndDraw(chartCandles.originalData);

        drawLevelLines({
          instrumentId,
          period: choosenPeriod,
        });

        isLoading = false;
        isStartedLoad = false;
      }
    });

  isLoading = false;
};

const updateLastCandle = (data, period) => {
  if (period !== choosenPeriod
    || data.instrumentId !== choosenInstrumentId) {
    return true;
  }

  const {
    startTime,
    open,
    close,
    high,
    low,
    volume,
  } = data;

  let validTime = (startTime / 1000) + (userTimezone * 60);

  if (!['1m', '5m', '1h', '4h'].includes(choosenPeriod)) {
    validTime = moment.unix(validTime).format('YYYY-MM-DD');
  }

  chartCandles.drawSeries(chartCandles.mainSeries, {
    open: parseFloat(open),
    close: parseFloat(close),
    high: parseFloat(high),
    low: parseFloat(low),
    time: validTime,
  });

  indicatorVolume.drawSeries({
    volume: parseFloat(volume),
    time: validTime,
  });
};

const intervalCalculateLevels = (interval) => {
  instrumentsDocs.forEach(instrumentDoc => {
    instrumentDoc.user_level_bounds.forEach(bound => {
      const differenceBetweenInstrumentAndLevelPrices = Math.abs(instrumentDoc.price - bound.level_price);
      const percentPerPrice = 100 / (instrumentDoc.price / differenceBetweenInstrumentAndLevelPrices);

      bound.percent_per_price = percentPerPrice;
    });

    instrumentDoc.user_level_bounds = instrumentDoc.user_level_bounds.sort(
      (a, b) => a.percent_per_price < b.percent_per_price ? -1 : 1
    );
  });

  const sortedInstruments = instrumentsDocs
    // .filter(doc => doc.user_level_bounds.length)
    .sort((a, b) => {
      if (!a.user_level_bounds[0]) {
        return 1;
      }

      if (!b.user_level_bounds[0]) {
        return -1;
      }

      return a.user_level_bounds[0].percent_per_price < b.user_level_bounds[0].percent_per_price ? -1 : 1;
    });

  sortedInstruments.forEach((instrumentDoc, index) => {
    const $instrument = $(`#instrument-${instrumentDoc._id}`);

    $instrument.css('order', index);

    if (instrumentDoc.user_level_bounds[0]) {
      $instrument
        .find('.levels')
        .text(`${instrumentDoc.user_level_bounds[0].percent_per_price.toFixed(1)}%`);
    }
  });

  setTimeout(intervalCalculateLevels, interval, interval);
};
