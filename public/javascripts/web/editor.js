/* global
functions, makeRequest, getUnix, formatNumberToPretty,
objects, moment, constants, wsClient, ChartCandles, IndicatorVolume, IndicatorMovingAverage, IndicatorCumulativeDeltaVolume
*/

/* Constants */

const URL_GET_CANDLES = '/api/candles';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';
const URL_CREATE_USER_FIGURE_LEVEL_BOUND = '/api/user-figure-level-bounds';
const URL_CHANGE_USER_FIGURE_LEVEL_BOUND = '/api/user-figure-level-bounds';

const AVAILABLE_PERIODS = new Map([
  ['1h', '1h'],
]);

const DEFAULT_PERIOD = AVAILABLE_PERIODS.get('1h');

/* Variables */

const startDate = moment().startOf('year');
const endDate = moment().startOf('hour');

let linePoints = [];
let instrumentsDocs = [];

let choosenInstrumentId;
let choosenPeriod = DEFAULT_PERIOD;
let isActiveLineDrawing = false;
let isActiveLevelDrawing = false;
const windowHeight = window.innerHeight;

let choosedFigureLevel = false;

const settings = {};

const urlSearchParams = new URLSearchParams(window.location.search);
const params = Object.fromEntries(urlSearchParams.entries());

wsClient.onmessage = async data => {
  const parsedData = JSON.parse(data.data);

  if (parsedData.actionName) {
    switch (parsedData.actionName) {
      case 'futuresCandle1hData': updateLastCandle(parsedData.data, AVAILABLE_PERIODS.get('1h')); break;
      default: break;
    }
  }
};

/* JQuery */
const $chartsContainer = $('.charts-container');

const $instrumentsContainer = $('.instruments-container');
const $instrumentsList = $instrumentsContainer.find('.instruments-list .list');

const $settings = $('.settings');

$(document).ready(async () => {
  // start settings

  $instrumentsContainer
    .css({ maxHeight: windowHeight });

  if (params.interval && AVAILABLE_PERIODS.get(params.interval)) {
    choosenPeriod = params.interval;
  }

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

  instrumentsDocs = resultGetInstruments.result;

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

      await loadCharts({ instrumentId });

      choosenInstrumentId = instrumentId;
    });

  $settings
    .find('input[type="text"]')
    .on('change', async function () {
      const className = $(this).attr('class');
      const newValue = parseFloat($(this).val());

      if (!newValue || Number.isNaN(newValue)) {
        return true;
      }

      switch (className) {
        // case 'number-compressions': settings.numberCompressions = newValue; break;
        default: break;
      }

      if (choosenInstrumentId) {
        const instrumentId = choosenInstrumentId;
        const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

        const chartCandles = instrumentDoc.chart_candles;

        chartCandles.extraSeries.forEach(extraSeries => {
          chartCandles.removeSeries(extraSeries, false);
        });

        chartCandles.removeMarkers();
      }
    });

  $chartsContainer
    .on('click', '.chart-periods div', async function () {
      if (!choosenInstrumentId) {
        return true;
      }

      const period = $(this).data('period');

      if (period !== choosenPeriod) {
        const $periods = $(this).parent().find('div');
        $periods.removeClass('is_active');
        $(this).addClass('is_active');

        choosenPeriod = period;

        const instrumentId = choosenInstrumentId;
      }
    })
    .on('click', '.drawing div', function () {
      if (!choosenInstrumentId) {
        return true;
      }

      const $this = $(this);
      const type = $(this).data('type');

      const isActive = $this.hasClass('is_active');

      if (isActive) {
        $this.removeClass('is_active');
        isActiveLineDrawing = false;
        isActiveLevelDrawing = false;
      } else {
        $this.parent().find('div').removeClass('is_active');
        $this.addClass('is_active');

        if (type === 'level') {
          isActiveLevelDrawing = true;
          isActiveLineDrawing = false;
        } else {
          isActiveLevelDrawing = false;
          isActiveLineDrawing = true;
          linePoints = [];
        }
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

  $(document)
    .on('keyup', async e => {
      if (!choosenInstrumentId) {
        return true;
      }

      // arrow right
      if (e.keyCode === 37) {
        const indexOfInstrumentDoc = instrumentsDocs.findIndex(
          doc => doc._id === choosenInstrumentId,
        );

        const prevIndex = indexOfInstrumentDoc - 1;

        if (!instrumentsDocs[prevIndex]) {
          return true;
        }

        $instrumentsList
          .find('.instrument').eq(prevIndex)
          .click();
      } else if (e.keyCode === 39) {
        const indexOfInstrumentDoc = instrumentsDocs.findIndex(
          doc => doc._id === choosenInstrumentId,
        );

        const nextIndex = indexOfInstrumentDoc + 1;

        if (!instrumentsDocs[nextIndex]) {
          return true;
        }

        $instrumentsList
          .find('.instrument').eq(nextIndex)
          .click();
      }

      if (choosedFigureLevel) {
        if (e.keyCode === 8) {
          // <-
          const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
          const chartCandles = instrumentDoc.chart_candles;

          chartCandles.removeSeries(choosedFigureLevel.series, false);

          if (choosedFigureLevel.bound) {
            await changeUserFigureLevelBound({
              boundId: choosedFigureLevel.bound._id,
            }, {
              isActive: false,
              isModerated: true,
            });
          }

          choosedFigureLevel = false;
        } else if (e.keyCode === 187) {
          // +
          choosedFigureLevel.series.applyOptions({ color: constants.BLUE_COLOR });

          if (choosedFigureLevel.bound) {
            await changeUserFigureLevelBound({
              boundId: choosedFigureLevel.bound._id,
            }, { isModerated: true });
          } else {
            delete choosedFigureLevel.series;
            await createUserFigureLevelBound({
              ...choosedFigureLevel,
              isModerated: true,
            });
          }

          choosedFigureLevel = false;
        } else if (e.keyCode === 48) {
          choosedFigureLevel.series.applyOptions({ color: constants.RED_COLOR });
        }
      }
    });
});

/* Functions */

const loadCharts = async ({
  instrumentId,
}) => {
  $chartsContainer.empty();

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  // wsClient.send(JSON.stringify({
  //   actionName: 'unsubscribeFromAll',
  // }));

  instrumentDoc.candles_data = await getCandlesData({
    period: choosenPeriod,
    instrumentId: instrumentDoc._id,

    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });

  const chartKeys = ['futures'];

  let appendStr = '';

  chartKeys.forEach(chartKey => {
    appendStr += `<div class="chart-container ${chartKey}">
      <div class="charts-nav">
        <div class="legend">
          <p class="values">ОТКР<span class="open">0</span>МАКС<span class="high">0</span>МИН<span class="low">0</span>ЗАКР<span class="close">0</span><span class="percent">0%</span></p>
        </div>
        <div class="row">
          <div class="chart-periods">
            <div class="1h is_worked  ${choosenPeriod === AVAILABLE_PERIODS.get('1h') ? 'is_active' : ''}" data-period="1h"><span>1H</span></div>
          </div>
        </div>
        <div class="row">
          <div class="drawing">
            <div class="figure-level" data-type="level">
              <img src="/images/figure-level.png" alt="figure-level">
            </div>
            <div class="figure-line" data-type="line">
              <img src="/images/figure-line.png" alt="figure-line">
            </div>
          </div>
        </div>
      </div>
      <span class="ruler">0%</span>
      <span class="last-swing-data">12M</span>
      <div class="add-notification"><span>+</span></div>
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
      case 'futures': { chartKeyDoc = instrumentDoc; break; }
      default: break;
    }

    const chartCandles = new ChartCandles($rootContainer, DEFAULT_PERIOD, chartKeyDoc);
    const indicatorVolume = new IndicatorVolume($rootContainer);

    chartCandles.chartKey = chartKey;
    chartKeyDoc.chart_candles = chartCandles;
    chartKeyDoc.indicator_volume = indicatorVolume;

    chartCandles.setOriginalData(chartKeyDoc.candles_data, false);
    chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);

    indicatorVolume.drawSeries(indicatorVolume.mainSeries, chartCandles.originalData.map(e => ({
      value: e.volume,
      time: e.time,
    })));

    wsClient.send(JSON.stringify({
      actionName: 'subscribe',
      data: {
        subscriptionName: `futuresCandle${choosenPeriod}Data`,
        instrumentId: instrumentDoc._id,
      },
    }));

    const $ruler = $chartContainer.find('span.ruler');

    const $legend = $chartContainer.find('.legend');
    const $low = $legend.find('span.low');
    const $high = $legend.find('span.high');
    const $open = $legend.find('span.open');
    const $close = $legend.find('span.close');
    const $percent = $legend.find('span.percent');

    if (chartKey === 'futures') {
      chartCandles.chart.subscribeClick((param) => {
        if (param.time && chartCandles.extraSeries.length) {
          const existedSeries = chartCandles.extraSeries.find(
            series => series.id === param.time,
          );

          if (existedSeries) {
            chartCandles.removeSeries(existedSeries, false);
          }
        }

        if (isActiveLevelDrawing) {
          isActiveLevelDrawing = false;
          $chartsContainer.find('.drawing .figure-level').removeClass('is_active');

          const coordinateToPrice = chartCandles.mainSeries.coordinateToPrice(param.point.y);

          const series = drawFigureLevel({ instrumentId }, {
            levelPrice: coordinateToPrice,
            firstCandleTimeUnix: param.time,
          });

          choosedFigureLevel = {
            series,
            instrumentId,

            levelPrice: coordinateToPrice,
            levelTimeframe: choosenPeriod,
            levelStartCandleTime: param.time,
          };
        }
      });
    }

    chartCandles.chart.subscribeCrosshairMove((param) => {
      if (param.point) {
        const coordinateToPrice = chartCandles.mainSeries.coordinateToPrice(param.point.y);
        const differenceBetweenInstrumentAndCoordinatePrices = Math.abs(chartKeyDoc.price - coordinateToPrice);
        const percentPerPrice = 100 / (chartKeyDoc.price / differenceBetweenInstrumentAndCoordinatePrices);

        chartCandles.lastPrice = coordinateToPrice;

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
          const percentPerPrice = 100 / (price.low / differenceBetweenHighAndLow);

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

const updateLastCandle = (data, period) => {
  if (period !== choosenPeriod
    || data.instrumentId !== choosenInstrumentId) {
    return true;
  }

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === data.instrumentId);

  const chartCandles = instrumentDoc.chart_candles;
  const indicatorVolume = instrumentDoc.indicator_volume;

  const candlesData = chartCandles.originalData;
  let lCandles = candlesData.length;

  const {
    startTime,
    open,
    close,
    high,
    low,
    volume,
    isClosed,
  } = data;

  const preparedData = chartCandles.prepareNewData([{
    time: startTime,
    data: [open, close, low, high],
    volume,
  }], false)[0];

  if (!isClosed) {
    candlesData[lCandles - 1] = preparedData;
  } else {
    candlesData.push(preparedData);
    lCandles += 1;
  }

  chartCandles.drawSeries(chartCandles.mainSeries, preparedData);

  indicatorVolume.drawSeries(indicatorVolume.mainSeries, {
    value: preparedData.volume,
    time: preparedData.originalTimeUnix,
  });
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

const renderListInstruments = (instrumentsDocs) => {
  let appendInstrumentsStr = '';

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

const drawFigureLevel = ({ instrumentId }, { firstCandleTimeUnix, levelPrice }) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const chartCandles = instrumentDoc.chart_candles;
  const candlesData = chartCandles.originalData;
  const lCandles = candlesData.length;

  if (!lCandles) {
    return true;
  }

  const lineStyle = 0;
  const color = constants.GREEN_COLOR;

  const newExtraSeries = chartCandles.addExtraSeries({
    color,
    lineStyle,
    lastValueVisible: false,
  }, {
    originalTimeUnix: firstCandleTimeUnix,
  });

  chartCandles.drawSeries(
    newExtraSeries,
    [{
      value: levelPrice,
      time: firstCandleTimeUnix,
    }, {
      value: levelPrice,
      time: candlesData[lCandles - 1].originalTimeUnix,
    }],
  );

  return newExtraSeries;
};

const createUserFigureLevelBound = async (body = {}) => {
  const resultRequest = await makeRequest({
    method: 'POST',
    url: URL_CREATE_USER_FIGURE_LEVEL_BOUND,
    body,
  });

  if (!resultRequest || !resultRequest.status) {
    alert(resultRequest.message || `Cant makeRequest ${URL_CREATE_USER_FIGURE_LEVEL_BOUND}`);
    return false;
  }

  return resultRequest.result;
};

const changeUserFigureLevelBound = async ({ boundId }, changes = {}) => {
  const resultRequest = await makeRequest({
    method: 'PUT',
    url: `${URL_CHANGE_USER_FIGURE_LEVEL_BOUND}/${boundId}`,
    body: changes,
  });

  if (!resultRequest || !resultRequest.status) {
    alert(resultRequest.message || `Cant makeRequest ${URL_CHANGE_USER_FIGURE_LEVEL_BOUND}`);
    return false;
  }

  return resultRequest.result;
};

const getCandlesData = async ({
  instrumentId,
  period,
  startDate,
  endDate,
}) => {
  console.log('start loading');

  if (!startDate) {
    startDate = new Date().toISOString();
  }

  if (!endDate) {
    endDate = moment().utc().toISOString();
  }

  const query = {
    instrumentId,
    startTime: startDate,
    endTime: endDate,
    isFirstCall: false,
  };

  const resultGetCandles = await makeRequest({
    method: 'GET',
    url: `${URL_GET_CANDLES}/${period}`,
    query,
  });

  if (!resultGetCandles || !resultGetCandles.status) {
    alert(resultGetCandles.message || `Cant makeRequest ${URL_GET_CANDLES}`);
    return [];
  }

  console.log('end loading');

  return resultGetCandles.result;
};
