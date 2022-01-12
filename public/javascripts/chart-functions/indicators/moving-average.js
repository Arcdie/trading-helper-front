/* global
functions,
objects, */

class IndicatorMovingAverage {
  constructor(chart, {
    color,
    period,
  }) {
    this.chart = chart;

    this.period = period;

    this.addMainSeries({
      color,
    }, {});

    this.calculatedData = [];
  }

  addMainSeries(optionalParams, settings = {}) {
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
      workingData.push(candle.close);

      const currentData = workingData.slice(index - (this.period - 1));
      const sum = currentData.reduce((i, close) => i + close, 0);
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
