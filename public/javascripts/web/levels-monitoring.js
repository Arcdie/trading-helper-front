/* global
functions, makeRequest, initPopWindow, getUnix
objects, windows, moment, user, wsClient, ChartCandles, ChartVolume
*/

/* Constants */

const URL_UPDATE_USER = '/api/users';
const URL_GET_CANDLES = '/api/candles';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';
const URL_GET_USER_LEVEL_BOUNDS = '/api/user-level-bounds';
const URL_ADD_USER_LEVELS_BOUNDS = '/api/user-level-bounds/add-levels';

const AVAILABLE_PERIODS = new Map([
  ['5M', '5m'],
  ['1H', '1h'],
  ['4H', '4h'],
  ['DAY', 'day'],
  // ['MONTH', 'month'],
]);

const WORKING_PERIODS = [
  AVAILABLE_PERIODS.get('5M'),
  AVAILABLE_PERIODS.get('1H'),
  AVAILABLE_PERIODS.get('4H'),
  AVAILABLE_PERIODS.get('DAY'),
  // AVAILABLE_PERIODS.get('MONTH'),
];

const TIMEFRAME_NUMBER_CANDLES_MAPPER = {
  [AVAILABLE_PERIODS.get('5M')]: 500,
  [AVAILABLE_PERIODS.get('1H')]: 6000,
  [AVAILABLE_PERIODS.get('4H')]: 18000,
  [AVAILABLE_PERIODS.get('DAY')]: 25000,
  // [AVAILABLE_PERIODS.get('MONTH')]: 30000,
};

const DEFAULT_PERIOD = AVAILABLE_PERIODS.get('5M');

let choosenInstrumentId;
let choosenPeriod = DEFAULT_PERIOD;

let instrumentsDocs = [];
let userLevelBounds = [];

let chartVolume = {};
let chartCandles = {};

/* JQuery */
const $instrumentsContainer = $('.instruments-container');
const $instrumentsList = $instrumentsContainer.find('.instruments-list .list');

const $settings = $('.charts-nav .settings');
const $chartPeriods = $('.chart-periods div');
const $rootContainer = document.getElementsByClassName('charts')[0];

const $legend = $('.legend');
const $open = $legend.find('span.open');
const $close = $legend.find('span.close');
const $high = $legend.find('span.high');
const $low = $legend.find('span.low');

/* Functions */
wsClient.onmessage = async data => {
  const parsedData = JSON.parse(data.data);

  if (parsedData.actionName) {
    switch (parsedData.actionName) {
      case 'candleData': {
        if (parsedData.data.instrumentId !== choosenInstrumentId) {
          break;
        }

        const {
          instrumentId,
          startTime,
          open,
          close,
          high,
          low,
          volume,
        } = parsedData.data;

        let validTime = startTime / 1000;

        if ([!'5m', '1h', '4h'].includes(choosenPeriod)) {
          validTime = moment.unix(validTime).format('YYYY-MM-DD');
        }

        chartCandles.drawSeries(chartCandles.mainSeries, {
          open: parseFloat(open),
          close: parseFloat(close),
          high: parseFloat(high),
          low: parseFloat(low),
          time: validTime,
        });

        chartVolume.drawSeries({
          volume: parseFloat(volume),
          time: validTime,
        });

        break;
      }

      default: break;
    }
  }
};

$(document).ready(async () => {
  const windowHeight = `${window.innerHeight - 20}px`;
  $rootContainer.style.height = windowHeight;

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
    url: URL_GET_USER_LEVEL_BOUNDS,
  });

  if (!resultGetLevels || !resultGetLevels.status) {
    alert(resultGetLevels.message || 'Cant makeRequest URL_GET_USER_LEVEL_BOUNDS');
    return true;
  }

  userLevelBounds = resultGetLevels.result;
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

      $instrumentsList
        .find('.instrument')
        .removeClass('is_active');

      $instrument.addClass('is_active');

      await loadChart({ instrumentId });
    });

  $('.md-content')
    .on('click', '.levels-settings #save-settings', async function () {
      const isDrawLevelsFor1hCandles = $('#is_draw_levels_for_1h_candles').is(':checked');
      const isDrawLevelsFor4hCandles = $('#is_draw_levels_for_4h_candles').is(':checked');
      const isDrawLevelsForDayCandles = $('#is_draw_levels_for_day_candles').is(':checked');

      const numberCandlesForCalculate1hLevels = parseInt($('#number_candles_for_calculate_1h_levels input').val(), 10);
      const numberCandlesForCalculate4hLevels = parseInt($('#number_candles_for_calculate_4h_levels input').val(), 10);
      const numberCandlesForCalculateDayLevels = parseInt($('#number_candles_for_calculate_day_levels input').val(), 10);

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
        is_draw_levels_for_day_candles: isDrawLevelsForDayCandles,
        number_candles_for_calculate_1h_levels: numberCandlesForCalculate1hLevels,
        number_candles_for_calculate_4h_levels: numberCandlesForCalculate4hLevels,
        number_candles_for_calculate_day_levels: numberCandlesForCalculateDayLevels,
      };

      const resultAddLevels = await makeRequest({
        method: 'POST',
        url: URL_ADD_USER_LEVELS_BOUNDS,

        body: {
          userId: user._id,
        },
      });

      if (!resultAddLevels || !resultAddLevels.status) {
        alert(resultUpdate.message || 'Couldnt makeRequest URL_ADD_USER_LEVELS_BOUNDS');
        return false;
      }

      userLevelBounds = resultAddLevels.result;

      if (choosenInstrumentId) {
        drawLevelLines({
          instrumentId: choosenInstrumentId,
          period: choosenPeriod,
        });
      }

      alert('done');
    });
});

const renderListInstruments = targetDocs => {
  let appendInstrumentsStr = '';

  targetDocs.forEach(doc => {
    appendInstrumentsStr += `<div class="instrument" data-instrumentid=${doc._id}>${doc.name}</div>`;
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

  const endTime = instrumentData[instrumentData.length - 1].time;

  userLevelBounds
    .filter(bound => bound.instrument_id === instrumentId)
    .forEach(bound => {
      let startCandleTime = moment(bound.level_start_candle_time).utc();

      switch (period) {
        case 'day': startCandleTime = startCandleTime.startOf('day'); break;
        case '4h': startCandleTime = startCandleTime.startOf('day'); break;
        // case 'month': startCandleTime = startCandleTime.startOf('month'); break;
        default: startCandleTime = startCandleTime.startOf('hour'); break;
      }

      let validTime;

      if (['5m', '1h', '4h'].includes(choosenPeriod)) {
        validTime = startCandleTime.unix();
      } else {
        validTime = startCandleTime.format('YYYY-MM-DD');
      }

      const newExtraSeries = chartCandles.addExtraSeries();

      chartCandles.drawSeries(newExtraSeries, [{
        value: bound.level_price,
        time: validTime,
      }, {
        value: bound.level_price,
        time: endTime,
      }]);
    });
};

const loadChart = async ({
  instrumentId,
}) => {
  console.log('start loading');

  const limit = TIMEFRAME_NUMBER_CANDLES_MAPPER[choosenPeriod];
  const endTime = new Date().toISOString();

  const resultGetCandles = await makeRequest({
    method: 'GET',
    url: `${URL_GET_CANDLES}/${choosenPeriod}?instrumentId=${instrumentId}&limit=${limit}&endTime=${endTime}`,
  });

  if (!resultGetCandles || !resultGetCandles.status) {
    alert(resultGetCandles.message || `Cant makeRequest ${URL_GET_CANDLES}`);
    return true;
  }

  console.log('end loading');

  chartCandles = {};
  chartVolume = {};

  $($rootContainer).empty();

  if (!resultGetCandles.result || !resultGetCandles.result.length) {
    return true;
  }

  choosenInstrumentId = instrumentId;
  const targetDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  chartCandles = new ChartCandles($rootContainer, choosenPeriod);
  chartVolume = new ChartVolume($rootContainer);

  chartCandles.setOriginalData(resultGetCandles.result);

  const listCharts = [chartCandles, chartVolume];

  chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);
  chartVolume.drawSeries(chartCandles.originalData);

  wsClient.send(JSON.stringify({
    actionName: 'subscribe',
    data: {
      subscriptionName: 'candleData',
      instrumentName: targetDoc.name,
    },
  }));

  drawLevelLines({
    instrumentId,
    period: choosenPeriod,
  });

  if (['5m', '1h', '4h'].includes(choosenPeriod)) {
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
        $open.text(price.open);
        $close.text(price.close);
        $low.text(price.low);
        $high.text(price.high);
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
          return true;
        }

        const limit = TIMEFRAME_NUMBER_CANDLES_MAPPER[choosenPeriod];
        const endTime = new Date(chartCandles.originalData[0].timeUnix * 1000).toISOString();

        console.log('start loading');

        const resultGetCandles = await makeRequest({
          method: 'GET',
          url: `${URL_GET_CANDLES}/${choosenPeriod}?instrumentId=${instrumentId}&limit=${limit}&endTime=${endTime}`,
        });

        if (!resultGetCandles || !resultGetCandles.status) {
          alert(resultGetCandles.message || `Cant makeRequest ${URL_GET_CANDLES}`);
          return true;
        }

        console.log('end loading');

        if (!resultGetCandles.result || !resultGetCandles.result.length) {
          isEndHistory = true;
          return true;
        }

        chartCandles.setOriginalData(resultGetCandles.result);

        const instrumentData = chartCandles.originalData
          .filter(e => !e.isRendered);

        chartCandles.drawSeries(chartCandles.mainSeries, instrumentData);
        chartVolume.drawSeries(instrumentData);

        drawLevelLines({
          instrumentId,
          period: choosenPeriod,
        });

        isStartedLoad = false;
      }
    });
};
