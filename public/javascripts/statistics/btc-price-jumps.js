/* global
functions, makeRequest, getUnix, sleep,
objects, constants, moment, ChartCandles, IndicatorVolume, IndicatorMovingAverage
*/

/* Constants */

const URL_GET_CANDLES = '/api/candles';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';

const AVAILABLE_PERIODS = new Map([
  ['5m', '5m'],
]);

/* Variables */

const windowHeight = window.innerHeight;

let choosenInstrumentId;
let choosenPeriod = AVAILABLE_PERIODS.get('5m');

let priceJumps = [];
let instrumentsDocs = [];

const settings = {
  periodForMediumMA: 50,
  colorForMediumMA: '#2196F3',

  growPercent: 1,
};

const startTime = moment().utc()
  .startOf('month');

const endTime = moment().utc()
  .startOf('hour');

/* JQuery */
const $chartsContainer = $('.charts-container');

const $settings = $('.settings');

$(document).ready(async () => {
  const urlSearchParams = new URLSearchParams(window.location.search);
  const params = Object.fromEntries(urlSearchParams.entries());

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

  const btcDoc = instrumentsDocs.find(doc => doc.name === 'BTCUSDTPERP');
  choosenInstrumentId = btcDoc._id;

  await loadCharts({ instrumentId: btcDoc._id });

  // splitDays({ instrumentId });

  priceJumps = calculatePriceJumps({ instrumentId: btcDoc._id });
  drawMarkersForPriceJumps({ instrumentId: btcDoc._id });

  // main logic
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
        scrollToPriceJump($(this).attr('class'), {
          instrumentId: choosenInstrumentId,
        }, priceJumps);
      }
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
        default: break;
      }

      if (choosenInstrumentId) {
        const instrumentId = choosenInstrumentId;

        priceJumps = calculatePriceJumps({ instrumentId });
        drawMarkersForPriceJumps({ instrumentId });
      }
    });

  $settings
    .find('input[type="checkbox"]')
    .on('change', async function () {
      const id = $(this).attr('id');
      const newValue = $(this).is(':checked');

      switch (id) {
        default: break;
      }

      if (choosenInstrumentId) {
        const instrumentId = choosenInstrumentId;

        await loadCharts({ instrumentId });

        priceJumps = calculatePriceJumps({ instrumentId });
        drawMarkersForPriceJumps({ instrumentId });
      }
    });
});

const loadCharts = async ({
  instrumentId,
}) => {
  $chartsContainer.empty();

  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  if (!futuresDoc.original_data || !futuresDoc.original_data.length) {
    futuresDoc.original_data = await getCandlesData({
      period: choosenPeriod,
      instrumentId: futuresDoc._id,
      endTime: endTime.toISOString(),
      startTime: startTime.toISOString(),
    });
  }

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
            <div class="5m is_worked is_active" data-period="5m"><span>5M</span></div>
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

    const chartCandles = new ChartCandles($rootContainer, choosenPeriod, chartKeyDoc);
    const indicatorVolume = new IndicatorVolume($rootContainer);

    const indicatorMovingAverageMedium = new IndicatorMovingAverage(chartCandles.chart, {
      color: settings.colorForMediumMA,
      period: settings.periodForMediumMA,
    });

    chartCandles.chartKey = chartKey;
    chartCandles.setOriginalData(chartKeyDoc.original_data, false);
    chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);

    indicatorVolume.drawSeries(indicatorVolume.mainSeries, chartCandles.originalData.map(e => ({
      value: e.volume,
      time: e.time,
    })));

    const calculatedData = indicatorMovingAverageMedium.calculateAndDraw(chartCandles.originalData);
    indicatorMovingAverageMedium.calculatedData = calculatedData;


    chartKeyDoc.chart_candles = chartCandles;
    chartKeyDoc.indicator_volume = indicatorVolume;
    chartKeyDoc.indicator_moving_average_medium = indicatorMovingAverageMedium;

    const $ruler = $chartContainer.find('span.ruler');
    const $legend = $chartContainer.find('.legend');
    const $low = $legend.find('span.low');
    const $high = $legend.find('span.high');
    const $open = $legend.find('span.open');
    const $close = $legend.find('span.close');
    const $percent = $legend.find('span.percent');

    if (chartKey === 'futures') {
      chartCandles.chart.subscribeClick((param) => {
        if (param.time && priceJumps.length) {
          let nearestBoundIndex = -1;

          priceJumps.forEach((priceJump, index) => {
            if (priceJump.originalTimeUnix < param.time) {
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


const calculatePriceJumps = ({ instrumentId }) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const priceJumps = [];
  const chartCandles = instrumentDoc.chart_candles;

  const candlesData = chartCandles.originalData;
  const lCandlesData = candlesData.length;

  if (!lCandlesData) {
    return true;
  }

  for (let i = 0; i < lCandlesData; i += 1) {
    const candle = candlesData[i];

    const differenceBetweenPrices = Math.abs(candle.high - candle.low);
    const percentPerPrice = 100 / (candle.high / differenceBetweenPrices);


    if (percentPerPrice > settings.growPercent) {
      priceJumps.push({
        ...candle,
      });
    }
  }

  return priceJumps;
};

const drawMarkersForPriceJumps = ({ instrumentId }) => {
  if (!priceJumps || !priceJumps.length) {
    return true;
  }

  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
  const futuresChartCandles = futuresDoc.chart_candles;

  futuresChartCandles.removeMarkers();

  priceJumps.forEach(priceJump => {
    futuresChartCandles.addMarker({
      shape: 'arrowDown',
      color: '#4CAF50',
      time: priceJump.originalTimeUnix,
      // text,
    });
  });

  futuresChartCandles.drawMarkers();

  const $slider = $chartsContainer.find('.chart-slider.futures');

  $slider
    .find('span.amount-slides')
    .text(priceJumps.length);

  scrollToPriceJump(1, { instrumentId }, priceJumps);
};

const scrollToPriceJump = (action, { instrumentId }, priceJumps = []) => {
  if (!priceJumps.length) {
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
    candle.originalTimeUnix === priceJumps[currentSlide - 1].originalTimeUnix,
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
