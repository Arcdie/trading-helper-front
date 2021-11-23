/* global
functions,
objects, ATR */

class IndicatorSuperTrend {
  constructor(chart) {
    this.chart = chart;

    this.factor = 3;
    this.artPeriod = 10;

    this.topSeries = this.chart.addAreaSeries({
      priceLineVisible: false,
      priceLineSource: false,
      lineWidth: 1,
      lineColor: 'rgb(255, 82, 82)',
      topColor: 'rgba(255, 82, 82, 0.1)',
    });

    this.bottomSeries = this.chart.addAreaSeries({
      priceLineVisible: false,
      priceLineSource: false,
      lineWidth: 1,
      lineColor: 'rgb(76, 175, 80)',
      topColor: 'rgba(76, 175, 80, 0.1)',
    });
  }

  calculateData(inputData) {
    const topOutputData = [];
    const bottomOutputData = [];
    const workingData = [...inputData];

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
        });

        topOutputData.push({
          time: data.time,
        });
      } else {
        topOutputData.push({
          value: superTrend,
          time: data.time,
        });

        bottomOutputData.push({
          time: data.time,
        });
      }
    });

    return {
      topOutputData,
      bottomOutputData,
    };
  }

  drawSeries(series, data) {
    if (Array.isArray(data)) {
      series.setData(data);
    } else series.update(data);
  }
}
