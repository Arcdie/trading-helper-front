/* global
functions, makeRequest,
objects, moment, constants, ChartCandles, IndicatorVolume, IndicatorMovingAverage
*/

/* Constants */

const URL_GET_CANDLES = '/api/candles';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';

const AVAILABLE_PERIODS = new Map([
  ['5m', '5m'],
]);

const DEFAULT_PERIOD = AVAILABLE_PERIODS.get('5m');

/* Variables */

// const startDate = moment().utc()
//   .add(-5, 'days');
//   // .startOf('month');
//
// const endDate = moment().utc()
//   .startOf('hour');

let startTimeOfTargetPeriod = moment();
const endTimeOfTargetPeriod = moment();

let instrumentsDocs = [];

let choosenInstrumentId;
const windowHeight = window.innerHeight;

const urlSearchParams = new URLSearchParams(window.location.search);
const params = Object.fromEntries(urlSearchParams.entries());

const choosenPeriod = DEFAULT_PERIOD;

const settings = {
  periodForShortMA: 20,
  periodForMediumMA: 50,

  colorForShortMA: '#0800FF',
  colorForMediumMA: '#2196F3',
};

/* JQuery */
const $chartsContainer = $('.charts-container');

$(document).ready(async () => {
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

  await loadCharts(choosenInstrumentId);
});

/* Functions */

const calculateCorrelation = () => {
  const btcDoc = instrumentsDocs.find(doc => doc.name === 'BTCUSDTPERP');

  const results = [];

  instrumentsDocs
    .filter(doc => doc.is_futures && doc.is_active)
    .forEach(doc => {
      const candlesData = doc.candles_data;
      const lCandlesData = candlesData.length;

      const startValue = candlesData[0].open;
      const endValue = candlesData[lCandlesData - 1].close;

      const differenceBetweenValues = Math.abs(startValue - endValue);
      const percentPerPrice = 100 / (startValue / differenceBetweenValues);

      results.push({
        instrumentName: doc.name,
        result: percentPerPrice,
      });
    });

  const sortedResults = results.sort((a, b) => a.result < b.result ? -1 : 1);

  const candlesData = btcDoc.candles_data;
  const lCandlesData = candlesData.length;
  const startValue = candlesData[0].open;
  const endValue = candlesData[lCandlesData - 1].close;

  const differenceBetweenValues = Math.abs(startValue - endValue);
  const percentPerPrice = 100 / (startValue / differenceBetweenValues);

  console.log(btcDoc.name, `${percentPerPrice.toFixed(2)}%`);

  sortedResults.forEach(result => {
    console.log(result.instrumentName, `${result.result.toFixed(2)}%`);
  });
};

const loadCharts = async (instrumentId) => {
  $chartsContainer.empty();

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  instrumentDoc.candles_data = await getCandlesData({
    period: choosenPeriod,
    instrumentId: instrumentDoc._id,

    // startTime: startDate.toISOString(),
    // endTime: endDate.toISOString(),

    isFirstCall: true,
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
            <div class="5m is_worked  ${choosenPeriod === AVAILABLE_PERIODS.get('5m') ? 'is_active' : ''}" data-period="5m"><span>5M</span></div>
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
      case 'futures': { chartKeyDoc = instrumentDoc; break; }
      default: break;
    }

    const chartCandles = new ChartCandles($rootContainer, choosenPeriod, chartKeyDoc);
    const indicatorVolume = new IndicatorVolume($rootContainer);

    const indicatorMovingAverageMedium = new IndicatorMovingAverage(chartCandles.chart, {
      color: settings.colorForMediumMA,
      period: settings.periodForMediumMA,
    });

    chartCandles.chartKey = chartKey;
    chartKeyDoc.chart_candles = chartCandles;
    chartKeyDoc.indicator_volume = indicatorVolume;
    chartKeyDoc.indicator_moving_average_medium = indicatorMovingAverageMedium;

    chartCandles.setOriginalData(chartKeyDoc.candles_data, false);
    chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);

    indicatorVolume.drawSeries(indicatorVolume.mainSeries, chartCandles.originalData.map(e => ({
      value: e.volume,
      time: e.time,
    })));

    const calculatedData = indicatorMovingAverageMedium.calculateAndDraw(chartCandles.originalData);
    indicatorMovingAverageMedium.calculatedData = calculatedData;

    const $ruler = $chartContainer.find('span.ruler');
    const $legend = $chartContainer.find('.legend');
    const $low = $legend.find('span.low');
    const $high = $legend.find('span.high');
    const $open = $legend.find('span.open');
    const $close = $legend.find('span.close');
    const $percent = $legend.find('span.percent');

    chartCandles.chart.subscribeClick(async (param) => {
      if (param.time) {
        startTimeOfTargetPeriod = param.time;

        const candlesData = await getCandlesData({
          period: choosenPeriod,

          endTime: endTimeOfTargetPeriod.toISOString(),
          startTime: moment.unix(startTimeOfTargetPeriod).toISOString(),
        });

        instrumentsDocs.forEach(doc => {
          doc.candles_data = candlesData.filter(candle => candle.instrument_id === doc._id);
          doc.candles_data = chartCandles.prepareNewData(doc.candles_data, false);
        });

        calculateCorrelation();
      }
    });

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

const getCandlesData = async ({
  instrumentId,
  period,
  startTime,
  endTime,

  isFirstCall,
}) => {
  console.log('start loading');

  if (!endTime) {
    endTime = new Date().toISOString();
  }

  if (!startTime) {
    startTime = moment().utc().startOf('day').toISOString();
  }

  const query = {
    startTime,
    endTime,
    isFirstCall: isFirstCall || false,
    // isFirstCall: true,
  };

  if (instrumentId) {
    query.instrumentId = instrumentId;
  }

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
