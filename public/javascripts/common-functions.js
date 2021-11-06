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

/* Functions */
const getRandomNumber = (min, max) => {
  return Math.floor(Math.random() * (max - min)) + min;
};

const getUnix = targetDate =>
  parseInt((targetDate ? new Date(targetDate) : new Date()).getTime() / 1000, 10);

const initPopWindow = (str) => {
  $modalWindow
    .find('div.md-content')
    .empty()
    .append(str);

  classie.add($modalWindow);
};

const makeRequest = async ({
  url, method, body, settings,
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

    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body && Object.keys(body).length > 0) {
    objRequest.body = JSON.stringify(body);
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
