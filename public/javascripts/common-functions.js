/* global */

/* Constants */
const classie = {
  has($elem) {
    return $elem.hasClass('md-show');
  },

  add($elem) { $elem.addClass('md-show'); },
  remove($elem) { $elem.removeClass('md-show'); },
};

/* JQuery */
const $mdcontent = $('div.md-content');
const $modalWindow = $('div.pop-up div.md-modal');

/* Variables */
const constants = {
  RED_COLOR: '#FF5252',
  GREEN_COLOR: '#4CAF50',
  YELLOW_COLOR: '#FFE002',
};

/* Functions */
const sleep = ms => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

const getRandomNumber = (min, max) => {
  return Math.floor(Math.random() * (max - min)) + min;
};

const getUnix = targetDate =>
  parseInt((targetDate ? new Date(targetDate) : new Date()).getTime() / 1000, 10);

const getQueue = (arr, limiter) => {
  const queues = [];
  const lArr = arr.length;

  let targetIndex = 0;
  const numberIterations = Math.ceil(lArr / limiter);

  for (let i = 0; i < numberIterations; i += 1) {
    const newQueue = [];

    let conditionValue = limiter;

    if (i === (numberIterations - 1)) {
      conditionValue = lArr - targetIndex;
    }

    for (let j = 0; j < conditionValue; j += 1) {
      newQueue.push(arr[targetIndex]);
      targetIndex += 1;
    }

    queues.push(newQueue);
  }

  return queues;
};

const initPopWindow = (str) => {
  $modalWindow
    .find('div.md-content')
    .empty()
    .append(str);

  classie.add($modalWindow);
};

const makeRequest = async ({
  url, method, query, body, settings,
}) => {
  if (!url) {
    alert('No url');
    return false;
  }

  if (!method) {
    alert('No method');
    return false;
  }

  const objRequest = {
    method,
  };

  if (method !== 'GET') {
    objRequest.headers = {
      'Content-Type': 'application/json',
    };
  }

  if (body && Object.keys(body).length > 0) {
    objRequest.body = JSON.stringify(body);
  }

  if (query && Object.keys(query).length > 0) {
    url += '?';

    Object.keys(query).forEach(key => {
      url += `${key}=${query[key]}&`;
    });

    url = url.substring(0, url.length - 1);
  }

  if (settings && Object.keys(settings).length > 0) {
    Object.keys(settings).forEach(key => {
      objRequest[key] = settings[key];
    });
  }

  const response = await fetch(url, objRequest);
  const result = await response.json();
  return result;
};

$(document).ready(() => {
  $('div.pop-up div.shadow').click(() => {
    classie.remove($modalWindow);
  });

  $mdcontent
    .on('click', 'button.close', () => {
      classie.remove($modalWindow);
    });
});
