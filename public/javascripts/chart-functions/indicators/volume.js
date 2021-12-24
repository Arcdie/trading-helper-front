/* global
functions,
objects, LightweightCharts */

class IndicatorVolume {
  constructor($rootContainer) {
    this.containerName = 'chart-volume';
    this.appendChart($rootContainer);

    this.$containerDocument = $rootContainer.find(`.${this.containerName}`);
    this.containerWidth = this.$containerDocument[0].clientWidth;
    this.containerHeight = this.$containerDocument[0].clientHeight;

    this.addChart();
    this.addMainSeries({});

    this.extraSeries = [];
  }

  appendChart($rootContainer) {
    $rootContainer.append(`<div class="${this.containerName}"></div>`);
  }

  addChart() {
    this.chart = LightweightCharts.createChart(this.$containerDocument[0], {
      width: this.containerWidth,
      height: this.containerHeight,
    });

    this.chart.applyOptions({
      layout: {
        backgroundColor: 'white',
      },

      crosshair: {
        mode: 0,
      },

      timeScale: {
        secondsVisible: false,
      },

      rightPriceScale: {
        width: 60,
      },
    });
  }

  addMainSeries(optionalParams) {
    this.mainSeries = this.chart.addHistogramSeries({
      color: 'rgba(12, 50, 153, .5)',

      priceFormat: {
        type: 'volume',
      },

      ...optionalParams,
    });
  }

  addExtraSeries(optionalParams) {
    const newExtraSeries = this.chart.addLineSeries({
      priceLineSource: false,
      priceLineVisible: false,
      lastValueVisible: true,
      lineWidth: 1,

      ...optionalParams,
      // lineType: LightweightCharts.LineType.Simple,
      // lineStyle: LightweightCharts.LineStyle.LargeDashed,
    });

    newExtraSeries.id = new Date().getTime();
    this.extraSeries.push(newExtraSeries);
    return newExtraSeries;
  }

  removeChart() {
    this.removeSeries(this.mainSeries);
    this.chart.remove();
  }

  removeSeries(series, isMainSeries) {
    this.chart.removeSeries(series);

    if (isMainSeries) {
      this.mainSeries = false;
    } else {
      this.extraSeries = this.extraSeries.filter(
        extraSeries => extraSeries.id !== series.id,
      );
    }
  }

  drawSeries(series, data) {
    if (Array.isArray(data)) {
      series.setData(data);
    } else {
      series.update(data);
    }
  }
}
