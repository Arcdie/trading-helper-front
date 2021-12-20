/* global
functions, makeRequest, getUnix, sleep,
objects, constants, moment, ChartCandles, IndicatorVolume, IndicatorSuperTrend
*/

/* Constants */

const URL_GET_CANDLES = '/api/candles';
const URL_GET_USER_TRADE_BOUNDS = '/api/user-trade-bounds';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';

const AVAILABLE_PERIODS = new Map([
  ['1M', '1m'],
  ['5M', '5m'],
]);

const DEFAULT_PERIOD = AVAILABLE_PERIODS.get('5M');

/* Variables */

const windowHeight = window.innerHeight;

let choosenInstrumentId;
let choosenPeriod = DEFAULT_PERIOD;

let instrumentsDocs = [];

const startTime = moment().utc()
  .startOf('day');

const endTime = moment().utc()
  .startOf('minute');

/* JQuery */
const $chartsContainer = $('.charts-container');

const $instrumentsContainer = $('.instruments-container');
const $instrumentsList = $instrumentsContainer.find('.instruments-list .list');

$(document).ready(async () => {
  // start settings

  $instrumentsContainer
    .css({ maxHeight: windowHeight });

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

  const resultGetUserTradeBounds = await makeRequest({
    method: 'GET',
    url: URL_GET_USER_TRADE_BOUNDS,
    query: {
      endDate: endTime.toISOString(),
      startDate: startTime.toISOString(),
      typeTrade: 'PRICE_JUMP',
    },
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

      splitDays({ instrumentId });
      drawTrades({ instrumentId });
    });

  $chartsContainer
    .on('click', '.chart-slider button', function () {
      if (!choosenInstrumentId) {
        return true;
      }

      const $slider = $(this).closest('.chart-slider');
      const chartKey = $slider.attr('class').split(' ')[1];

      const $amountSlides = $slider.find('span.amount-slides');
      const amountSlides = parseInt($amountSlides.text(), 10);

      if (amountSlides === 0) {
        return true;
      }

      if (chartKey === 'futures') {
        const futuresDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);

        scrollToTrade($(this).attr('class'), {
          instrumentId: choosenInstrumentId,
        }, futuresDoc.user_trade_bounds);
      }
    });

  $chartsContainer
    .on('click', '.chart-periods div', async function () {
      const period = $(this).data('period');

      if (period !== choosenPeriod) {
        const $periods = $(this).parent().find('div');
        $periods.removeClass('is_active');
        $(this).addClass('is_active');

        choosenPeriod = period;

        await loadCharts({ instrumentId: choosenInstrumentId });
        drawTrades({ instrumentId: choosenInstrumentId });
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

const loadCharts = async ({
  instrumentId,
}) => {
  $chartsContainer.empty();

  const btcDoc = instrumentsDocs.find(doc => doc.name === 'BTCUSDTPERP');
  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  /*
  if (!btcDoc[`candles_${choosenPeriod}`]) {
    btcDoc[`candles_${choosenPeriod}`] = await getCandlesData({
      period: choosenPeriod,
      instrumentId: btcDoc._id,
      endTime: endTime.toISOString(),
      startTime: startTime.toISOString(),
    });
  }
  */

  btcDoc.original_data = btcDoc[`candles_${choosenPeriod}`];

  futuresDoc.original_data = await getCandlesData({
    period: choosenPeriod,
    instrumentId: futuresDoc._id,
    endTime: endTime.toISOString(),
    startTime: startTime.toISOString(),
  });

  const chartKeys = ['futures'];
  // const chartKeys = ['futures', 'btc'];

  let appendStr = '';

  chartKeys.forEach(chartKey => {
    appendStr += `<div class="chart-container ${chartKey}">
      <div class="charts-nav">
        <div class="legend">
          <p class="values">ОТКР<span class="open">0</span>МАКС<span class="high">0</span>МИН<span class="low">0</span>ЗАКР<span class="close">0</span><span class="percent">0%</span></p>
        </div>
        <div class="row">
          <div class="chart-periods">
            <div class="1m is_worked ${choosenPeriod === AVAILABLE_PERIODS.get('1M') ? 'is_active' : ''}" data-period="1m"><span>1M</span></div>
            <div class="5m is_worked  ${choosenPeriod === AVAILABLE_PERIODS.get('5M') ? 'is_active' : ''}" data-period="5m"><span>5M</span></div>
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
      case 'btc': { chartKeyDoc = btcDoc; break; }

      default: break;
    }

    const chartCandles = new ChartCandles($rootContainer, choosenPeriod, chartKeyDoc);
    const indicatorVolume = new IndicatorVolume($rootContainer);

    const indicatorMicroSuperTrend = new IndicatorSuperTrend(chartCandles.chart, {
      factor: 3,
      artPeriod: 10,
      candlesPeriod: choosenPeriod,
    });

    /*
    const indicatorMacroSuperTrend = new IndicatorSuperTrend(chartCandles.chart, {
      factor: 5,
      artPeriod: 20,
      candlesPeriod: DEFAULT_PERIOD,
    });
    */

    chartCandles.chartKey = chartKey;
    chartCandles.setOriginalData(chartKeyDoc.original_data, false);
    chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);

    indicatorVolume.drawSeries(indicatorVolume.mainSeries, chartCandles.originalData.map(e => ({
      value: e.volume,
      time: e.time,
    })));

    const calculatedData = indicatorMicroSuperTrend.calculateAndDraw(chartCandles.originalData);

    // indicatorMacroSuperTrend.calculateAndDraw(chartCandles.originalData);

    chartKeyDoc.chart_candles = chartCandles;
    chartKeyDoc.indicator_volume = indicatorVolume;
    chartKeyDoc.indicator_micro_supertrend = indicatorMicroSuperTrend;
    // chartKeyDoc.indicator_macro_supertrend = indicatorMacroSuperTrend;

    chartKeyDoc.indicator_micro_supertrend_data = calculatedData;

    const $ruler = $chartContainer.find('span.ruler');
    const $legend = $chartContainer.find('.legend');
    const $low = $legend.find('span.low');
    const $high = $legend.find('span.high');
    const $open = $legend.find('span.open');
    const $close = $legend.find('span.close');
    const $percent = $legend.find('span.percent');

    if (chartKey === 'futures') {
      chartCandles.chart.subscribeClick((param) => {
        if (param.time && futuresDoc.user_trade_bounds.length) {
          let nearestBoundIndex = -1;

          futuresDoc.user_trade_bounds.forEach((bound, index) => {
            if (getUnix(bound.trade_ended_at) < param.time) {
              nearestBoundIndex = index;
            }
          });

          if (~nearestBoundIndex) {
            const $slider = $chartsContainer.find('.chart-slider.futures');

            $slider
              .find('span.current-slide')
              .text(nearestBoundIndex + 1);
          }
        }
      });
    }

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

const splitDays = ({ instrumentId }) => {
  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const futuresChartCandles = futuresDoc.chart_candles;
  let futuresOriginalData = futuresChartCandles.originalData;

  if (!futuresOriginalData || !futuresOriginalData.length) {
    return true;
  }

  const firstCandle = futuresOriginalData[0];

  // skip not full hour
  const divider = firstCandle.originalTimeUnix % 86400;

  if (divider !== 0) {
    const startOfNextDayUnix = (firstCandle.originalTimeUnix - divider) + 86400;

    let increment = 1;
    let startIndex = false;

    while (1) {
      const candle = futuresOriginalData[increment];

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
      return true;
    }

    futuresOriginalData = futuresOriginalData.slice(startIndex, futuresOriginalData.length);
  }

  const intervals = [];
  let newInterval = [futuresOriginalData[0]];
  const lOriginalData = futuresOriginalData.length;

  let day = new Date(futuresOriginalData[0].originalTime).getUTCDate();

  for (let i = 1; i < lOriginalData; i += 1) {
    const dayOfCandle = new Date(futuresOriginalData[i].originalTime).getUTCDate();

    if (dayOfCandle !== day) {
      day = dayOfCandle;

      intervals.push({
        startOfPeriodUnix: newInterval[0].originalTimeUnix,
        endOfPeriodUnix: newInterval[newInterval.length - 1].originalTimeUnix,
      });

      newInterval = [futuresOriginalData[i]];
      continue;
    }

    newInterval.push(futuresOriginalData[i]);
  }

  intervals.forEach(interval => {
    const newCandleExtraSeries = futuresChartCandles.addExtraSeries({
      lastValueVisible: false,
    });

    futuresChartCandles.drawSeries(newCandleExtraSeries, [{
      value: 0,
      time: interval.startOfPeriodUnix,
    }, {
      value: futuresDoc.price * 5,
      time: interval.startOfPeriodUnix,
    }]);
  });
};

const drawTrades = ({ instrumentId }) => {
  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
  const userTradeBounds = futuresDoc.user_trade_bounds || [];
  const futuresChartCandles = futuresDoc.chart_candles;

  futuresChartCandles.extraSeries.forEach(series => {
    futuresChartCandles.removeSeries(series, false);
  });

  if (!userTradeBounds.length) {
    return true;
  }

  const lastFuturesCandle = futuresChartCandles.originalData[futuresChartCandles.originalData.length - 1];
  const coeff = 5 * 60 * 1000;

  userTradeBounds.forEach(bound => {
    if (choosenPeriod === AVAILABLE_PERIODS.get('1M')) {
      bound.trade_started_at_unix = moment(bound.trade_started_at).utc()
        .startOf('minute').unix();

      if (bound.is_active) {
        bound.trade_ended_at_unix = moment().utc().startOf('minute').unix();
      } else {
        bound.trade_ended_at_unix = moment(bound.trade_ended_at)
          .utc().add(1, 'minutes').startOf('minute').unix();
      }
    } else {
      let tradeEndedAtUnix;
      const tradeStartedAtUnix = getUnix(bound.trade_started_at);

      if (bound.is_active) {
        tradeEndedAtUnix = moment().utc().startOf('minute').unix();
      } else {
        tradeEndedAtUnix = getUnix(bound.trade_ended_at);
      }

      const nextIntervalForEndedAtUnix = (Math.ceil((tradeEndedAtUnix * 1000) / coeff) * coeff) / 1000;
      const prevIntervalForStartedAtUnix = ((Math.ceil((tradeStartedAtUnix * 1000) / coeff) * coeff) / 1000) - 300;

      bound.trade_started_at_unix = prevIntervalForStartedAtUnix;
      bound.trade_ended_at_unix = nextIntervalForEndedAtUnix;
    }

    const keyAction = bound.is_long ? 'buy_price' : 'sell_price';

    [
      { key: keyAction, color: constants.YELLOW_COLOR },
      { key: 'stoploss_price', color: constants.RED_COLOR },
      { key: 'takeprofit_price', color: constants.GREEN_COLOR },
    ]
      .filter(e => bound[e.key])
      .forEach(e => {
        const newExtraSeries = futuresChartCandles.addExtraSeries({
          color: e.color,
          lastValueVisible: false,
        });

        futuresChartCandles.drawSeries(newExtraSeries, [{
          value: bound[e.key],
          time: bound.trade_started_at_unix,
        }, {
          value: bound[e.key],
          time: bound.trade_ended_at_unix,
        }]);
      });

    // markers
    if (!bound.sell_price) {
      bound.sell_price = lastFuturesCandle.close;
    }

    if (!bound.buy_price) {
      bound.buy_price = lastFuturesCandle.close;
    }

    const profit = bound.sell_price - bound.buy_price;
    const differenceBetweenPrices = Math.abs(profit);
    let percentPerPrice = 100 / (bound.buy_price / differenceBetweenPrices);

    if (profit < 0) {
      percentPerPrice = -percentPerPrice;
    }

    const shape = bound.is_long ? 'arrowUp' : 'arrowDown';
    const color = profit < 0 ? constants.RED_COLOR : constants.GREEN_COLOR;
    const text = `${(profit * bound.quantity).toFixed(2)} (${percentPerPrice.toFixed(1)}%)`;

    futuresChartCandles.addMarker({
      text,
      shape,
      color,
      time: bound.trade_started_at_unix,
    });
  });

  const $slider = $chartsContainer.find('.chart-slider.futures');

  $slider
    .find('span.amount-slides')
    .text(userTradeBounds.length);

  futuresChartCandles.drawMarkers();
  scrollToTrade(1, { instrumentId }, userTradeBounds);
};

const scrollToTrade = (action, { instrumentId }, userTradeBounds = []) => {
  if (!userTradeBounds.length) {
    return true;
  }

  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
  const futuresChartCandles = futuresDoc.chart_candles;

  const $slider = $chartsContainer.find('.chart-slider.futures');
  const $currentSlide = $slider.find('span.current-slide');
  const $amountSlides = $slider.find('span.amount-slides');

  let currentSlide = parseInt($currentSlide.text(), 10);
  const amountSlides = parseInt($amountSlides.text(), 10);

  if (Number.isInteger(action)) {
    currentSlide = action;
  } else if (action === 'next') {
    currentSlide += 1;
  } else {
    currentSlide -= 1;
  }

  if (currentSlide === 0) {
    currentSlide = amountSlides;
  }

  if (currentSlide === amountSlides + 1) {
    currentSlide = 1;
  }

  $currentSlide.text(currentSlide);

  let barsToTargetCandle = 0;

  const firstCandle = futuresChartCandles.originalData.find(candle =>
    candle.originalTimeUnix === userTradeBounds[currentSlide - 1].trade_started_at_unix,
  );

  for (let i = futuresChartCandles.originalData.length - 1; i >= 0; i -= 1) {
    if (futuresChartCandles.originalData[i].originalTimeUnix === firstCandle.originalTimeUnix) {
      barsToTargetCandle = futuresChartCandles.originalData.length - i; break;
    }
  }

  futuresChartCandles.chart
    .timeScale()
    .scrollToPosition(-barsToTargetCandle, false);
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

  const query = {
    instrumentId,
    startTime,
    endTime,
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
