/* global
functions,
objects, ATR */

class IndicatorSuperTrend {
  constructor(chart, {
    factor,
    artPeriod,
    candlesPeriod,
  }) {
    this.chart = chart;

    this.factor = factor;
    this.artPeriod = artPeriod;

    this.candlesPeriod = candlesPeriod;

    this.topSeries = [];
    this.bottomSeries = [];
  }

  addTopSeries() {
    return this.chart.addLineSeries({
      priceLineSource: false,
      priceLineVisible: false,
      lastValueVisible: false,
      lineWidth: 1,
      color: 'rgb(255, 82, 82)',
      // topColor: 'rgba(255, 82, 82, 0.1)',
    });
  }

  addBottomSeries() {
    return this.chart.addLineSeries({
      priceLineSource: false,
      priceLineVisible: false,
      lastValueVisible: false,
      lineWidth: 1,
      color: 'rgb(76, 175, 80)',
      // topColor: 'rgba(76, 175, 80, 0.1)',
    });
  }

  calculateAndDraw(inputData) {
    const topOutputData = [];
    const bottomOutputData = [];
    const workingData = JSON.parse(JSON.stringify(inputData));

    const dataForCalculate = {
      high: [],
      low: [],
      close: [],
      period: this.artPeriod,
    };

    workingData.forEach(data => {
      dataForCalculate.low.push(data.low);
      dataForCalculate.high.push(data.high);
      dataForCalculate.close.push(data.close);
    });

    const arrAtr = ATR.calculate(dataForCalculate);

    workingData.forEach((data, index) => {
      if (index < this.artPeriod) {
        return true;
      }

      const hl2 = (data.high + data.low) / 2;
      const prevData = workingData[index - 1];
      const atr = arrAtr[index - this.artPeriod];

      let topBand = hl2 + (this.factor * atr);
      let bottomBand = hl2 - (this.factor * atr);

      const prevAtr = prevData.atr;
      const prevClose = prevData.close;
      const prevTopBand = prevData.topBand || 0;
      const prevBottomBand = prevData.bottomBand || 0;
      const prevSuperTrend = prevData.superTrend || 0;

      topBand = (topBand < prevTopBand || prevClose > prevTopBand) ? topBand : prevTopBand;
      bottomBand = (bottomBand > prevBottomBand || prevClose < prevBottomBand) ? bottomBand : prevBottomBand;

      let direction = 0;
      let superTrend = 0;

      if (!prevAtr || Number.isNaN(prevAtr)) {
        direction = 1;
      } else if (prevSuperTrend === prevTopBand) {
        direction = data.close > topBand ? -1 : 1;
      } else {
        direction = data.close < bottomBand ? 1 : -1;
      }

      superTrend = direction === -1 ? bottomBand : topBand;

      data.atr = atr;
      data.topBand = topBand;
      data.bottomBand = bottomBand;
      data.superTrend = superTrend;

      if (direction < 0) {
        bottomOutputData.push({
          value: superTrend,
          time: data.time,
          originalTimeUnix: data.originalTimeUnix,
        });
      } else {
        topOutputData.push({
          value: superTrend,
          time: data.time,
          originalTimeUnix: data.originalTimeUnix,
        });
      }
    });

    const newTopSeries = [];
    const newBottomSeries = [];

    let increment = 0;

    switch (this.candlesPeriod) {
      case '1m': increment = 60; break;
      case '5m': increment = 60 * 5; break;
      case '1h': increment = 60 * 60; break;
      case '4h': increment = 4 * 60 * 60; break;
      case '1d': increment = 24 * 60 * 60; break;
      default: break;
    }

    let newSeriesData = [];

    topOutputData.forEach((data, index) => {
      const prevData = topOutputData[index - 1];

      if (!prevData) {
        newSeriesData.push(data);
        return true;
      }

      const timeUnix = data.originalTimeUnix;
      const prevTimeUnix = prevData.originalTimeUnix;

      const differenceBetweenTime = timeUnix - prevTimeUnix;

      if (differenceBetweenTime === increment) {
        newSeriesData.push(data);
        return true;
      }

      // newSeriesData.push(data);
      const newSeries = this.addTopSeries();
      this.drawSeries(newSeries, newSeriesData);
      newTopSeries.push(newSeries);

      newSeriesData = [data];
    });

    let newSeries = this.addTopSeries();
    this.drawSeries(newSeries, newSeriesData);
    newTopSeries.push(newSeries);

    newSeriesData = [];

    bottomOutputData.forEach((data, index) => {
      const prevData = bottomOutputData[index - 1];

      if (!prevData) {
        newSeriesData.push(data);
        return true;
      }

      const timeUnix = data.originalTimeUnix;
      const prevTimeUnix = prevData.originalTimeUnix;

      const differenceBetweenTime = timeUnix - prevTimeUnix;

      if (differenceBetweenTime === increment) {
        newSeriesData.push(data);
        return true;
      }

      const newSeries = this.addBottomSeries();
      this.drawSeries(newSeries, newSeriesData);
      newBottomSeries.push(newSeries);

      newSeriesData = [data];
    });

    newSeries = this.addBottomSeries();
    this.drawSeries(newSeries, newSeriesData);
    newBottomSeries.push(newSeries);

    this.topSeries.unshift(...newTopSeries);
    this.bottomSeries.unshift(...newBottomSeries);
  }

  drawSeries(series, data) {
    if (Array.isArray(data)) {
      series.setData(data);
    } else series.update(data);
  }
}
