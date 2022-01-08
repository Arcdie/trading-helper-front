/* global
functions, documentOnReady,
objects, moment, Statistics, ,
variable, $settings, AVAILABLE_PERIODS
*/

/* Constants */

const TYPE_STRATEGY = 'ANGLED_LINE';
const DEFAULT_PERIOD = AVAILABLE_PERIODS.get('5M');

/* Variables */

const isSaveMode = false;

const settings = {
  stopLossPercent: false,
  // factorForPriceChange: false,
  considerBtcMircoTrend: false,
  considerFuturesMircoTrend: false,
};

const startDate = moment().utc()
  .startOf('day')
  .add(-5, 'days');

const endDate = moment().utc()
  .startOf('day').add(-1, 'hour');

/* JQuery */

$(document).ready(async () => {
  const statistics = new Statistics({
    isSaveMode,
    typeStrategy: TYPE_STRATEGY,
    defaultPeriod: DEFAULT_PERIOD,
  });

  const constants = await statistics.getConstants();

  const instrumentsDocs = await statistics.getActiveInstruments({
    isOnlyFutures: true,
  });

  if (!constants || !instrumentsDocs) {
    return false;
  }

  settings.stopLossPercent = constants.STOPLOSS_PERCENT;
  settings.factorForPriceChange = constants.FACTOR_FOR_PRICE_CHANGE;
  settings.considerBtcMircoTrend = constants.DOES_CONSIDER_BTC_MICRO_TREND;
  settings.considerFuturesMircoTrend = constants.DOES_CONSIDER_FUTURES_MICRO_TREND;
  settings.candlesForCalculateAveragePercent = constants.NUMBER_CANDLES_FOR_CALCULATE_AVERAGE_PERCENT;

  statistics.setConstants(settings);
  statistics.setInstrumentsDocs(instrumentsDocs);

  $settings.find('.stoploss-percent').val(settings.stopLossPercent);
  $settings.find('.factor-for-price-change').val(settings.factorForPriceChange);
  $settings.find('.candles-for-calculate-average-percent').val(settings.candlesForCalculateAveragePercent);

  $settings.find('#consider-btc-mirco-trend').prop('checked', settings.considerBtcMircoTrend);
  $settings.find('#consider-futures-mirco-trend').prop('checked', settings.considerFuturesMircoTrend);

  await documentOnReady(statistics, {
    startDate,
    endDate,
  }, calculatePriceRebounds);

  $settings
    .find('input[type="text"]')
    .on('change', async function () {
      const className = $(this).attr('class');
      const newValue = parseFloat($(this).val());

      if (!newValue || Number.isNaN(newValue)) {
        return true;
      }

      switch (className) {
        case 'stoploss-percent': statistics.settings.stopLossPercent = newValue; break;
        case 'factor-for-price-change': statistics.settings.factorForPriceChange = newValue; break;

        case 'candles-for-calculate-average-percent': {
          settings.candlesForCalculateAveragePercent = newValue; break;
        }

        default: break;
      }

      if (statistics.choosenInstrumentId) {
        const instrumentId = statistics.choosenInstrumentId;

        statistics.reset({ instrumentId });

        instrumentsDocs.forEach(doc => {
          doc.my_trades = [];
        });

        statistics.loadCharts({ instrumentId });
        await statistics.calculateCandles({ instrumentId }, calculatePriceRebounds);
        statistics.makeReport();
      }
    });
});

/* Functions */

const calculatePriceRebounds = (originalData, currentCandle) => {
  const lOriginalData = originalData.length;

  if (!lOriginalData || lOriginalData < settings.candlesForCalculateAveragePercent) {
    return false;
  }

  let averagePercent = 0;

  for (let j = lOriginalData - settings.candlesForCalculateAveragePercent; j < lOriginalData; j += 1) {
    const candle = originalData[j];
    const isLong = candle.close > candle.open;

    const differenceBetweenPrices = isLong ?
      candle.high - candle.open : candle.open - candle.low;
    const percentPerPrice = 100 / (candle.open / differenceBetweenPrices);

    averagePercent += percentPerPrice;
  }

  averagePercent = parseFloat(
    (averagePercent / settings.candlesForCalculateAveragePercent).toFixed(2),
  );

  const isLong = currentCandle.close > currentCandle.open;

  const differenceBetweenPrices = Math.abs(
    isLong ? currentCandle.high - currentCandle.open : currentCandle.open - currentCandle.low,
  );

  const percentPerPrice = 100 / (currentCandle.open / differenceBetweenPrices);

  if (percentPerPrice > (averagePercent * settings.factorForPriceChange)) {
    const isLong = !(currentCandle.close > currentCandle.open);

    return {
      ...currentCandle,
      averagePercent,
      isLong,
    };
  }
};
