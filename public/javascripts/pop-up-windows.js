const windows = {
  getTVChart(instrumentName, containerId = 'tradingview_532c8') {
    return `<div class="window tv-chart-window">
      <button class="close"></button>

      <div class="tradingview-widget-container">
        <div id="tradingview_532c8"></div>
        <script type="text/javascript">
          new TradingView.widget({
            "width": 980,
            "height": 610,
            "symbol": "${instrumentName}",
            "interval": "5",
            "timezone": "Etc/UTC",
            "theme": "light",
            "style": "1",
            "locale": "ru",
            "toolbar_bg": "#f1f3f6",
            "enable_publishing": false,
            "hide_legend": true,
            "hide_side_toolbar": false,
            "save_image": false,
            "container_id": "${containerId}"
          });
        </script>
      </div>
    </div>`;
  },

  getLevelsMonitoringSettings(settings) {
    console.log('settings', settings);
    return `<div class="window levels-monitroing-settings">
      <button class="close"></button>

      <div class="levels-monitroing-settings-container">
        <h2>Настройка уровней</h2>
        <div class="levels-settings">
          <ul>
            <li>
              <input type="checkbox" id="is_draw_levels_for_1h_candles" ${settings.is_draw_levels_for_1h_candles ? 'checked' : ''}>
              <label for="is_draw_levels_for_1h_candles">Рисовать уровни для часовых свеч</label>
            </li>

            <li>
              <input type="checkbox" id="is_draw_levels_for_4h_candles" ${settings.is_draw_levels_for_4h_candles ? 'checked' : ''}>
              <label for="is_draw_levels_for_4h_candles">Рисовать уровни для 4-х часовых свеч</label>
            </li>

            <li>
              <input type="checkbox" id="is_draw_levels_for_day_candles" ${settings.is_draw_levels_for_day_candles ? 'checked' : ''}>
              <label for="is_draw_levels_for_day_candles">Рисовать уровни для дневых свеч</label>
            </li>
          </ul>

          <div id="number_candles_for_calculate_1h_levels">
            <p>К-во свечей для расчета часовых уровней</p>
            <input type="text" value="${settings.number_candles_for_calculate_1h_levels || 10}">
          </div>

          <div id="number_candles_for_calculate_4h_levels">
            <p>К-во свечей для расчета 4х-часовых уровней</p>
            <input type="text" value="${settings.number_candles_for_calculate_4h_levels || 10}">
          </div>

          <div id="number_candles_for_calculate_day_levels">
            <p>К-во свечей для расчета дневных уровней</p>
            <input type="text" value="${settings.number_candles_for_calculate_day_levels || 10}">
          </div>

          <button id="save-settings">Сохранить</button>
        </div>
      </div>
    </div>`;
  },

  getVolumeMonitoringSettings(settings) {
    return `<div class="window volume-monitroing-settings">
      <button class="close"></button>

      <div class="volume-monitroing-settings-container">
        <h2>Spot</h2>
        <div class="spot-settings">
          <ul>
            <li>
              <input type="checkbox" id="spot-direction">
              <label for="spot-direction">Сортировка по % от цены</label>
            <li/>

            <li>
              <input type="checkbox" id="spot-lifetime">
              <label for="spot-lifetime">Сортировка по времени жизни</label>
            <li/>
          </ul>
        </div>

        <h2>Futures</h2>
        <div class="futures-settings">
          <ul>
            <li>
              <input type="checkbox" id="futures-direction">
              <label for="futures-direction">Сортировка по % от цены</label>
            <li/>
            <li>
              <input type="checkbox" id="futures-lifetime">
              <label for="futures-lifetime">Сортировка по времени жизни</label>
            <li/>
          </ul>
        </div>
      </div>
    </div>`;
  },

  // <iframe src="https://google.com" width="700" height="200" align="left">
  //    Ваш браузер не поддерживает плавающие фреймы!
  // </iframe>
};
