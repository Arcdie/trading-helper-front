/* global
functions,
objects, constants */

class IndicatorVolumeAverage {
  constructor(chart, { period }) {
    this.chart = chart;
    this.period = period;

    this.settings = {
      LIMIT_CANDLES: 200,
    };

    this.addMainSeries({
      color: constants.ORANGE_COLOR,
    });

    this.calculatedData = [];
  }

  addMainSeries(optionalParams) {
    this.mainSeries = this.chart.addLineSeries({
      priceLineSource: false,
      priceLineVisible: false,
      lastValueVisible: false,
      lineWidth: 1,

      ...optionalParams,
    });
  }

  calculateData(inputData) {
    const resultData = [];
    const workingData = [];

    inputData.forEach((candle, index) => {
      workingData.push(candle.volume);

      const currentData = workingData.slice(index - (this.settings.LIMIT_CANDLES - 1));
      const sum = currentData.reduce((i, volume) => i + volume, 0);
      const average = sum / currentData.length;

      resultData.push({
        time: candle.originalTimeUnix,
        value: average,
      });
    });

    return resultData;
  }

  calculateAndDraw(inputData) {
    const workingData = this.calculateData(inputData);
    this.drawSeries(this.mainSeries, workingData);

    return workingData;
  }

  drawSeries(series, data) {
    if (Array.isArray(data)) {
      series.setData(data);
    } else series.update(data);
  }
}
